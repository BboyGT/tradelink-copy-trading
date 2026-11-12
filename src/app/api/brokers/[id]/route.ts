// Single broker account: get info, disconnect, refresh
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import { getAccountConnector, disconnectAccount } from "@/lib/broker/connector";
import { redactSecrets } from "@/lib/api-safety";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const account = await db.brokerAccount.findFirst({ where: { id, userId: user.id } });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Refresh any supported account using its provider adapter.
    try {
      const connector = await getAccountConnector(account.brokerCode as any, account.id, {
        accountId: account.externalAccountId ?? undefined,
        startingBalance: account.balance,
        currency: account.currency,
        leverage: account.leverage ?? undefined,
        accountType: account.accountType as any,
      });
      const info = await connector.getAccountInfo();
      const updated = await db.brokerAccount.update({
        where: { id },
        data: {
          balance: info.balance,
          equity: info.equity,
          margin: info.margin,
          freeMargin: info.freeMargin,
          lastSyncedAt: new Date(),
        },
      });
      return NextResponse.json({ account: redactSecrets(updated) });
    } catch (e) {
      // Fall back to stored data
      return NextResponse.json({ account: redactSecrets(account), warning: "Live sync unavailable - showing last known state" });
    }
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const account = await db.brokerAccount.findFirst({ where: { id, userId: user.id } });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    disconnectAccount(account.brokerCode as any, account.id);
    await db.brokerAccount.update({
      where: { id },
      data: { status: "disconnected", lastSyncedAt: new Date() },
    });
    await db.terminalBridge.updateMany({ where: { brokerAccountId: id }, data: { status: "revoked" } });
    await db.terminalBridgeCommand.updateMany({ where: { bridge: { brokerAccountId: id }, status: { in: ["queued", "claimed"] } }, data: { status: "expired" } });

    // Pause any replication configs that depended on this account
    await db.replicationConfig.updateMany({
      where: { brokerAccountId: id, status: "active" },
      data: { status: "paused" },
    });

    await audit({
      userId: user.id,
      brokerAccountId: id,
      action: "broker.disconnect",
      result: "success",
      details: { broker: account.brokerCode },
    });

    return NextResponse.json({ status: "disconnected" });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Authorize live trading on this account (Part 17 - explicit authorization)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const { action, confirm, selected } = body as { action: "enable_live" | "disable_live" | "set_selected"; confirm?: string; selected?: boolean };

    const account = await db.brokerAccount.findFirst({ where: { id, userId: user.id } });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "set_selected") {
      if (typeof selected !== "boolean") return NextResponse.json({ error: "Choose whether this account should be included" }, { status: 400 });
      if (selected && account.status !== "connected") return NextResponse.json({ error: "Reconnect this account before including it" }, { status: 409 });
      await db.brokerAccount.update({ where: { id }, data: { isSelectedForCopy: selected } });
      if (!selected) {
        await db.replicationConfig.updateMany({ where: { brokerAccountId: id, status: "active" }, data: { status: "paused" } });
        await db.replicationConfig.updateMany({ where: { sourceBrokerAccountId: id, status: "active" }, data: { status: "paused" } });
      }
      await audit({ userId: user.id, brokerAccountId: id, action: "broker.copy_selection", result: "success", details: { selected } });
      return NextResponse.json({ isSelectedForCopy: selected });
    }

    if (action === "enable_live") {
      if (confirm !== "I AUTHORIZE LIVE TRADING") return NextResponse.json({ error: "Explicit live trading confirmation is required" }, { status: 400 });
      if (account.isDemo) return NextResponse.json({ error: "This account is still in demo mode" }, { status: 400 });
      if (!["mt4", "mt5"].includes(account.brokerCode)) return NextResponse.json({ error: "Live execution is currently supported only through the MT terminal bridge" }, { status: 501 });
      if (!process.env.SCANNER_WORKER_TOKEN || process.env.SCANNER_WORKER_TOKEN.length < 32) return NextResponse.json({ error: "Persistent copy worker is not configured on this deployment" }, { status: 503 });
      const bridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: id } });
      if (!bridge || bridge.status !== "connected" || !bridge.lastHeartbeatAt || Date.now() - bridge.lastHeartbeatAt.getTime() > 20_000) {
        return NextResponse.json({ error: "The MetaTrader terminal must be online before live execution can be authorized" }, { status: 409 });
      }
      await db.brokerAccount.update({ where: { id }, data: { isLiveAuthorized: true } });
      await audit({ userId: user.id, brokerAccountId: id, action: "broker.enable_live", result: "success", details: { broker: account.brokerCode } });
    } else if (action === "disable_live") {
      await db.brokerAccount.update({ where: { id }, data: { isLiveAuthorized: false } });
      await db.replicationConfig.updateMany({ where: { brokerAccountId: id, status: "active" }, data: { status: "paused" } });
      await audit({
        userId: user.id,
        brokerAccountId: id,
        action: "broker.disable_live",
        result: "success",
      });
    } else {
      return NextResponse.json({ error: "Unsupported broker account action" }, { status: 400 });
    }

    return NextResponse.json({ isLiveAuthorized: action === "enable_live" });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
