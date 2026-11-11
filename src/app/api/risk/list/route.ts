// Risk configuration (Part 12)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import type { RiskScope } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const url = req.nextUrl;
    const scope = url.searchParams.get("scope") as RiskScope | null;

    const where: any = { userId: user.id };
    if (scope) where.scope = scope;

    const configs = await db.riskConfig.findMany({
      where,
      include: { brokerAccount: { select: { accountLabel: true, brokerCode: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ configs });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
