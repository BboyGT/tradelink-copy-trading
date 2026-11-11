import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit } from "@/lib/auth";
import { createBridgeSecret, hashBridgeSecret } from "@/lib/terminal-bridge-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const brokerCode = body?.brokerCode;
    const accountLabel = typeof body?.accountLabel === "string" ? body.accountLabel.trim().slice(0, 80) : "";
    if (!["mt4", "mt5"].includes(brokerCode) || !accountLabel) {
      return NextResponse.json({ error: "Choose MT4 or MT5 and provide an account label." }, { status: 400 });
    }

    const secret = createBridgeSecret();
    const account = await db.brokerAccount.create({
      data: {
        userId: user.id,
        brokerCode,
        accountLabel,
        currency: "USD",
        isDemo: true,
        isLiveAuthorized: false,
        status: "pending",
        authMethod: "bridge",
        balance: 0,
        equity: 0,
        margin: 0,
        freeMargin: 0,
        terminalBridge: { create: { tokenHash: hashBridgeSecret(secret) } },
      },
      select: { id: true, brokerCode: true, accountLabel: true },
    });

    await audit({ userId: user.id, brokerAccountId: account.id, action: "broker.bridge_enroll", result: "success", details: { broker: brokerCode } });
    return NextResponse.json({ account, bridgeSecret: secret, heartbeatUrl: `/api/brokers/bridge/${account.id}/heartbeat` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrollment failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
