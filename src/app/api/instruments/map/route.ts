// Create / approve instrument mapping (Part 11)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const mappings = await db.instrumentMapping.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ mappings });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { sourceBroker, sourceSymbol, destBroker, destSymbol, equivalenceConfidence = 1, approved = false } = body;

    if (!sourceBroker || !sourceSymbol || !destBroker || !destSymbol) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    const mapping = await db.instrumentMapping.create({
      data: {
        userId: user.id,
        sourceBroker,
        sourceSymbol,
        destBroker,
        destSymbol,
        equivalenceConfidence,
        approved,
        approvedById: approved ? user.id : null,
      },
    });

    await audit({ userId: user.id, action: "instrument.map", result: "success", details: { sourceBroker, sourceSymbol, destBroker, destSymbol } });

    return NextResponse.json({ mapping });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
