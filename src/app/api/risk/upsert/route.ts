// Upsert a risk config (Part 12.1)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import type { RiskScope } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const {
      scope,
      scopeRefId,
      brokerAccountId,
      maxRiskPerTradePct,
      maxDailyLossPct,
      maxWeeklyLossPct,
      maxMonthlyLossPct,
      maxDrawdownPct,
      maxOpenPositions,
      maxSimultaneousExposure,
      maxLotSize,
      maxInstrumentExposure,
      maxConsecutiveLosses,
      maxProviderDrawdownPct,
      maxPortfolioAllocationPct,
      maxExecutionDelayMs,
      autoPauseOnDrawdownBreach = true,
      autoCloseOnBreach = false,
      notifyOnBreach = true,
    } = body;

    if (!scope || !["provider", "account", "portfolio"].includes(scope)) {
      return NextResponse.json({ error: "scope must be provider|account|portfolio" }, { status: 400 });
    }

    if (scope === "account" && (!brokerAccountId || !await db.brokerAccount.findFirst({ where: { id: brokerAccountId, userId: user.id }, select: { id: true } }))) {
      return NextResponse.json({ error: "A broker account owned by this user is required for account-scoped risk" }, { status: 400 });
    }
    if (scope === "portfolio" && (scopeRefId || brokerAccountId)) {
      return NextResponse.json({ error: "Portfolio-scoped risk does not accept a scope reference or broker account" }, { status: 400 });
    }

    const data = {
        userId: user.id,
        scope: scope as RiskScope,
        scopeRefId: scopeRefId ?? null,
        brokerAccountId: brokerAccountId ?? null,
        maxRiskPerTradePct,
        maxDailyLossPct,
        maxWeeklyLossPct,
        maxMonthlyLossPct,
        maxDrawdownPct,
        maxOpenPositions,
        maxSimultaneousExposure,
        maxLotSize,
        maxInstrumentExposure,
        maxConsecutiveLosses,
        maxProviderDrawdownPct,
        maxPortfolioAllocationPct,
        maxExecutionDelayMs,
        autoPauseOnDrawdownBreach,
        autoCloseOnBreach,
        notifyOnBreach,
      };
    const config = await db.riskConfig.upsert({
      where: { userId_scope_scopeRefId: { userId: user.id, scope, scopeRefId: scopeRefId ?? null } },
      update: data,
      create: data,
    });

    await audit({ userId: user.id, action: "risk.upsert", result: "success", details: { scope, scopeRefId } });

    return NextResponse.json({ config });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
