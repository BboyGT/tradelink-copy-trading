// Comparisons — save & list (Part 20.3)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const comparisons = await db.providerComparison.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ comparisons });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { name, providerIds, config, result } = body;

    if (!providerIds || !Array.isArray(providerIds) || providerIds.length < 2) {
      return NextResponse.json({ error: "At least 2 providers required for comparison" }, { status: 400 });
    }

    const comparison = await db.providerComparison.create({
      data: {
        userId: user.id,
        name: name ?? `${providerIds.length} providers`,
        providerIds: JSON.stringify(providerIds),
        config: JSON.stringify(config ?? {}),
        result: JSON.stringify(result ?? {}),
      },
    });

    return NextResponse.json({ comparison });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
