import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  try {
    await requireAdmin();
    return NextResponse.json({
      error: "A public Deriv copy-trader directory is not available through the supported API integration, so TradeLink cannot import or verify public Deriv providers yet.",
      guidance: "Connect an account that is already receiving copied trades and use its live positions as a replication source.",
    }, { status: 501 });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "FORBIDDEN") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    console.error("[import-deriv]", error);
    return NextResponse.json({ error: "Provider import is unavailable." }, { status: 500 });
  }
}
