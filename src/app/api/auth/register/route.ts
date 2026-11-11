// Auth registration endpoint
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "@/lib/crypto";
import { audit } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body.email?.toLowerCase().trim();
    const password = body.password;
    const name = body.name?.trim();

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: "Email and password (min 6 chars) required" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const userCount = await db.user.count();
    const isFirstUser = userCount === 0;

    const user = await db.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash: hash(password),
        role: isFirstUser ? "admin" : "user",
      },
    });

    // Auto-seed demo data on first user (idempotent)
    if (isFirstUser) {
      const { seedDemoData } = await import("@/lib/seed");
      try {
        await seedDemoData();
      } catch (e) {
        console.error("[seed] failed:", e);
      }
    }

    await audit({ userId: user.id, action: "user.register", result: "success" });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (e: any) {
    console.error("[register]", e);
    return NextResponse.json({ error: e.message ?? "Internal error" }, { status: 500 });
  }
}
