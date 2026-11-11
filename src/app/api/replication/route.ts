// Replication config management (Part 9)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import type { ExecutionMode, SizingMode } from "@/lib/types";
import { redactSecrets } from "@/lib/api-safety";

// GET — list user's replication configs
export async function GET() {
  try {
    const user = await requireUser();
    const configs = await db.replicationConfig.findMany({
      where: { userId: user.id },
      include: {
        provider: { include: { platform: true, statistic: true } },
        sourceBrokerAccount: true,
        brokerAccount: true,
        sourcePositions: {
          where: { state: "open" },
          take: 20,
          orderBy: { openTime: "desc" },
          include: { destinationPositions: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ configs: redactSecrets(configs) });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — create a new replication config
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const {
      providerId,
      sourceBrokerAccountId,
      brokerAccountId,
      executionMode = "approval",
      sizingMode = "equity_ratio",
      equityMultiplier = 1,
      fixedLotSize,
      riskPerTradePct,
      riskReferenceBase = "equity",
      fixedReferenceCapital,
      maxLotSize,
      minLotSize,
      volumeRounding = "nearest",
      replicateStopLoss = true,
      replicateTakeProfit = true,
      replicatePartialClosures = true,
      replicateModifications = true,
      replicateReversals = true,
      maxSlippagePips,
      maxExecutionDelayMs,
      status = "paused",
    } = body;

    if (!sourceBrokerAccountId || !brokerAccountId) {
      return NextResponse.json({ error: "sourceBrokerAccountId and brokerAccountId are required" }, { status: 400 });
    }

    // Verify ownership
    const account = await db.brokerAccount.findFirst({ where: { id: brokerAccountId, userId: user.id } });
    if (!account) return NextResponse.json({ error: "Broker account not found" }, { status: 404 });
    if (account.status !== "connected") return NextResponse.json({ error: "Connect the destination account before configuring replication" }, { status: 409 });
    if (!["mt4", "mt5", "ctrader"].includes(account.brokerCode)) return NextResponse.json({ error: "Choose a connected MT4, MT5, or cTrader destination account" }, { status: 400 });
    const sourceAccount = await db.brokerAccount.findFirst({ where: { id: sourceBrokerAccountId, userId: user.id, status: "connected" } });
    const sourceIsTerminal = sourceAccount && ["mt4", "mt5"].includes(sourceAccount.brokerCode);
    const sourceIsCTrader = sourceAccount?.brokerCode === "ctrader" && sourceAccount.authMethod === "oauth";
    const sourceIsDeriv = sourceAccount?.brokerCode === "deriv" && sourceAccount.authMethod === "oauth";
    if (!sourceAccount || (!sourceIsTerminal && !sourceIsCTrader && !sourceIsDeriv)) {
      return NextResponse.json({ error: "Choose a connected MT4/MT5 terminal, cTrader OAuth, or Deriv OAuth account as the source" }, { status: 400 });
    }
    if (sourceAccount.id === account.id) return NextResponse.json({ error: "Source and destination accounts must be different" }, { status: 400 });
    if (sourceIsTerminal) {
      const sourceBridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: sourceAccount.id } });
      if (!sourceBridge || sourceBridge.status !== "connected" || !sourceBridge.lastHeartbeatAt || Date.now() - sourceBridge.lastHeartbeatAt.getTime() > 20_000) {
        return NextResponse.json({ error: "The source MetaTrader terminal is offline" }, { status: 409 });
      }
    }
    if (["mt4", "mt5"].includes(account.brokerCode)) {
      const destinationBridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: account.id } });
      if (!destinationBridge || destinationBridge.status !== "connected" || !destinationBridge.lastHeartbeatAt || Date.now() - destinationBridge.lastHeartbeatAt.getTime() > 20_000) {
        return NextResponse.json({ error: "The destination MetaTrader terminal is offline" }, { status: 409 });
      }
    } else if (account.authMethod !== "oauth") {
      return NextResponse.json({ error: "The cTrader destination must be connected through OAuth" }, { status: 409 });
    }

    if (status !== "paused") return NextResponse.json({ error: "Create replications paused, then explicitly resume after reviewing both linked accounts" }, { status: 400 });
    if (status === "active") {
      if (!process.env.SCANNER_WORKER_TOKEN || process.env.SCANNER_WORKER_TOKEN.length < 32) return NextResponse.json({ error: "Persistent copy worker is not configured on this deployment" }, { status: 503 });
    }

    if (executionMode === "auto" && !account.isDemo && !account.isLiveAuthorized) {
      return NextResponse.json({ error: "Auto execution requires live trading authorization on the broker account" }, { status: 403 });
    }

    const config = await db.replicationConfig.create({
      data: {
        userId: user.id,
        providerId: providerId ?? null,
        sourceBrokerAccountId,
        brokerAccountId,
        executionMode: executionMode as ExecutionMode,
        sizingMode: sizingMode as SizingMode,
        equityMultiplier,
        fixedLotSize,
        riskPerTradePct,
        riskReferenceBase,
        fixedReferenceCapital,
        maxLotSize,
        minLotSize,
        volumeRounding,
        replicateStopLoss,
        replicateTakeProfit,
        replicatePartialClosures,
        replicateModifications,
        replicateReversals,
        maxSlippagePips,
        maxExecutionDelayMs,
        status,
      },
    });

    // Auto-subscribe to provider
    if (providerId) {
      await db.providerSubscription.upsert({
        where: { userId_providerId: { userId: user.id, providerId } },
        update: { status: "active" },
        create: { userId: user.id, providerId, status: "active" },
      });
    }

    await audit({
      userId: user.id,
      brokerAccountId,
      replicationConfigId: config.id,
      action: "replication.create",
      result: "success",
      details: { providerId, executionMode, sizingMode },
    });

    return NextResponse.json({ config });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[replication.create]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
