// Backtesting/simulation endpoint (Part 6)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runSimulation } from "@/lib/engine/backtest";
import { requireUser, audit } from "@/lib/auth";
import type { SizingMode } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { providerId, config } = body as {
      providerId: string;
      config: {
        startingBalance: number;
        sizingMode: SizingMode;
        equityMultiplier?: number;
        fixedLotSize?: number;
        riskPerTradePct?: number;
        minLotSize?: number;
        maxLotSize?: number;
        estimatedSpreadPips?: number;
        commissionPerLot?: number;
        swapPerLotPerDay?: number;
        slippagePips?: number;
        maxDrawdownPct?: number;
      };
    };

    const provider = await db.provider.findUnique({ where: { id: providerId } });
    if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    const sourceTrades = await db.providerTrade.findMany({ where: { providerId } });
    const result = runSimulation(sourceTrades as any, provider.startingBalance ?? 1000, config);

    // Persist simulation result (always marked hypothetical)
    const sim = await db.simulationResult.create({
      data: {
        userId: user.id,
        providerId,
        config: JSON.stringify(config),
        results: JSON.stringify(result),
        isHypothetical: true,
      },
    });

    await audit({
      userId: user.id,
      action: "backtest.run",
      result: "success",
      details: { providerId, simulationId: sim.id, startingBalance: config.startingBalance },
    });

    return NextResponse.json({ simulationId: sim.id, result, isHypothetical: true });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[backtest]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
