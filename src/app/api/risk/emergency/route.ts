// Emergency controls (Part 12.2): pause all, close all
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import { getAccountConnector } from "@/lib/broker/connector";
import type { BrokerCode } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { action, brokerAccountId } = body as { action: "pause_all" | "close_all" | "resume_all"; brokerAccountId?: string };

    if (action === "pause_all") {
      await db.replicationConfig.updateMany({
        where: { userId: user.id, status: "active", ...(brokerAccountId ? { brokerAccountId } : {}) },
        data: { status: "paused" },
      });
      await audit({ userId: user.id, action: "emergency.pause_all", result: "success", details: { brokerAccountId } });
      await sendNotification(user.id, {
        type: "emergency_stop",
        title: "All replications paused",
        body: "All active replication configs have been paused. No new trades will be opened.",
        severity: "warning",
      });
      return NextResponse.json({ status: "paused" });
    }

    if (action === "resume_all") {
      const configs = await db.replicationConfig.findMany({
        where: { userId: user.id, status: "paused", ...(brokerAccountId ? { brokerAccountId } : {}) },
        include: { brokerAccount: true },
      });
      let resumed = 0;
      let skipped = 0;
      for (const c of configs) {
        if (c.brokerAccount.isDemo && c.executionMode === "auto") {
          await db.replicationConfig.update({ where: { id: c.id }, data: { status: "active" } });
          resumed++;
        } else {
          skipped++;
        }
      }
      await audit({ userId: user.id, action: "emergency.resume_all", result: "success", details: { resumed, skipped } });
      return NextResponse.json({ resumed, skipped });
    }

    if (action === "close_all") {
      const where = {
        state: "open" as const,
        brokerAccount: { userId: user.id },
        ...(brokerAccountId ? { brokerAccountId } : {}),
      };
      const open = await db.destinationPosition.findMany({ where });
      let closed = 0;
      let errors = 0;
      for (const pos of open) {
        try {
          const account = await db.brokerAccount.findFirst({
            where: { id: pos.brokerAccountId, userId: user.id, status: "connected" },
          });
          // Live connectors are not wired into this worker. Never claim a live
          // close succeeded when only the local ledger was changed.
          if (!account || !account.isDemo) {
            errors++;
            continue;
          }
          const connector = await getAccountConnector(account.brokerCode as BrokerCode, account.id, {
            accountId: account.externalAccountId ?? undefined,
            startingBalance: account.balance,
            currency: account.currency,
            leverage: account.leverage ?? undefined,
            accountType: account.accountType as "hedging" | "netting" | undefined,
          });
          const result = await connector.closePosition(pos.externalPositionId ?? "");
          if (!result.success) {
            errors++;
            continue;
          }
          await db.destinationPosition.update({
            where: { id: pos.id },
            data: { state: "closed", closeTime: new Date(), exitPrice: result.closedPrice, grossProfit: result.realizedProfit, netProfit: result.realizedProfit },
          });
          closed++;
        } catch (error) {
          errors++;
          console.error(`[emergency.close_all] failed to close position ${pos.id}`, error);
        }
      }
      await audit({ userId: user.id, action: "emergency.close_all", result: errors > 0 ? "warning" : "success", details: { closed, errors, requested: open.length } });
      await sendNotification(user.id, {
        type: "emergency_stop",
        title: errors > 0 ? "Some positions could not be closed" : "Positions closed",
        body: `Closed ${closed} of ${open.length} open destination positions${errors > 0 ? `; ${errors} failed or require a live broker connection` : ""}.`,
        severity: errors > 0 ? "error" : "success",
      });
      return NextResponse.json({ closed, errors, requested: open.length }, { status: errors > 0 ? 207 : 200 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
