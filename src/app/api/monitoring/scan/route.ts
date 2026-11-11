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

async function closeOnce(idempotencyKey: string, sourcePositionId: string, execute: () => Promise<any>) {
  const existing = await db.executionEvent.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.status === "processed") {
      try { return JSON.parse(existing.payload).result; } catch { /* fail closed below */ }
    }
    return { success: false, rejectionReason: "This close command was already attempted; reconcile the broker position before retrying" };
  }

  let ledger;
  try {
    ledger = await db.executionEvent.create({ data: {
      idempotencyKey, sourcePositionId, eventType: "close", status: "pending",
      payload: JSON.stringify({ submittedAt: new Date().toISOString() }),
    } });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    return { success: false, rejectionReason: "A concurrent close command already exists; reconcile the broker position before retrying" };
  }
  try {
    const result = await execute();
    await db.executionEvent.update({ where: { id: ledger.id }, data: {
      status: result.success ? "processed" : "failed", processedAt: result.success ? new Date() : null,
      payload: JSON.stringify({ result }),
    } });
    return result;
  } catch (error) {
    await db.executionEvent.update({ where: { id: ledger.id }, data: {
      status: "failed", payload: JSON.stringify({ ambiguous: true, message: error instanceof Error ? error.message.slice(0, 300) : "Close request failed" }),
    } }).catch(() => undefined);
    return { success: false, rejectionReason: "The close result is uncertain; reconcile the broker position before retrying" };
  }
}

export async function GET(req: NextRequest) {
  if (!hasServiceBearer(req, "SCANNER_WORKER_TOKEN")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accounts = await db.brokerAccount.findMany({
    where: { status: "connected", OR: [{ terminalBridge: { is: { status: "connected" } } }, { brokerCode: { in: ["ctrader", "deriv"] }, authMethod: "oauth" }], sourceReplicationConfigs: { some: { status: "active" } } },
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

        let sourceInfo: Awaited<ReturnType<typeof connector.getAccountInfo>>;
        let livePositions: Awaited<ReturnType<typeof connector.getOpenPositions>>;
        if (connector.getAccountSnapshot) {
          const snapshot = await connector.getAccountSnapshot();
          sourceInfo = snapshot.accountInfo;
          livePositions = snapshot.positions;
        } else {
          [sourceInfo, livePositions] = await Promise.all([connector.getAccountInfo(), connector.getOpenPositions()]);
        }
        await db.brokerAccount.update({ where: { id: account.id }, data: {
          currency: sourceInfo.currency, balance: sourceInfo.balance, equity: sourceInfo.equity,
          margin: sourceInfo.margin, freeMargin: sourceInfo.freeMargin, leverage: sourceInfo.leverage,
          accountType: sourceInfo.accountType, lastSyncedAt: new Date(),
        } });
        const previousPositions = await db.sourcePosition.findMany({
          where: { replicationConfig: { sourceBrokerAccountId: account.id }, state: "open" },
          select: { id: true, replicationConfigId: true, externalPositionId: true, volume: true, stopLoss: true, takeProfit: true, instrument: true, direction: true, entryPrice: true, state: true },
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
              brokerCode: account.brokerCode,
              type: event.type,
              instrument: event.instrument,
              direction: event.direction,
              volume: event.volume,
              entryPrice: event.entryPrice,
              stopLoss: event.stopLoss,
              takeProfit: event.takeProfit,
              timestamp: event.detectedAt.toISOString(),
              detectionLatencyMs,
              productMetadata: event.productMetadata,
            };
            void publishUserTradeEvent(user.id, streamEvent);
          }

          if (event.type === "open") {
            for (const config of account.sourceReplicationConfigs) {
              const sourceName = config.provider?.name ?? account.accountLabel;
              if (account.brokerCode === "deriv") {
                const externalTradeId = `deriv:${account.id}:${event.externalPositionId}:${event.openTime.getTime()}`;
                const sourcePosition = await db.sourcePosition.upsert({
                  where: { replicationConfigId_externalTradeId: { replicationConfigId: config.id, externalTradeId } },
                  create: { replicationConfigId: config.id, externalTradeId, externalPositionId: event.externalPositionId,
                    instrument: event.instrument, direction: event.direction, entryPrice: event.entryPrice, volume: event.volume,
                    orderType: "options_contract", openTime: event.openTime, state: "open",
                    productMetadata: JSON.stringify(event.productMetadata ?? {}), detectionLatencyMs },
                  update: { state: "open", volume: event.volume, productMetadata: JSON.stringify(event.productMetadata ?? {}) },
                });
                const destAccount = config.brokerAccount;
                if (config.executionMode !== "auto") continue;
                if (destAccount.brokerCode !== "deriv") { totalErrors++; continue; }
                if (destAccount.status !== "connected" || (!destAccount.isDemo && !destAccount.isLiveAuthorized)) { totalErrors++; continue; }
                const product = event.productMetadata ?? {};
                const sourceCurrency = String(product.currency ?? "").toUpperCase();
                if (!sourceCurrency || sourceCurrency !== destAccount.currency.toUpperCase()) { totalErrors++; continue; }
                const priorDestination = await db.destinationPosition.findFirst({ where: { sourcePositionId: sourcePosition.id, brokerAccountId: destAccount.id } });
                if (priorDestination) continue;

                let stake = event.volume;
                if (config.sizingMode === "fixed_lot") stake = config.fixedLotSize ?? 0;
                else if (config.sizingMode === "fixed_multiplier") stake *= config.equityMultiplier;
                else if (config.sizingMode === "risk_based") stake = destAccount.equity * (config.riskPerTradePct ?? 1) / 100;
                else stake = sourceInfo.equity > 0 ? stake * (destAccount.equity / sourceInfo.equity) * config.equityMultiplier : 0;
                if (config.maxLotSize != null) stake = Math.min(stake, config.maxLotSize);
                stake = Math.floor(stake * 100 + 1e-8) / 100;
                if (!Number.isFinite(stake) || stake <= 0 || (config.minLotSize != null && stake < config.minLotSize)) { totalErrors++; continue; }

                const openKey = `deriv-copy-open:${config.id}:${sourcePosition.id}`;
                let ledger;
                try {
                  ledger = await db.executionEvent.create({ data: { idempotencyKey: openKey, sourcePositionId: sourcePosition.id,
                    eventType: "open", status: "pending", payload: JSON.stringify({ stake, currency: sourceCurrency }) } });
                } catch (error: any) {
                  if (error?.code !== "P2002") throw error;
                  totalErrors++;
                  continue;
                }
                try {
                  const destConnector = await getAccountConnector("deriv", destAccount.id, {
                    accountId: destAccount.externalAccountId ?? undefined, currency: destAccount.currency,
                  });
                  const orderResult = await destConnector.placeOrder({
                    idempotencyKey: openKey, instrument: event.instrument, direction: event.direction,
                    volume: stake, orderType: "market", productMetadata: product,
                  });
                  await db.executionEvent.update({ where: { id: ledger.id }, data: {
                    status: orderResult.success ? "processed" : "failed", processedAt: orderResult.success ? new Date() : null,
                    payload: JSON.stringify({ stake, result: orderResult }),
                  } });
                  if (!orderResult.success || !orderResult.positionId) {
                    totalErrors++;
                    await sendNotification(user.id, { type: "replication_failed", title: "DERIV COPY FAILED",
                      body: `${sourceName} | ${event.instrument} ${String(product.contractType ?? "Options")} | ${orderResult.rejectionReason ?? "Deriv rejected the contract"}`,
                      severity: "error" });
                    continue;
                  }
                  await db.destinationPosition.create({ data: {
                    brokerAccountId: destAccount.id, sourcePositionId: sourcePosition.id,
                    externalTradeId: orderResult.orderId, externalPositionId: orderResult.positionId,
                    instrument: event.instrument, direction: event.direction,
                    entryPrice: orderResult.executedPrice ?? event.entryPrice, volume: orderResult.executedVolume ?? stake,
                    orderType: "options_contract", openTime: new Date(), state: "open",
                    executionDelayMs: orderResult.executionDelayMs,
                  } });
                  await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "open" } });
                  totalMirrored++;
                  await sendNotification(user.id, { type: "trade_opened", title: "DERIV CONTRACT COPIED",
                    body: `${event.instrument} ${String(product.contractType)} | Stake: ${orderResult.executedVolume ?? stake} ${sourceCurrency} | Source expiry mirrored with remaining duration` ,
                    severity: "success" });
                } catch (error) {
                  await db.executionEvent.update({ where: { id: ledger.id }, data: {
                    status: "failed", payload: JSON.stringify({ stake, ambiguous: true, message: error instanceof Error ? error.message.slice(0, 240) : "Deriv order failed" }),
                  } }).catch(() => undefined);
                  totalErrors++;
                  await sendNotification(user.id, { type: "replication_failed", title: "DERIV COPY NEEDS RECONCILIATION",
                    body: `${event.instrument} | The purchase result is uncertain. Check both Deriv accounts before retrying.`, severity: "error" });
                  console.error("[mirror:deriv] order result needs reconciliation", error instanceof Error ? error.message : "unknown error");
                }
                continue;
              }
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
              if (!["mt4", "mt5", "ctrader"].includes(config.brokerAccount.brokerCode)) {
                totalErrors++;
                continue;
              }
              const destAccount = config.brokerAccount;
              const [sourceSpec, destConnector, approvedMapping] = await Promise.all([
                connector.getInstrumentSpec(event.instrument),
                getAccountConnector(destAccount.brokerCode as BrokerCode, destAccount.id, {
                  accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency,
                }),
                db.instrumentMapping.findFirst({ where: {
                  sourceBroker: account.brokerCode, sourceSymbol: event.instrument,
                  destBroker: destAccount.brokerCode, approved: true,
                  OR: [{ userId: user.id }, { userId: null }],
                } }),
              ]);
              const destSymbol = approvedMapping?.destSymbol ?? event.instrument;
              const destSpec = await destConnector.getInstrumentSpec(destSymbol);
              if (!sourceSpec || !destSpec || sourceSpec.contractSize <= 0 || destSpec.contractSize <= 0 || destSpec.volumeStep <= 0) {
                totalErrors++;
                console.error(`[mirror] missing contract or volume metadata for ${account.brokerCode}:${event.instrument} -> ${destAccount.brokerCode}:${destSymbol}`);
                continue;
              }
              const minVolume = Math.max(destSpec.minVolume, config.minLotSize ?? destSpec.minVolume);
              const maxVolume = Math.min(destSpec.maxVolume, config.maxLotSize ?? destSpec.maxVolume);
              if (maxVolume < minVolume) { totalErrors++; continue; }
              const mirrorVolume = calculateMirrorVolume(
                event, sourceInfo.equity, destAccount.equity,
                config.sizingMode as any, config.equityMultiplier,
                config.fixedLotSize ?? undefined, minVolume, maxVolume, destSpec.volumeStep,
                sourceSpec.contractSize / destSpec.contractSize,
                config.riskPerTradePct ?? 1, destSpec.tickSize, destSpec.tickValue,
              );
              if (mirrorVolume <= 0) continue;

              const externalTradeId = `${account.brokerCode}:${account.id}:${event.externalPositionId}:${event.openTime.getTime()}`;
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
                  orderType: "market", openTime: event.openTime, state: "rejected", detectionLatencyMs,
                  },
                });
              } catch (error: any) {
                if (error?.code !== "P2002") throw error;
                sourcePosition = await db.sourcePosition.findUnique({ where: { replicationConfigId_externalTradeId: { replicationConfigId: config.id, externalTradeId } } });
                if (!sourcePosition) throw error;
                const priorDestination = await db.destinationPosition.findFirst({ where: { sourcePositionId: sourcePosition.id, brokerAccountId: config.brokerAccount.id, state: "open" } });
                if (priorDestination) {
                  if (sourcePosition.state !== "open") await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "open" } });
                  continue;
                }
              }

              try {
                const orderResult = await destConnector.placeOrder({
                  idempotencyKey: `copy-open:${config.id}:${sourcePosition.id}`,
                  instrument: destSymbol, direction: event.direction,
                  volume: mirrorVolume, orderType: "market",
                  stopLoss: config.replicateStopLoss ? event.stopLoss : undefined,
                  takeProfit: config.replicateTakeProfit ? event.takeProfit : undefined,
                });

                if (orderResult.success) {
                  const priorDestination = await db.destinationPosition.findFirst({ where: { sourcePositionId: sourcePosition.id, brokerAccountId: destAccount.id, state: "open" } });
                  if (priorDestination) {
                    await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "open" } });
                    continue;
                  }
                  try {
                    await db.destinationPosition.create({
                      data: {
                        brokerAccountId: destAccount.id, sourcePositionId: sourcePosition.id,
                        externalTradeId: orderResult.orderId, externalPositionId: orderResult.positionId,
                        instrument: destSymbol, direction: event.direction,
                        entryPrice: orderResult.executedPrice ?? event.entryPrice,
                        volume: orderResult.executedVolume ?? mirrorVolume,
                        stopLoss: config.replicateStopLoss ? event.stopLoss : null,
                        takeProfit: config.replicateTakeProfit ? event.takeProfit : null,
                        orderType: "market", openTime: new Date(), state: "open",
                        executionDelayMs: orderResult.executionDelayMs,
                      },
                    });
                  } catch (error: any) {
                    if (error?.code !== "P2002") throw error;
                    const concurrentDestination = await db.destinationPosition.findFirst({
                      where: { sourcePositionId: sourcePosition.id, brokerAccountId: destAccount.id },
                    });
                    if (!concurrentDestination) throw error;
                    await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "open" } });
                    continue;
                  }
                  await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "open" } });
                  totalMirrored++;
                  await sendNotification(user.id, {
                    type: "trade_opened", title: "TRADE OPENED",
                    body: `Source: ${sourceName} | ${event.instrument} | ${event.direction} | Source: ${event.volume} | Dest: ${mirrorVolume} | Entry: ${event.entryPrice} | Replication: Successful`,
                    severity: "success",
                  });
                } else {
                  totalErrors++;
                  await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "rejected" } });
                  await sendNotification(user.id, {
                    type: "replication_failed", title: "REPLICATION FAILED",
                    body: `${sourceName} | ${event.instrument} | ${orderResult.rejectionReason ?? "Unknown"}`,
                    severity: "error",
                  });
                }
              } catch (e: any) {
                totalErrors++;
                await db.sourcePosition.update({ where: { id: sourcePosition.id }, data: { state: "rejected" } }).catch(() => undefined);
                console.error("[mirror]", e.message);
              }
            }
          } else if (event.type === "close" && sourcePositions.length) {
            for (const sourcePos of sourcePositions) {
            const config = account.sourceReplicationConfigs.find((item) => item.id === sourcePos.replicationConfigId);
            if (!config) continue;
            const destPositions = await db.destinationPosition.findMany({ where: { sourcePositionId: sourcePos.id, state: "open" } });
            let allDestinationsClosed = true;
            for (const destPos of destPositions) {
              try {
                const destAccount = await db.brokerAccount.findUnique({ where: { id: destPos.brokerAccountId } });
                if (!destAccount) { allDestinationsClosed = false; continue; }
                if (!destPos.externalPositionId) throw new Error("Destination position has no terminal ticket");
                const destConnector = await getAccountConnector(destAccount.brokerCode as BrokerCode, destAccount.id, { accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency });
                const closeKey = `copy-close:${config.id}:${sourcePos.id}:${destPos.id}`;
                const closeResult = await closeOnce(closeKey, sourcePos.id, () => destConnector.closePosition(destPos.externalPositionId ?? "", undefined, closeKey));
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
            const config = account.sourceReplicationConfigs.find((item) => item.id === sourcePos.replicationConfigId);
            if (!config) continue;
            if (!config.replicatePartialClosures) {
              await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { volume: event.volume, state: "open" } });
              continue;
            }
            const destPositions = await db.destinationPosition.findMany({ where: { sourcePositionId: sourcePos.id, state: "open" } });
            let allDestinationsUpdated = true;
            for (const destPos of destPositions) {
              const closeRatio = event.previousVolume && event.previousVolume > 0 ? (event.previousVolume - event.volume) / event.previousVolume : 0;
              const requestedCloseVolume = destPos.volume * closeRatio;
              if (requestedCloseVolume > 0) {
                try {
                  const destAccount = await db.brokerAccount.findUnique({ where: { id: destPos.brokerAccountId } });
                  if (!destAccount) { allDestinationsUpdated = false; continue; }
                  if (!destPos.externalPositionId) throw new Error("Destination position has no terminal ticket");
                  const destConnector = await getAccountConnector(destAccount.brokerCode as BrokerCode, destAccount.id, { accountId: destAccount.externalAccountId ?? undefined, startingBalance: destAccount.balance, currency: destAccount.currency });
                  const destSpec = await destConnector.getInstrumentSpec(destPos.instrument);
                  if (!destSpec || destSpec.volumeStep <= 0) throw new Error("Destination volume rules are unavailable");
                  const closeVolume = Math.floor(requestedCloseVolume / destSpec.volumeStep + 1e-8) * destSpec.volumeStep;
                  if (closeVolume < destSpec.minVolume) throw new Error("Partial close is smaller than the destination broker's minimum volume step");
                  const closeKey = `copy-partial:${config.id}:${sourcePos.id}:${destPos.id}:${event.volume}`;
                  const closeResult = await closeOnce(closeKey, sourcePos.id, () => destConnector.closePosition(destPos.externalPositionId ?? "", closeVolume, closeKey));
                  if (!closeResult.success) throw new Error(closeResult.rejectionReason ?? "Terminal rejected partial close");
                  const remainingVolume = Math.max(0, destPos.volume - (closeResult.closedVolume ?? closeVolume));
                  await db.destinationPosition.update({ where: { id: destPos.id }, data: remainingVolume < destSpec.minVolume ? { volume: 0, state: "closed", closeTime: new Date() } : { volume: remainingVolume } });
                } catch (e: any) { totalErrors++; allDestinationsUpdated = false; console.error("[mirror] destination partial close failed", e.message); }
              }
            }
            if (allDestinationsUpdated) await db.sourcePosition.update({ where: { id: sourcePos.id }, data: { volume: event.volume, state: "open" } });
            }
          } else if (event.type === "modify" && sourcePositions.length) {
            for (const sourcePos of sourcePositions) {
            const config = account.sourceReplicationConfigs.find((item) => item.id === sourcePos.replicationConfigId);
            if (!config) continue;
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
        if (account.brokerCode === "deriv" && /expired|http 401/i.test(String(e?.message ?? ""))) {
          await db.brokerAccount.update({ where: { id: account.id }, data: { status: "expired" } }).catch(() => undefined);
        }
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
