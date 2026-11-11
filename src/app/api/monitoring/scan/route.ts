// TRADE LINK — Account Scanner API (Part 7, 22)
//
// This endpoint scans the user's connected broker accounts for position changes.
// When changes are detected, it:
// 1. Creates/updates SourcePosition records
// 2. For each active replication config, mirrors the trade to the destination account
// 3. Creates DestinationPosition records
// 4. Sends notifications
//
// The frontend calls this endpoint periodically (every 5-10 seconds) to keep
// positions in sync. This is the "copied account monitoring" approach.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import { getAccountConnector } from "@/lib/broker/connector";
import { diffPositions, calculateMirrorVolume } from "@/lib/engine/position-monitor";
import { sendNotification } from "@/lib/notify";
import { publishUserTradeEvent } from "@/lib/event-publisher";
import type { BrokerCode } from "@/lib/types";
import { hasServiceBearer } from "@/lib/service-auth";

export async function GET(req: NextRequest) {
  if (!hasServiceBearer(req, "SCANNER_WORKER_TOKEN")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accounts = await db.brokerAccount.findMany({
    where: { status: "connected", terminalBridge: { is: { status: "connected" } }, sourceReplicationConfigs: { some: { status: "active" } } },
    select: { id: true }, orderBy: { lastSyncedAt: "asc" }, take: 100,
  });
  return NextResponse.json({ accountIds: accounts.map((account) => account.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { brokerAccountId } = body as { brokerAccountId?: string };
    const workerRequest = hasServiceBearer(req, "SCANNER_WORKER_TOKEN");
    const user = workerRequest
      ? (brokerAccountId ? await db.user.findFirst({ where: { brokerAccounts: { some: { id: brokerAccountId } } } }) : null)
      : await requireUser();
    if (!user) return NextResponse.json({ error: workerRequest ? "Account not found" : "Unauthorized" }, { status: workerRequest ? 404 : 401 });

    const scanStart = Date.now();

    const accounts = await db.brokerAccount.findMany({
      where: {
        userId: user.id,
        status: "connected",
        ...(brokerAccountId ? { id: brokerAccountId } : {}),
      },
      include: {
        sourceReplicationConfigs: {
          where: { status: "active" },
          include: { brokerAccount: true, provider: { include: { statistic: true } } },
        },
      },
    });

    const allEvents: any[] = [];
    let totalMirrored = 0;
    let totalErrors = 0;

    for (const account of accounts) {
      try {
        const connector = await getAccountConnector(
          account.brokerCode as BrokerCode,
          account.id,
          {
            accountId: account.externalAccountId ?? undefined,
            startingBalance: account.balance,
            currency: account.currency,
            leverage: account.leverage ?? undefined,
            accountType: account.accountType as any,
          },
        );

        const livePositions = await connector.getOpenPositions();

        const previousPositions = await db.sourcePosition.findMany({
          where: { replicationConfig: { sourceBrokerAccountId: account.id }, state: "open" },
          select: { id: true, externalPositionId: true, volume: true, stopLoss: true, takeProfit: true, instrument: true, direction: true, entryPrice: true, state: true },
        });

        const { events, summary } = diffPositions(
          livePositions,
          previousPositions.map(p => ({ externalPositionId: p.externalPositionId ?? "", volume: p.volume, stopLoss: p.stopLoss, takeProfit: p.takeProfit, instrument: p.instrument, direction: p.direction, entryPrice: p.entryPrice, state: p.state })),
        );

        const detectionLatencyMs = Date.now() - scanStart;

        for (const event of events) {
          event.detectionLatencyMs = detectionLatencyMs;
          allEvents.push({ ...event, brokerAccountId: account.id, brokerCode: account.brokerCode });

          const sourcePositions = previousPositions.filter(p => p.externalPositionId === event.externalPositionId);

          for (const config of account.sourceReplicationConfigs) {
            const sourceName = config.provider?.name ?? account.accountLabel;
            const streamEvent = {
              eventId: `${account.id}:${config.id}:${event.externalPositionId}:${event.detectedAt.getTime()}:${event.type}`,
              providerId: config.provider?.id ?? account.id,
              providerName: sourceName,
              type: event.type,
              instrument: event.instrument,
              direction: event.direction,
              volume: event.volume,
              entryPrice: event.entryPrice,
              stopLoss: event.stopLoss,
              takeProfit: event.takeProfit,
              timestamp: event.detectedAt.toISOString(),
              detectionLatencyMs,
            };
            void publishUserTradeEvent(user.id, streamEvent);
          }

          if (event.type === "open") {
            for (const config of account.sourceReplicationConfigs) {
              const sourceName = config.provider?.name ?? account.accountLabel;
              // Approval and notification modes must never place orders here.
              if (config.executionMode !== "auto") continue;
              if (!config.brokerAccount.isDemo && !config.brokerAccount.isLiveAuthorized) {
                totalErrors++;
                continue;
              }
              if (config.brokerAccount.status !== "connected" || (!config.brokerAccount.isDemo && !config.brokerAccount.isLiveAuthorized)) {
                totalErrors++;
                continue;
              }
              if (!["mt4", "mt5"].includes(config.brokerAccount.brokerCode)) {
                totalErrors++;
                continue;
              }
              const mirrorVolume = calculateMirrorVolume(
                event, account.equity, config.brokerAccount.equity,
                config.sizingMode as any, config.equityMultiplier,
                config.fixedLotSize ?? undefined, config.minLotSize ?? 0.01, config.maxLotSize ?? 100, 0.01,
              );
              if (mirrorVolume <= 0) continue;

              const externalTradeId = `bridge:${account.id}:${event.externalPositionId}:${event.openTime.getTime()}`;
              let sourcePosition;
              try {
                sourcePosition = await db.sourcePosition.create({
                  data: {
                  replicationConfigId: config.id,
                  externalTradeId,
                  externalPositionId: event.externalPositionId,
                  instrument: event.instrument, direction: event.direction,
                  entryPrice: event.entryPrice, volume: event.volume,
                  stopLoss: event.stopLoss, takeProfit: event.takeProfit,
                  orderType: "market", openTime: event.openTime, state: "open", detectionLatencyMs,
                  },
                });
              } catch (error: any) {
                if (error?.code === "P2002") continue;
                throw error;
              }

              try {
                const destAccount = config.brokerAccount;
                const destConnector = await getAccountConnector(
                  destAccount.brokerCode as BrokerCode, destAccount.id,
                  { accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency },
                );
                const orderResult = await destConnector.placeOrder({
                  idempotencyKey: `copy-open:${config.id}:${sourcePosition.id}`,
                  instrument: event.instrument, direction: event.direction,
                  volume: mirrorVolume, orderType: "market",
                  stopLoss: config.replicateStopLoss ? event.stopLoss : undefined,
                  takeProfit: config.replicateTakeProfit ? event.takeProfit : undefined,
                });

                if (orderResult.success) {
                  await db.destinationPosition.create({
                    data: {
                      brokerAccountId: destAccount.id, sourcePositionId: sourcePosition.id,
                      externalTradeId: orderResult.orderId, externalPositionId: orderResult.positionId,
                      instrument: event.instrument, direction: event.direction,
                      entryPrice: orderResult.executedPrice ?? event.entryPrice,
                      volume: orderResult.executedVolume ?? mirrorVolume,
                      stopLoss: config.replicateStopLoss ? event.stopLoss : null,
                      takeProfit: config.replicateTakeProfit ? event.takeProfit : null,
                      orderType: "market", openTime: new Date(), state: "open",
                      executionDelayMs: orderResult.executionDelayMs,
                    },
                  });
                  totalMirrored++;
                  await sendNotification(user.id, {
                    type: "trade_opened", title: "TRADE OPENED",
                    body: `Source: ${sourceName} | ${event.instrument} | ${event.direction} | Source: ${event.volume} | Dest: ${mirrorVolume} | Entry: ${event.entryPrice} | Replication: Successful`,
                    severity: "success",
                  });
                } else {
                  totalErrors++;
                  await sendNotification(user.id, {
                    type: "replication_failed", title: "REPLICATION FAILED",
                    body: `${sourceName} | ${event.instrument} | ${orderResult.rejectionReason ?? "Unknown"}`,
                    severity: "error",
                  });
                }
              } catch (e: any) { totalErrors++; console.error("[mirror]", e.message); }
            }
          } else if (event.type === "close" && sourcePositions.length) {
            for (const sourcePos of sourcePositions) {
            const destPositions = await db.destinationPosition.findMany({ where: { sourcePositionId: sourcePos.id, state: "open" } });
            let allDestinationsClosed = true;
            for (const destPos of destPositions) {
              try {
                const destAccount = await db.brokerAccount.findUnique({ where: { id: destPos.brokerAccountId } });
                if (!destAccount) { allDestinationsClosed = false; continue; }
                if (!destPos.externalPositionId) throw new Error("Destination position has no terminal ticket");
                const destConnector = await getAccountConnector(destAccount.brokerCode as BrokerCode, destAccount.id, { accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency });
                const closeResult = await destConnector.closePosition(destPos.externalPositionId ?? "", undefined, `copy-close:${config.id}:${sourcePos.id}:${destPos.id}`);
                if (!closeResult.success) throw new Error(closeResult.rejectionReason ?? "Terminal rejected close");
                await db.destinationPosition.update({ where: { id: destPos.id }, data: { state: "closed", closeTime: new Date(), exitPrice: closeResult.closedPrice, grossProfit: closeResult.realizedProfit, netProfit: closeResult.realizedProfit } });
                await sendNotification(user.id, {
                  type: "trade_closed", title: "TRADE CLOSED",
                  body: `${event.instrument} | Source closed | Dest P/L: ${closeResult.realizedProfit?.toFixed(2) ?? "—"}`,
                  severity: (closeResult.realizedProfit ?? 0) >= 0 ? "success" : "warning",
                });
              } catch (e: any) { totalErrors++; allDestinationsClosed = false; console.error("[mirror] destination close failed", e.message); }
            }
            if (allDestinationsClosed) await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { state: "closed", closeTime: event.closeTime, exitPrice: event.exitPrice } });
            }
          } else if (event.type === "partial_close" && sourcePositions.length) {
            for (const sourcePos of sourcePositions) {
            if (!config.replicatePartialClosures) {
              await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { volume: event.volume, state: "open" } });
              continue;
            }
            const destPositions = await db.destinationPosition.findMany({ where: { sourcePositionId: sourcePos.id, state: "open" } });
            let allDestinationsUpdated = true;
            for (const destPos of destPositions) {
              const closeRatio = event.previousVolume && event.previousVolume > 0 ? (event.previousVolume - event.volume) / event.previousVolume : 0;
              const closeVolume = destPos.volume * closeRatio;
              if (closeVolume > 0.01) {
                try {
                  const destAccount = await db.brokerAccount.findUnique({ where: { id: destPos.brokerAccountId } });
                  if (!destAccount) { allDestinationsUpdated = false; continue; }
                  if (!destPos.externalPositionId) throw new Error("Destination position has no terminal ticket");
                  const destConnector = await getAccountConnector(destAccount.brokerCode as BrokerCode, destAccount.id, { accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency });
                  const closeKey = `copy-partial:${config.id}:${sourcePos.id}:${destPos.id}:${event.volume}`;
                  const closeResult = await destConnector.closePosition(destPos.externalPositionId ?? "", closeVolume, closeKey);
                  if (!closeResult.success) throw new Error(closeResult.rejectionReason ?? "Terminal rejected partial close");
                  await db.destinationPosition.update({ where: { id: destPos.id }, data: { volume: destPos.volume - closeVolume } });
                } catch (e: any) { totalErrors++; allDestinationsUpdated = false; console.error("[mirror] destination partial close failed", e.message); }
              }
            }
            if (allDestinationsUpdated) await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { volume: event.volume, state: "open" } });
            }
          } else if (event.type === "modify" && sourcePositions.length) {
            for (const sourcePos of sourcePositions) {
            if (!config.replicateModifications) {
              await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { stopLoss: event.stopLoss, takeProfit: event.takeProfit } });
              continue;
            }
            const destPositions = await db.destinationPosition.findMany({ where: { sourcePositionId: sourcePos.id, state: "open" } });
            let allDestinationsUpdated = true;
            for (const destPos of destPositions) {
              try {
                const destAccount = await db.brokerAccount.findUnique({ where: { id: destPos.brokerAccountId } });
                if (!destAccount) { allDestinationsUpdated = false; continue; }
                if (!destPos.externalPositionId) throw new Error("Destination position has no terminal ticket");
                const destConnector = await getAccountConnector(destAccount.brokerCode as BrokerCode, destAccount.id, { accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency });
                const stopLoss = config.replicateStopLoss ? event.stopLoss ?? 0 : destPos.stopLoss ?? 0;
                const takeProfit = config.replicateTakeProfit ? event.takeProfit ?? 0 : destPos.takeProfit ?? 0;
                const modifyHash = createHash("sha256").update(JSON.stringify([stopLoss, takeProfit])).digest("hex").slice(0, 24);
                const modifyResult = await destConnector.modifyPosition(destPos.externalPositionId, { stopLoss, takeProfit }, `copy-modify:${config.id}:${sourcePos.id}:${destPos.id}:${modifyHash}`);
                if (!modifyResult.success) throw new Error(modifyResult.rejectionReason ?? "Terminal rejected modification");
                await db.destinationPosition.update({ where: { id: destPos.id }, data: { stopLoss: config.replicateStopLoss ? event.stopLoss ?? null : destPos.stopLoss, takeProfit: config.replicateTakeProfit ? event.takeProfit ?? null : destPos.takeProfit } });
              } catch (e: any) { totalErrors++; allDestinationsUpdated = false; console.error("[mirror] destination modification failed", e.message); }
            }
            if (allDestinationsUpdated) await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { stopLoss: event.stopLoss, takeProfit: event.takeProfit } });
            }
          }
        }

        if (events.length > 0) {
          console.log(`[scan] ${account.accountLabel}: ${summary.opens} opens, ${summary.closes} closes, ${summary.partialCloses} partials, ${summary.modifications} mods`);
        }
      } catch (e: any) {
        console.error(`[scan] error on account ${account.id}:`, e.message);
      }
    }

    await audit({ userId: user.id, action: "monitoring.scan", result: totalErrors > 0 ? "warning" : "success", details: { accountsScanned: accounts.length, events: allEvents.length, mirrored: totalMirrored, errors: totalErrors } });

    return NextResponse.json({
      events: allEvents, mirrored: totalMirrored, errors: totalErrors,
      summary: { accountsScanned: accounts.length, totalEvents: allEvents.length, opens: allEvents.filter(e => e.type === "open").length, closes: allEvents.filter(e => e.type === "close").length, partialCloses: allEvents.filter(e => e.type === "partial_close").length, modifications: allEvents.filter(e => e.type === "modify").length },
    });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[scan]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
