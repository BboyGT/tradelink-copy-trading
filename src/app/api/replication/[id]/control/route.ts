// Pause/resume/stop a replication config (Part 12.2 emergency controls)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import { seedSourceBaseline } from "@/lib/replication-baseline";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const { action } = body as { action: "pause" | "resume" | "stop" | "close_all" };

    const config = await db.replicationConfig.findFirst({
      where: { id, userId: user.id },
      include: { brokerAccount: true, sourceBrokerAccount: true, provider: true },
    });
    if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sourceName = config.sourceBrokerAccount?.accountLabel ?? config.provider?.name ?? "source account";

    if (action === "pause") {
      await db.replicationConfig.update({ where: { id }, data: { status: "paused" } });
      await audit({ userId: user.id, replicationConfigId: id, action: "replication.pause", result: "success" });
      await sendNotification(user.id, {
        type: "emergency_stop",
        title: "Replication paused",
        body: `Replication of ${sourceName} to ${config.brokerAccount.accountLabel} has been paused.`,
        severity: "warning",
      });
      return NextResponse.json({ status: "paused" });
    }

    if (action === "resume") {
      if (config.executionMode !== "auto") {
        return NextResponse.json({ error: "Only automatic replication can be resumed; approval workflows are not implemented" }, { status: 400 });
      }
      if (!config.brokerAccount.isDemo && !config.brokerAccount.isLiveAuthorized) {
        return NextResponse.json({ error: "Live trading not authorized" }, { status: 403 });
      }
      const sourceIsTerminal = !!config.sourceBrokerAccount && ["mt4", "mt5"].includes(config.sourceBrokerAccount.brokerCode);
      const sourceIsCTrader = config.sourceBrokerAccount?.brokerCode === "ctrader" && config.sourceBrokerAccount.authMethod === "oauth";
      const destinationIsTerminal = ["mt4", "mt5"].includes(config.brokerAccount.brokerCode);
      const destinationIsCTrader = config.brokerAccount.brokerCode === "ctrader" && config.brokerAccount.authMethod === "oauth";
      if (!config.sourceBrokerAccount || (!sourceIsTerminal && !sourceIsCTrader) || (!destinationIsTerminal && !destinationIsCTrader)) return NextResponse.json({ error: "Replication requires a connected MT4/MT5 terminal or cTrader OAuth account at both ends" }, { status: 409 });
      if (!process.env.SCANNER_WORKER_TOKEN || process.env.SCANNER_WORKER_TOKEN.length < 32) return NextResponse.json({ error: "Persistent copy worker is not configured" }, { status: 503 });
      const bridgeAccounts = [
        ...(sourceIsTerminal ? [config.sourceBrokerAccount] : []),
        ...(destinationIsTerminal ? [config.brokerAccount] : []),
      ];
      for (const account of bridgeAccounts) {
        const bridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: account.id } });
        if (!bridge || bridge.status !== "connected" || !bridge.lastHeartbeatAt || Date.now() - bridge.lastHeartbeatAt.getTime() > 20_000) return NextResponse.json({ error: `${account.accountLabel} terminal is offline` }, { status: 409 });
      }
      if (sourceIsCTrader || destinationIsCTrader) {
        const { getAccountConnector } = await import("@/lib/broker/connector");
        for (const account of [sourceIsCTrader ? config.sourceBrokerAccount : null, destinationIsCTrader ? config.brokerAccount : null].filter(Boolean)) {
          const connector = await getAccountConnector("ctrader", account!.id, { accountId: account!.externalAccountId ?? undefined });
          await connector.getAccountInfo();
        }
      }
      await seedSourceBaseline(id, config.sourceBrokerAccount);
      await db.replicationConfig.update({ where: { id }, data: { status: "active" } });
      await audit({ userId: user.id, replicationConfigId: id, action: "replication.resume", result: "success" });
      return NextResponse.json({ status: "active" });
    }

    if (action === "stop") {
      await db.replicationConfig.update({ where: { id }, data: { status: "stopped" } });
      await audit({ userId: user.id, replicationConfigId: id, action: "replication.stop", result: "success" });
      return NextResponse.json({ status: "stopped" });
    }

    if (action === "close_all") {
      await db.replicationConfig.update({ where: { id }, data: { status: "paused" } });
      // Close all open destination positions for this config
      const openPositions = await db.destinationPosition.findMany({
        where: {
          brokerAccountId: config.brokerAccountId,
          sourcePosition: { replicationConfigId: id },
          state: "open",
        },
      });
      if (!config.brokerAccount.isDemo && !config.brokerAccount.isLiveAuthorized) return NextResponse.json({ error: "Live trading not authorized" }, { status: 403 });
      let closed = 0;
      let failed = 0;
      for (const pos of openPositions) {
        if (pos.externalPositionId) {
          try {
            const { getAccountConnector } = await import("@/lib/broker/connector");
            const connector = await getAccountConnector(config.brokerAccount.brokerCode as any, config.brokerAccountId, {
              accountId: config.brokerAccount.externalAccountId ?? undefined,
              startingBalance: config.brokerAccount.balance,
              currency: config.brokerAccount.currency,
            });
            const result = await connector.closePosition(pos.externalPositionId, undefined, `copy-close-all:${config.id}:${pos.id}`);
            if (result.success) {
              await db.destinationPosition.update({
                where: { id: pos.id },
                data: { state: "closed", closeTime: new Date(), exitPrice: result.closedPrice, grossProfit: result.realizedProfit, netProfit: result.realizedProfit },
              });
              closed++;
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
          }
        }
      }
      await audit({
        userId: user.id,
        replicationConfigId: id,
        action: "replication.close_all",
        result: failed > 0 ? "warning" : "success",
        details: { closed, failed },
      });
      await sendNotification(user.id, {
        type: "emergency_stop",
        title: "All positions closed",
        body: `Closed ${closed} positions for ${sourceName} replication. ${failed} failed to close.`,
        severity: failed > 0 ? "warning" : "success",
      });
      return NextResponse.json({ closed, failed });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
