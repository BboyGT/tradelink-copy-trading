import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bridgeSecretMatches, readBearer } from "@/lib/terminal-bridge-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await context.params;
    const bridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: accountId } });
    const secret = readBearer(request);
    if (!bridge || !secret || !bridgeSecretMatches(secret, bridge.tokenHash)) return new NextResponse("", { status: 401 });

    const now = new Date();
    await db.terminalBridgeCommand.updateMany({
      where: { bridgeId: bridge.id, status: { in: ["queued", "claimed"] }, expiresAt: { lte: now } },
      data: { status: "expired" },
    });
    const commands = await db.terminalBridgeCommand.findMany({
      where: { bridgeId: bridge.id, status: "queued", expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" }, take: 10,
    });
    if (commands.length) {
      await db.terminalBridgeCommand.updateMany({
        where: { id: { in: commands.map((c) => c.id) }, status: "queued" },
        data: { status: "claimed" },
      });
    }
    const lines = commands.map((command) => {
      const payload = JSON.parse(command.payload) as Record<string, unknown>;
      return [command.id, command.commandType, payload.instrument ?? "", payload.direction ?? "", payload.volume ?? "",
        payload.stopLoss ?? 0, payload.takeProfit ?? 0, payload.positionId ?? ""].join("|");
    });
    return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return new NextResponse("", { status: 500 });
  }
}
