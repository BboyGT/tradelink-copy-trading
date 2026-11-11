// Broker account connections (Part 2, 17)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redactSecrets } from "@/lib/api-safety";

// GET — list user's broker accounts
export async function GET() {
  try {
    const user = await requireUser();
    const allAccounts = await db.brokerAccount.findMany({
      where: { userId: user.id },
      include: {
        destinationPositions: { where: { state: "open" }, select: { id: true, instrument: true, direction: true, volume: true, grossProfit: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Check if user is in live mode
    const isLiveMode = allAccounts.some((a) => !a.isDemo && a.status === "connected");

    // In live mode, only show real accounts. In demo mode, show all (including demo).
    const accounts = isLiveMode
      ? allAccounts.filter((a) => !a.isDemo)
      : allAccounts;

    return NextResponse.json({ accounts: redactSecrets(accounts), isLiveMode });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — connect a new broker account (demo mode)
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    // Do not accept user-submitted credentials or synthesize a connected account.
    // Provider-specific OAuth callbacks and terminal bridge enrollment must create
    // accounts only after an actual remote authorization/heartbeat succeeds.
    return NextResponse.json({
      error: "Direct credential connection is disabled. Use the provider authorization or the MT terminal bridge flow.",
    }, { status: 501 });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[broker.connect]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
