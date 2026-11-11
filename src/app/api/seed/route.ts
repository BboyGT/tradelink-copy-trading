// Manual seed trigger (dev only)
import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/auth";
import { seedDemoData } from "@/lib/seed";

export async function POST() {
  try {
    const admin = await requireAdmin();
    const result = await seedDemoData();
    await audit({ userId: admin.id, action: "admin.seed_demo", result: "success", details: result });
    return NextResponse.json(result);
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e.message === "FORBIDDEN") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
