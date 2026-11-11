// Single provider full details
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const provider = await db.provider.findUnique({
      where: { id },
      include: {
        platform: true,
        statistic: true,
        healthRecords: { orderBy: { checkedAt: "desc" }, take: 5 },
        changeSnapshots: { orderBy: { snapshotAt: "desc" }, take: 10 },
      },
    });

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Get trade count and ALL trades (for monthly breakdown)
    const [tradeCount, recentTrades] = await Promise.all([
      db.providerTrade.count({ where: { providerId: id } }),
      db.providerTrade.findMany({
        where: { providerId: id },
        orderBy: { openTime: "desc" },
        take: 1000, // Fetch all trades so monthly drill-down works for every month
      }),
    ]);

    let subscription = null;
    if (user) {
      subscription = await db.providerSubscription.findFirst({
        where: { userId: user.id, providerId: id },
      });
    }

    return NextResponse.json({
      provider: {
        ...provider,
        platformName: provider.platform.name,
        platformCode: provider.platform.code,
        health: provider.healthRecords[0]?.status ?? "healthy",
        healthReason: provider.healthRecords[0]?.reason ?? null,
      },
      tradeCount,
      recentTrades,
      subscription,
    });
  } catch (e: any) {
    console.error("[provider.id]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
