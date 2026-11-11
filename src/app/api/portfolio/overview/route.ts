// Portfolio overview (Part 13.1)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();

    const [accounts, configs, allocations, subscriptions] = await Promise.all([
      db.brokerAccount.findMany({
        where: { userId: user.id },
        include: { destinationPositions: { where: { state: "open" } } },
      }),
      db.replicationConfig.findMany({
        where: { userId: user.id, status: { in: ["active", "paused"] } },
        include: { provider: { include: { statistic: true } }, brokerAccount: true },
      }),
      db.portfolioAllocation.findMany({
        where: { userId: user.id, active: true },
      }),
      db.providerSubscription.findMany({
        where: { userId: user.id, status: "active" },
        include: { provider: { include: { statistic: true } } },
      }),
    ]);

    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const totalEquity = accounts.reduce((s, a) => s + a.equity, 0);
    const totalMargin = accounts.reduce((s, a) => s + a.margin, 0);
    const freeMargin = accounts.reduce((s, a) => s + a.freeMargin, 0);
    const openPositions = accounts.reduce((s, a) => s + a.destinationPositions.length, 0);

    // Estimate unrealized P/L
    const unrealizedPL = accounts.reduce(
      (s, a) => s + a.equity - a.balance,
      0,
    );

    // Compute realized P/L from closed destination positions
    const closedPositions = await db.destinationPosition.findMany({
      where: {
        brokerAccount: { userId: user.id },
        state: "closed",
      },
      select: { netProfit: true },
    });
    const realizedPL = closedPositions.reduce((s, p) => s + (p.netProfit ?? 0), 0);

    return NextResponse.json({
      totals: {
        totalBalance,
        totalEquity,
        totalMargin,
        freeMargin,
        openPositions,
        unrealizedPL,
        realizedPL,
        netPortfolioReturn: realizedPL + unrealizedPL,
        startingCapital: totalBalance - realizedPL,
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        brokerCode: a.brokerCode,
        accountLabel: a.accountLabel,
        currency: a.currency,
        isDemo: a.isDemo,
        isLiveAuthorized: a.isLiveAuthorized,
        balance: a.balance,
        equity: a.equity,
        openPositions: a.destinationPositions.length,
      })),
      activeReplications: configs.map((c) => ({
        id: c.id,
        provider: c.provider?.name ?? "Linked source account",
        brokerAccount: c.brokerAccount.accountLabel,
        brokerCode: c.brokerAccount.brokerCode,
        executionMode: c.executionMode,
        sizingMode: c.sizingMode,
        equityMultiplier: c.equityMultiplier,
        status: c.status,
        health: c.provider?.statistic?.maxDrawdownPct && c.provider.statistic.maxDrawdownPct > 25 ? "high_risk" : "healthy",
      })),
      allocations: allocations.map((a) => ({
        providerId: a.providerId,
        brokerAccountId: a.brokerAccountId,
        allocationPct: a.allocationPct,
        capitalReference: a.capitalReference,
        fixedCapitalAmount: a.fixedCapitalAmount,
      })),
      subscribedProviders: subscriptions.map((s) => ({
        id: s.provider.id,
        name: s.provider.name,
        status: s.status,
        winRate: s.provider.statistic?.winRate,
        maxDrawdown: s.provider.statistic?.maxDrawdownPct,
        monthlyReturn: s.provider.statistic?.monthlyReturnPct,
      })),
    });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
