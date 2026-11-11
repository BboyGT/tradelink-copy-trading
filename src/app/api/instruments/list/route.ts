// Instrument specs (Part 11) — list specs for a broker
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const broker = url.searchParams.get("broker");

    const where: any = {};
    if (broker) where.brokerCode = broker;

    const specs = await db.instrumentSpec.findMany({ where, orderBy: [{ brokerCode: "asc" }, { symbol: "asc" }] });
    return NextResponse.json({ specs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
