import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bridgeSecretMatches, readBearer } from "@/lib/terminal-bridge-auth";

export const runtime = "nodejs";

type PositionInput = {
  ticket: string | number; symbol: string; direction: "BUY" | "SELL"; volume: number;
  entryPrice: number; currentPrice: number; stopLoss?: number; takeProfit?: number;
  swap?: number; commission?: number; profit?: number; openTime: string;
};

export async function POST(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await context.params;
    const bridge = await db.terminalBridge.findUnique({ where: { brokerAccountId: accountId }, include: { brokerAccount: true } });
    if (!bridge || bridge.status === "revoked") return NextResponse.json({ error: "Bridge not found" }, { status: 404 });
    const secret = readBearer(request);
    if (!secret || !bridgeSecretMatches(secret, bridge.tokenHash)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const positions = body?.positions;
    const info = body?.account;
    if (!Array.isArray(positions) || positions.length > 500 || !info ||
        ![info.balance, info.equity, info.margin, info.freeMargin, info.leverage].every((n) => Number.isFinite(Number(n))) ||
        typeof info.login !== "string" || !["demo", "real"].includes(info.mode)) {
      return NextResponse.json({ error: "Invalid terminal snapshot" }, { status: 400 });
    }
    const parsed: PositionInput[] = positions;
    const valid = parsed.every((p) => p && (typeof p.ticket === "string" || Number.isFinite(Number(p.ticket))) &&
      typeof p.symbol === "string" && p.symbol.length < 40 && ["BUY", "SELL"].includes(p.direction) &&
      [p.volume, p.entryPrice, p.currentPrice, p.swap ?? 0, p.commission ?? 0, p.profit ?? 0].every((n) => Number.isFinite(Number(n))) &&
      Number(p.volume) > 0 && Number(p.entryPrice) > 0 && Number(p.currentPrice) > 0 && Number.isFinite(Date.parse(p.openTime)));
    if (!valid) return NextResponse.json({ error: "Invalid position in terminal snapshot" }, { status: 400 });

    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.brokerAccount.update({ where: { id: accountId }, data: {
        externalAccountId: String(info.login), currency: String(info.currency ?? "USD").slice(0, 8),
        leverage: Number(info.leverage), isDemo: info.mode === "demo", status: "connected",
        balance: Number(info.balance), equity: Number(info.equity), margin: Number(info.margin),
        freeMargin: Number(info.freeMargin), lastSyncedAt: now,
      } });
      await tx.terminalBridge.update({ where: { id: bridge.id }, data: {
        status: "connected", lastHeartbeatAt: now, terminalVersion: String(body.terminalVersion ?? "unknown").slice(0, 40),
      } });
      for (const p of parsed) {
        const externalPositionId = String(p.ticket);
        await tx.terminalBridgePosition.upsert({
          where: { bridgeId_externalPositionId: { bridgeId: bridge.id, externalPositionId } },
          create: {
            bridgeId: bridge.id, externalPositionId, instrument: p.symbol, direction: p.direction,
            volume: Number(p.volume), entryPrice: Number(p.entryPrice), currentPrice: Number(p.currentPrice),
            stopLoss: p.stopLoss == null ? null : Number(p.stopLoss), takeProfit: p.takeProfit == null ? null : Number(p.takeProfit),
            swap: Number(p.swap ?? 0), commission: Number(p.commission ?? 0), unrealizedProfit: Number(p.profit ?? 0), openTime: new Date(p.openTime),
          },
          update: {
            instrument: p.symbol, direction: p.direction, volume: Number(p.volume), entryPrice: Number(p.entryPrice),
            currentPrice: Number(p.currentPrice), stopLoss: p.stopLoss == null ? null : Number(p.stopLoss),
            takeProfit: p.takeProfit == null ? null : Number(p.takeProfit), swap: Number(p.swap ?? 0),
            commission: Number(p.commission ?? 0), unrealizedProfit: Number(p.profit ?? 0), openTime: new Date(p.openTime),
          },
        });
      }
      await tx.terminalBridgePosition.deleteMany({
        where: { bridgeId: bridge.id, ...(parsed.length ? { externalPositionId: { notIn: parsed.map((p) => String(p.ticket)) } } : {}) },
      });
      await tx.accountSnapshot.create({ data: {
        brokerAccountId: accountId, balance: Number(info.balance), equity: Number(info.equity),
        margin: Number(info.margin), freeMargin: Number(info.freeMargin), openPositions: parsed.length,
      } });
    });
    return NextResponse.json({ accepted: true, commandsUrl: `/api/brokers/bridge/${accountId}/commands` });
  } catch (error) {
    console.error("[terminal-bridge.heartbeat]", error);
    return NextResponse.json({ error: "Snapshot could not be applied" }, { status: 500 });
  }
}
