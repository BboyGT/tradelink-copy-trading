// Current user info + dashboard summary
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null, isLiveMode: false });

    const [brokerAccounts, replicationConfigs, notifications, subscriptions] = await Promise.all([
      db.brokerAccount.findMany({
        where: { userId: user.id },
        select: { id: true, brokerCode: true, accountLabel: true, status: true, isDemo: true, balance: true, equity: true, currency: true, propFirmType: true, propFirmPhase: true },
      }),
      db.replicationConfig.findMany({
        where: { userId: user.id },
        select: { id: true, status: true, providerId: true, brokerAccountId: true, executionMode: true, sizingMode: true },
      }),
      db.notification.count({ where: { userId: user.id, read: false } }),
      db.providerSubscription.count({ where: { userId: user.id, status: "active" } }),
    ]);

    const totalBalance = brokerAccounts.reduce((s, a) => s + a.balance, 0);
    const totalEquity = brokerAccounts.reduce((s, a) => s + a.equity, 0);
    const connectedBrokers = brokerAccounts.filter((b) => b.status === "connected").length;
    const activeReplications = replicationConfigs.filter((r) => r.status === "active").length;

    // LIVE MODE: true if user has at least one connected non-demo account
    const isLiveMode = brokerAccounts.some((a) => !a.isDemo && a.status === "connected");

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      isLiveMode,
      stats: {
        totalBalance,
        totalEquity,
        connectedBrokers,
        activeReplications,
        subscribedProviders: subscriptions,
        unreadNotifications: notifications,
      },
      brokerAccounts,
      replicationConfigs,
    });
  } catch (e: any) {
    console.error("[me]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
