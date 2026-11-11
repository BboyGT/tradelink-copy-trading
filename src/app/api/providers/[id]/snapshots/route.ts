// Provider change-tracking snapshots (Part 22.3)
// GET  — public: returns a provider's change snapshots, newest first.
// POST — admin only: creates a new snapshot by reading the provider's
//        current statistics and persisting them as a ProviderChangeSnapshot.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAdmin, audit } from "@/lib/auth";

// Derive a human-readable risk profile label from the max drawdown pct.
// Used to populate ProviderChangeSnapshot.riskProfile consistently.
function deriveRiskProfile(maxDrawdownPct: number | null | undefined): string {
  if (maxDrawdownPct === null || maxDrawdownPct === undefined) return "unknown";
  if (maxDrawdownPct > 30) return "high_risk";
  if (maxDrawdownPct > 15) return "moderate_risk";
  if (maxDrawdownPct > 5) return "low_risk";
  return "conservative";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Public read — change tracking is a marketplace signal, not a secret.
    // We still call getCurrentUser() so logged-in viewers can be audited
    // downstream if needed, but no auth wall here.
    await getCurrentUser().catch(() => null);

    const provider = await db.provider.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const snapshots = await db.providerChangeSnapshot.findMany({
      where: { providerId: id },
      orderBy: { snapshotAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ snapshots });
  } catch (e: any) {
    console.error("[provider.snapshots.get]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const provider = await db.provider.findUnique({
      where: { id },
      include: {
        statistic: true,
        healthRecords: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
    });
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const stats = provider.statistic;
    const returnPct = stats?.lifetimeReturnPct ?? stats?.totalReturnPct ?? null;
    const drawdownPct = stats?.maxDrawdownPct ?? null;
    const winRate = stats?.winRate ?? null;
    const profitFactor = stats?.profitFactor ?? null;
    const avgVolume = stats?.avgVolume ?? null;
    const tradingFrequency = stats?.avgTradesPerDay ?? null;
    const riskProfile = deriveRiskProfile(drawdownPct);

    // The ProviderChangeSnapshot schema does not have a dedicated profitFactor
    // column, so we surface it inside the notes field — keeping the snapshot
    // self-describing while preserving the values the task asks us to capture.
    const notesParts: string[] = [];
    if (profitFactor !== null) {
      notesParts.push(`profitFactor=${profitFactor.toFixed(2)}`);
    }
    if (provider.healthRecords[0]) {
      notesParts.push(`health=${provider.healthRecords[0].status}`);
    }
    notesParts.push(`manual snapshot by ${admin.email}`);
    const notes = notesParts.join("; ");

    const snapshot = await db.providerChangeSnapshot.create({
      data: {
        providerId: id,
        returnPct,
        drawdownPct,
        winRate,
        tradingFrequency,
        avgVolume,
        riskProfile,
        notes,
      },
    });

    await audit({
      userId: admin.id,
      action: "provider.snapshot.create",
      result: "success",
      details: { providerId: id, snapshotId: snapshot.id },
    });

    return NextResponse.json({ snapshot });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    console.error("[provider.snapshots.post]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
