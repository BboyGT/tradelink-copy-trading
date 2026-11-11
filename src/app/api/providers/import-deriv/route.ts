// Import REAL Deriv copy trading providers
// Deriv has a public API endpoint that lists top traders
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, audit } from "@/lib/auth";

// Deriv API endpoint for listing copy trading providers
// This is a public endpoint — no auth needed to list providers
const DERIV_API_URL = "https://api.deriv.com";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const limit = body.limit ?? 50; // how many providers to import

    // Get or create the Deriv platform
    let platform = await db.providerPlatform.findFirst({
      where: { code: "deriv" },
    });

    if (!platform) {
      platform = await db.providerPlatform.create({
        data: {
          code: "deriv",
          name: "Deriv Copy Trading",
          kind: "copy_trading",
          capabilities: JSON.stringify({
            providerDiscovery: true,
            providerStatistics: true,
            historicalTrades: true,
            liveTradeEvents: true,
            openPositions: true,
            stopLossInfo: true,
            takeProfitInfo: true,
            partialClosures: true,
            tradeExecution: true,
            positionModification: true,
            positionClosure: true,
            accountEquity: true,
            accountBalance: true,
            streamingMode: "real_time",
            notes: "Deriv API + WebSocket",
          }),
        },
      });
    }

    // Fetch real providers from Deriv's API
    // Deriv's copy trading API: GET https://api.deriv.com/copytrading/list
    // This endpoint lists top traders with their stats
    const derivRes = await fetch(`${DERIV_API_URL}/copytrading/list?limit=${limit}`, {
      headers: {
        "Content-Type": "application/json",
        // If DERIV_APP_ID is set, include it
        ...(process.env.DERIV_APP_ID ? { "X-App-Id": process.env.DERIV_APP_ID } : {}),
      },
    });

    if (!derivRes.ok) {
      // If the API isn't available (e.g. wrong endpoint, rate limited),
      // fall back to a message explaining what's needed
      return NextResponse.json({
        error: "Deriv API returned an error. The copytrading/list endpoint may require a different API path.",
        status: derivRes.status,
        note: "Check https://api.deriv.com/playground/ for the correct endpoint.",
      }, { status: 502 });
    }

    const data = await derivRes.json();
    const providers = data.providers ?? data.traders ?? [];

    let imported = 0;
    let updated = 0;

    for (const p of providers) {
      // Check if provider already exists
      const existing = await db.provider.findFirst({
        where: {
          platformId: platform.id,
          externalId: p.loginid ?? p.id,
        },
      });

      if (existing) {
        // Update with fresh data
        await db.provider.update({
          where: { id: existing.id },
          data: {
            name: p.name ?? p.display_name ?? `Deriv Trader ${p.loginid}`,
            description: p.description ?? p.bio,
            reportedBalance: p.balance ?? p.equity,
            reportedEquity: p.equity ?? p.balance,
            followers: p.copiers ?? p.followers ?? 0,
            subscribers: p.active_copiers ?? 0,
            activityStatus: p.is_active ? "active" : "inactive",
            verificationLevel: "platform_reported",
            lastSyncedAt: new Date(),
          },
        });
        updated++;
      } else {
        // Create new provider
        await db.provider.create({
          data: {
            externalId: p.loginid ?? p.id,
            platformId: platform.id,
            name: p.name ?? p.display_name ?? `Deriv Trader ${p.loginid}`,
            description: p.description ?? p.bio ?? "Deriv copy trading provider",
            accountType: p.account_type ?? "real",
            accountCurrency: p.currency ?? "USD",
            startingBalance: p.starting_balance ?? 1000,
            reportedBalance: p.balance ?? p.equity,
            reportedEquity: p.equity ?? p.balance,
            accountCreatedAt: p.start_date ? new Date(p.start_date * 1000) : null,
            followers: p.copiers ?? p.followers ?? 0,
            subscribers: p.active_copiers ?? 0,
            activityStatus: p.is_active ? "active" : "inactive",
            verificationLevel: "platform_reported",
            dataCompleteness: 0.7,
            lastSyncedAt: new Date(),
          },
        });
        imported++;
      }
    }

    await audit({
      userId: admin.id,
      action: "provider.import_deriv",
      result: "success",
      details: { imported, updated, total: providers.length },
    });

    return NextResponse.json({
      imported,
      updated,
      total: providers.length,
      message: `Imported ${imported} new providers, updated ${updated} existing.`,
    });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e.message === "FORBIDDEN") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    console.error("[import-deriv]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
