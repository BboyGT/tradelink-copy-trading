// Provider discovery & filtering (Part 3)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const url = req.nextUrl;
    const search = url.searchParams.get("search") ?? "";
    const platform = url.searchParams.get("platform") ?? "";
    const sortBy = url.searchParams.get("sortBy") ?? "return";
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    // Check if user is in live mode (has a real broker account)
    let isLiveMode = false;
    if (user) {
      const liveAccounts = await db.brokerAccount.count({
        where: { userId: user.id, isDemo: false, status: "connected" },
      });
      isLiveMode = liveAccounts > 0;
    }

    const where: Prisma.ProviderWhereInput = {};

    // In live mode, hide demo providers (those with externalId starting with "DEMO-")
    if (isLiveMode) {
      where.NOT = { externalId: { startsWith: "DEMO-" } };
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { externalId: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (platform) where.platformId = platform;

    const orderBy: Prisma.ProviderOrderByWithRelationInput[] = [];
    if (sortBy === "return") orderBy.push({ statistic: { lifetimeReturnPct: "desc" } });
    if (sortBy === "drawdown") orderBy.push({ statistic: { maxDrawdownPct: "asc" } });
    if (sortBy === "winrate") orderBy.push({ statistic: { winRate: "desc" } });
    if (sortBy === "profitFactor") orderBy.push({ statistic: { profitFactor: "desc" } });
    if (sortBy === "recent") orderBy.push({ lastSyncedAt: "desc" });
    orderBy.push({ createdAt: "desc" });

    const [providers, total] = await Promise.all([
      db.provider.findMany({
        where,
        include: {
          platform: true,
          statistic: true,
          healthRecords: { orderBy: { checkedAt: "desc" }, take: 1 },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      db.provider.count({ where }),
    ]);

    // If user is logged in, attach subscription status
    let subscriptions: Record<string, string> = {};
    if (user) {
      const subs = await db.providerSubscription.findMany({
        where: { userId: user.id, status: "active" },
        select: { providerId: true, status: true },
      });
      subscriptions = Object.fromEntries(subs.map((s) => [s.providerId, s.status]));
    }

    return NextResponse.json({
      providers: providers.map((p) => ({
        ...p,
        subscribed: !!subscriptions[p.id],
        health: p.healthRecords[0]?.status ?? "healthy",
      })),
      total,
      offset,
      limit,
    });
  } catch (e: any) {
    console.error("[providers]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
