// Provider historical trades (paginated)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = req.nextUrl;
    const limit = parseInt(url.searchParams.get("limit") ?? "100");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const instrument = url.searchParams.get("instrument") ?? "";

    const where: any = { providerId: id };
    if (instrument) where.instrument = instrument;

    const [trades, total] = await Promise.all([
      db.providerTrade.findMany({
        where,
        orderBy: { openTime: "desc" },
        take: limit,
        skip: offset,
      }),
      db.providerTrade.count({ where }),
    ]);

    return NextResponse.json({ trades, total, offset, limit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
