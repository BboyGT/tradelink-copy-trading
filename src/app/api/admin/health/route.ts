// Admin endpoints
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const admin = await requireAdmin();

    const [userCount, providerCount, tradeCount, brokerAccountCount, replicationCount, auditCount, integrationHealth] = await Promise.all([
      db.user.count(),
      db.provider.count(),
      db.providerTrade.count(),
      db.brokerAccount.count(),
      db.replicationConfig.count(),
      db.auditEvent.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      db.integrationHealthRecord.findMany({
        orderBy: { checkedAt: "desc" },
        distinct: ["platformCode"],
        take: 20,
      }),
    ]);

    return NextResponse.json({
      admin: { email: admin.email },
      metrics: {
        users: userCount,
        providers: providerCount,
        trades: tradeCount,
        brokerAccounts: brokerAccountCount,
        replicationConfigs: replicationCount,
        auditEvents24h: auditCount,
      },
      integrations: integrationHealth,
    });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e.message === "FORBIDDEN") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
