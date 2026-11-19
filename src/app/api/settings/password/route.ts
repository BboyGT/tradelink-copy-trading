import { NextRequest, NextResponse } from "next/server";
import { requireUser, audit } from "@/lib/auth";
import { compare, hash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const limit = await consumeRateLimit("password-change", user.id, 60 * 60 * 1000, 5);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many password change attempts. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" },
      });
    }

    const body = await req.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (currentPassword.length > 128 || newPassword.length < 12 || newPassword.length > 128) {
      return NextResponse.json({ error: "Enter your current password and a new password of 12–128 characters." }, { status: 400 });
    }

    const account = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!account?.passwordHash || !(await compare(currentPassword, account.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect, or this account does not use password sign-in." }, { status: 400 });
    }
    if (await compare(newPassword, account.passwordHash)) {
      return NextResponse.json({ error: "Choose a password different from your current password." }, { status: 400 });
    }

    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hash(newPassword) } });
    await audit({ userId: user.id, action: "user.password_change", result: "success" });
    return NextResponse.json({ status: "updated" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Sign in again to change your password." }, { status: 401 });
    console.error("[settings.password] request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Password could not be updated." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
