// Auth registration endpoint
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "@/lib/crypto";
import { audit } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid registration request" }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128 || name.length > 80) {
      return NextResponse.json({ error: "Enter a valid email, a password of 12–128 characters, and a name no longer than 80 characters." }, { status: 400 });
    }

    const clientIp = (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").at(-1) ?? "unknown").trim().slice(0, 128);
    const [ipLimit, emailLimit] = await Promise.all([
      consumeRateLimit("register-ip", clientIp, 60 * 60 * 1000, 10),
      consumeRateLimit("register-email", email, 24 * 60 * 60 * 1000, 3),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      const retryAfterSeconds = Math.max(ipLimit.allowed ? 0 : ipLimit.retryAfterSeconds, emailLimit.allowed ? 0 : emailLimit.retryAfterSeconds);
      return NextResponse.json({ error: "Too many account creation attempts. Try again later." }, {
        status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" },
      });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with these details could not be created." }, { status: 409 });
    }

    const passwordHash = await hash(password);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: name || null, passwordHash, role: "user" },
      });
      // Public signup must never grant site operator privileges to the first
      // person who happens to register.
      return created;
    });

    await audit({ userId: user.id, action: "user.register", result: "success" });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "An account with these details could not be created." }, { status: 409 });
    console.error("[register] request failed", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ error: "Registration is temporarily unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
