// Close a destination position (emergency control - Part 12.2)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import { getAccountConnector } from "@/lib/broker/connector";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: accountId } = await params;
    const body = await req.json();
    const { positionId, volume } = body;

    const account = await db.brokerAccount.findFirst({ where: { id: accountId, userId: user.id } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    if (!account.isDemo) {
      return NextResponse.json({ error: "Live position closing is unavailable until a persistent broker connector is configured" }, { status: 501 });
    }
    if (account.status !== "connected") {
      return NextResponse.json({ error: "Broker account is disconnected" }, { status: 409 });
    }
    if (typeof positionId !== "string" || !positionId) {
      return NextResponse.json({ error: "positionId is required" }, { status: 400 });
    }
    if (volume !== undefined && (typeof volume !== "number" || !Number.isFinite(volume) || volume <= 0)) {
      return NextResponse.json({ error: "volume must be a positive number" }, { status: 400 });
    }

    const connector = await getAccountConnector(account.brokerCode as any, account.id, {
      accountId: account.externalAccountId ?? undefined,
      startingBalance: account.balance,
      currency: account.currency,
    });

    const destPos = await db.destinationPosition.findFirst({ where: { brokerAccountId: accountId, externalPositionId: positionId, state: "open" } });
    if (!destPos) return NextResponse.json({ error: "Open position not found" }, { status: 404 });
    if (volume !== undefined && volume > destPos.volume) {
      return NextResponse.json({ error: "volume cannot exceed the open position size" }, { status: 400 });
    }

    const result = await connector.closePosition(positionId, volume);
    if (!result.success) {
      return NextResponse.json({ error: result.rejectionReason ?? "Close failed" }, { status: 400 });
    }

    // Update stored destination position
    const closedVolume = result.closedVolume ?? volume;
    if (closedVolume !== undefined && closedVolume < destPos.volume) {
      await db.destinationPosition.update({
        where: { id: destPos.id },
        data: { volume: Math.max(0, destPos.volume - closedVolume) },
      });
    } else {
        await db.destinationPosition.update({
          where: { id: destPos.id },
          data: {
            state: "closed",
            closeTime: new Date(),
            exitPrice: result.closedPrice,
            grossProfit: result.realizedProfit,
            netProfit: result.realizedProfit,
          },
        });
    }

    await audit({
      userId: user.id,
      brokerAccountId: accountId,
      action: "position.close_manual",
      result: "success",
      details: { positionId, volume, realized: result.realizedProfit },
    });

    return NextResponse.json({ result });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
