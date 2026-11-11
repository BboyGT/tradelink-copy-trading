// Get a single replication config
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redactSecrets } from "@/lib/api-safety";
import { seedSourceBaseline } from "@/lib/replication-baseline";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const config = await db.replicationConfig.findFirst({
      where: { id, userId: user.id },
      include: {
        provider: { include: { platform: true, statistic: true } },
        brokerAccount: true,
        sourceBrokerAccount: true,
      },
    });
    if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ config: redactSecrets(config) });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();

    const existing = await db.replicationConfig.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.status === "active" && (body.executionMode ?? existing.executionMode) !== "auto") {
      return NextResponse.json({ error: "Only automatic replication can be activated; approval workflows are not implemented" }, { status: 400 });
    }

    if (body.status === "active") {
      const account = await db.brokerAccount.findFirst({ where: { id: existing.brokerAccountId, userId: user.id } });
      if (!account) return NextResponse.json({ error: "Broker account not found" }, { status: 404 });
      if (!["mt4", "mt5"].includes(account.brokerCode)) return NextResponse.json({ error: "Choose an MT4 or MT5 destination" }, { status: 400 });
      if (!account.isDemo && !account.isLiveAuthorized) return NextResponse.json({ error: "Live trading not authorized" }, { status: 403 });
      if (!existing.sourceBrokerAccountId) return NextResponse.json({ error: "This legacy replication has no linked source terminal" }, { status: 409 });
      const source = await db.brokerAccount.findFirst({ where: { id: existing.sourceBrokerAccountId, userId: user.id, status: "connected" } });
      if (!source || !["mt4", "mt5"].includes(source.brokerCode)) return NextResponse.json({ error: "Source MetaTrader account is unavailable" }, { status: 409 });
      if (!process.env.SCANNER_WORKER_TOKEN || process.env.SCANNER_WORKER_TOKEN.length < 32) return NextResponse.json({ error: "Persistent copy worker is not configured" }, { status: 503 });
      for (const terminal of [source, account]) {
        const bridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: terminal.id } });
        if (!bridge || bridge.status !== "connected" || !bridge.lastHeartbeatAt || Date.now() - bridge.lastHeartbeatAt.getTime() > 20_000) return NextResponse.json({ error: `${terminal.accountLabel} terminal is offline` }, { status: 409 });
      }
      await seedSourceBaseline(id, source);
    }

    const allowedFields = [
      "executionMode", "sizingMode", "equityMultiplier", "fixedLotSize", "riskPerTradePct",
      "riskReferenceBase", "fixedReferenceCapital", "maxLotSize", "minLotSize", "volumeRounding",
      "replicateStopLoss", "replicateTakeProfit", "replicatePartialClosures", "replicateModifications",
      "replicateReversals", "maxSlippagePips", "maxExecutionDelayMs", "status",
    ] as const;
    const data = Object.fromEntries(allowedFields
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]]));

    const updated = await db.replicationConfig.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ config: updated });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await db.replicationConfig.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.replicationConfig.update({
      where: { id },
      data: { status: "stopped" },
    });
    return NextResponse.json({ status: "stopped" });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
