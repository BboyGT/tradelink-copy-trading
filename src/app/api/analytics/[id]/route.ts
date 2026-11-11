// Full analytics for a provider (Part 4) — performance + drawdown + behaviour + risk
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  computePerformance,
  computeDrawdown,
  computeBehaviour,
  computeRiskMetrics,
  computeMonthlyPerformance,
} from "@/lib/engine/analytics";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const provider = await db.provider.findUnique({
      where: { id },
      include: { platform: true, statistic: true },
    });
    if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    const trades = await db.providerTrade.findMany({ where: { providerId: id } });
    const startingBalance = provider.startingBalance ?? 1000;

    const performance = computePerformance(trades as any, startingBalance);
    const drawdown = computeDrawdown(trades as any, startingBalance);
    const behaviour = computeBehaviour(trades as any);
    const risk = computeRiskMetrics(trades as any);
    const monthly = computeMonthlyPerformance(trades as any);

    return NextResponse.json({
      provider: {
        id: provider.id,
        name: provider.name,
        startingBalance,
        accountCurrency: provider.accountCurrency,
        verificationLevel: provider.verificationLevel,
        platformName: provider.platform.name,
      },
      performance,
      drawdown,
      behaviour,
      risk,
      monthly,
    });
  } catch (e: any) {
    console.error("[analytics]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
