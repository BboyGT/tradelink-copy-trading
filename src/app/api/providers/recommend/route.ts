// Recommendation engine endpoint (Part 5)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scoreProvider } from "@/lib/engine/recommendation";
import { getCurrentUser } from "@/lib/auth";
import type { RecommendationCategory } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const category = url.searchParams.get("category") as RecommendationCategory | null;
    const limit = parseInt(url.searchParams.get("limit") ?? "20");

    // Check if user is in live mode
    const user = await getCurrentUser();
    let isLiveMode = false;
    if (user) {
      const liveAccounts = await db.brokerAccount.count({
        where: { userId: user.id, isDemo: false, status: "connected" },
      });
      isLiveMode = liveAccounts > 0;
    }

    const providers = await db.provider.findMany({
      where: isLiveMode ? { NOT: { externalId: { startsWith: "DEMO-" } } } : undefined,
      include: { statistic: true, platform: true },
      take: 200,
    });

    const scored = providers.map((p) => ({
      provider: {
        id: p.id,
        name: p.name,
        platformCode: p.platform.code,
        accountCurrency: p.accountCurrency,
        verificationLevel: p.verificationLevel,
        followers: p.followers,
      },
      score: scoreProvider(p.statistic),
    }));

    let filtered = scored;
    if (category) {
      filtered = scored.filter((s) => s.score.category === category);
    }

    // Group by category for the multi-list view
    const grouped: Record<string, typeof scored> = {};
    for (const s of scored) {
      const cat = s.score.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => b.score.score - a.score.score);
    }

    const sorted = (category ? filtered : scored).sort((a, b) => b.score.score - a.score.score).slice(0, limit);

    return NextResponse.json({
      recommendations: sorted,
      grouped,
    });
  } catch (e: any) {
    console.error("[recommend]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
