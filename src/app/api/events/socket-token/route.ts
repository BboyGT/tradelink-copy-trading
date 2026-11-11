import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createEventToken } from "@/lib/event-token";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    return NextResponse.json({ token: createEventToken(user.id), expiresIn: 300 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 503 });
  }
}
