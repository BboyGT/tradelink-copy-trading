// Subscribe / unsubscribe to a provider
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const action = body.action as "subscribe" | "unsubscribe";

    const provider = await db.provider.findUnique({ where: { id } });
    if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    if (action === "subscribe") {
      await db.providerSubscription.upsert({
        where: { userId_providerId: { userId: user.id, providerId: id } },
        update: { status: "active" },
        create: { userId: user.id, providerId: id, status: "active" },
      });
      await audit({ userId: user.id, action: "provider.subscribe", result: "success", details: { providerId: id } });
      return NextResponse.json({ status: "active" });
    } else {
      await db.providerSubscription.updateMany({
        where: { userId: user.id, providerId: id },
        data: { status: "cancelled" },
      });
      await audit({ userId: user.id, action: "provider.unsubscribe", result: "success", details: { providerId: id } });
      return NextResponse.json({ status: "cancelled" });
    }
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
