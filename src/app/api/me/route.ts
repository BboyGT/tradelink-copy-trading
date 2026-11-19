// Current user info + dashboard summary
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null, isLiveMode: false });

    const [accountRows, replicationConfigs, notifications, subscriptions] = await Promise.all([
      db.brokerAccount.findMany({
        where: { userId: user.id },
        select: { id: true, brokerCode: true, externalAccountId: true, updatedAt: true, accountLabel: true, status: true, isDemo: true, balance: true, equity: true, currency: true, propFirmType: true, propFirmPhase: true },
      }),
      db.replicationConfig.findMany({
        where: { userId: user.id },
        select: { id: true, status: true, providerId: true, brokerAccountId: true, executionMode: true, sizingMode: true },
      }),
      db.notification.count({ where: { userId: user.id, read: false } }),
      db.providerSubscription.count({ where: { userId: user.id, status: "active" } }),
    ]);

    const uniqueAccounts = new Map<string, (typeof accountRows)[number]>();
    for (const account of accountRows) {
      const externalId = account.externalAccountId?.trim();
      const key = externalId ? `${account.brokerCode}:${externalId.toLowerCase()}` : `local:${account.id}`;
      const current = uniqueAccounts.get(key);
      if (!current || account.updatedAt > current.updatedAt) uniqueAccounts.set(key, account);
    }
    const brokerAccounts = [...uniqueAccounts.values()];
    const connectedAccounts = brokerAccounts.filter((account) => account.status === "connected");
    const liveAccounts = connectedAccounts.filter((account) => !account.isDemo);
    const demoAccounts = connectedAccounts.filter((account) => account.isDemo);
    const groupByCurrency = (accounts: typeof brokerAccounts, value: "balance" | "equity") =>
      accounts.reduce<Record<string, number>>((totals, account) => {
        const currency = account.currency?.toUpperCase() || "USD";
        totals[currency] = (totals[currency] ?? 0) + (Number.isFinite(account[value]) ? account[value] : 0);
        return totals;
      }, {});
    const liveBalanceByCurrency = groupByCurrency(liveAccounts, "balance");
    const liveEquityByCurrency = groupByCurrency(liveAccounts, "equity");
    const demoBalanceByCurrency = groupByCurrency(demoAccounts, "balance");
    const liveUnrealizedPLByCurrency = Object.fromEntries(
      Object.keys(liveBalanceByCurrency).map((currency) => [currency, (liveEquityByCurrency[currency] ?? 0) - liveBalanceByCurrency[currency]]),
    );

    // Dashboard live totals exclude demo and disconnected accounts, and the
    // currency buckets prevent unlike currencies from being added together.
    const totalBalance = Object.values(liveBalanceByCurrency).reduce((sum, value) => sum + value, 0);
    const totalEquity = Object.values(liveEquityByCurrency).reduce((sum, value) => sum + value, 0);
    const connectedBrokers = connectedAccounts.length;
    const activeReplications = replicationConfigs.filter((r) => r.status === "active").length;

    const isLiveMode = liveAccounts.length > 0;

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
        liveBalanceByCurrency,
        liveEquityByCurrency,
        liveUnrealizedPLByCurrency,
        demoBalanceByCurrency,
        demoAccountCount: demoAccounts.length,
        connectedBrokers,
        activeReplications,
        subscribedProviders: subscriptions,
        unreadNotifications: notifications,
      },
      brokerAccounts: brokerAccounts.map(({ externalAccountId: _externalId, updatedAt: _updatedAt, ...account }) => account),
      replicationConfigs,
    });
  } catch (e: any) {
    console.error("[me]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
