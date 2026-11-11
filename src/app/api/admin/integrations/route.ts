// Integration capability registry (Part 2.4)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLATFORM_CAPABILITIES } from "@/lib/types";

export async function GET() {
  try {
    const platforms = await db.providerPlatform.findMany({
      orderBy: { name: "asc" },
    });

    const result = platforms.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      kind: p.kind,
      capabilities: p.capabilities ? JSON.parse(p.capabilities) : PLATFORM_CAPABILITIES[p.code as keyof typeof PLATFORM_CAPABILITIES] ?? null,
    }));

    return NextResponse.json({ platforms: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
