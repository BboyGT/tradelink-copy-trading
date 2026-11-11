// Get open positions for a broker account
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAccountConnector } from "@/lib/broker/connector";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const account = await db.brokerAccount.findFirst({ where: { id, userId: user.id } });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const stored = await db.destinationPosition.findMany({
      where: { brokerAccountId: id },
      include: { sourcePosition: true },
      orderBy: { openTime: "desc" },
    });

    // Try to fetch live from connector
    let livePositions: any[] = [];
    try {
      const connector = await getAccountConnector(account.brokerCode as any, account.id, {
        accountId: account.externalAccountId ?? undefined,
        startingBalance: account.balance,
        currency: account.currency,
      });
      livePositions = await connector.getOpenPositions();
    } catch {
      // Fall back to stored
    }

    return NextResponse.json({ positions: stored, livePositions });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
