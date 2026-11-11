import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bridgeSecretMatches, readBearer } from "@/lib/terminal-bridge-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string; commandId: string }> }) {
  try {
    const { accountId, commandId } = await context.params;
    const bridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: accountId } });
    const secret = readBearer(request);
    if (!bridge || !secret || !bridgeSecretMatches(secret, bridge.tokenHash)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (!["completed", "rejected"].includes(body?.status)) return NextResponse.json({ error: "Invalid command result" }, { status: 400 });
    const result = JSON.stringify(body.result ?? {});
    const changed = await db.terminalBridgeCommand.updateMany({
      where: { id: commandId, bridgeId: bridge.id, status: "claimed" },
      data: { status: body.status, result, completedAt: new Date() },
    });
    if (!changed.count) return NextResponse.json({ error: "Command is missing or no longer claimable" }, { status: 409 });
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: "Command result could not be recorded" }, { status: 500 });
  }
}
