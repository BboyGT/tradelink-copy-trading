// Watchlists (Part 20.1)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const watchlists = await db.watchlist.findMany({
      where: { userId: user.id },
      include: {
        entries: {
          include: {
            provider: {
              include: {
                platform: true,
                statistic: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ watchlists });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { name, description } = body;
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const watchlist = await db.watchlist.create({
      data: { userId: user.id, name, description: description ?? null },
    });

    return NextResponse.json({ watchlist });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
