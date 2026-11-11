// Mark a notification as read
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const notif = await db.notification.findFirst({ where: { id, userId: user.id } });
    if (!notif) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await db.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
    return NextResponse.json({ notification: updated });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
