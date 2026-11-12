"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/top-nav";
import { NotificationsSheet } from "@/components/notifications-sheet";
import { AuthDialog } from "@/components/auth-dialog";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";

import { DashboardView } from "@/components/views/dashboard";
import { DiscoverView } from "@/components/views/discover";
import { AnalyticsView } from "@/components/views/analytics";
import { ComparisonView } from "@/components/views/comparison";
import { PortfolioView } from "@/components/views/portfolio";
import { LiveMonitorView } from "@/components/views/live-monitor";
import { AutomatedTradingView } from "@/components/views/automated-trading";
import { TradeHistoryView } from "@/components/views/trade-history";
import { BacktestingView } from "@/components/views/backtesting";
import { RiskManagementView } from "@/components/views/risk-management";
import { BrokerConnectionsView } from "@/components/views/broker-connections";
import { NotificationsView } from "@/components/views/notifications";
import { SettingsView } from "@/components/views/settings";
import { AdminView } from "@/components/views/admin";
import { WatchlistsView } from "@/components/views/watchlists";
import { InstrumentMappingView } from "@/components/views/instrument-mapping";
import { viewFromPath } from "@/lib/view-routes";
import type { AppView } from "@/lib/types";

async function fetchMe() {
  const res = await fetch("/api/me");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export default function Home({ initialView = "dashboard" }: { initialView?: AppView }) {
  const view = useNavStore((s) => s.view);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const syncViewFromUrl = useNavStore((s) => s.syncViewFromUrl);
  const { toast } = useToast();
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);

  useEffect(() => {
    syncViewFromUrl(initialView);
    const syncOnHistoryNavigation = () => {
      const view = viewFromPath(window.location.pathname);
      if (view) syncViewFromUrl(view);
    };
    window.addEventListener("popstate", syncOnHistoryNavigation);
    return () => window.removeEventListener("popstate", syncOnHistoryNavigation);
  }, [initialView, syncViewFromUrl]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    refetchInterval: 30000,
  });

  const user = data?.user ?? null;
  const isLiveMode = data?.isLiveMode ?? false;
  const stats = data?.stats ?? {
    totalBalance: 0,
    totalEquity: 0,
    connectedBrokers: 0,
    activeReplications: 0,
    subscribedProviders: 0,
    unreadNotifications: 0,
  };

  // Show live-account labeling only; live execution remains disabled in this build.
  const hasLiveAccount = (data?.brokerAccounts ?? []).some((a: any) => !a.isDemo);

  // Fetch notifications when user is logged in
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications/list?limit=10");
        if (res.ok) {
          const data = await res.json();
          if (active && data.notifications) setRecentNotifs(data.notifications);
        }
      } catch {}
    }
    load();
    const interval = setInterval(load, 20000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  // Show sign-in prompt if user tries to access protected views
  // IMPORTANT: skip this check while /api/me is still loading, otherwise
  // after sign-in the persisted view triggers a false "sign in required" prompt
  // before the session cookie has been read.
  useEffect(() => {
    if (isLoading) return;
    const protectedViews = ["portfolio", "automated_trading", "risk_management", "broker_connections", "notifications", "settings", "admin"];
    if (!user && protectedViews.includes(view)) {
      // Redirect to dashboard instead of trapping the user on a protected view
      setView("dashboard");
      setAuthOpen(true);
    }
  }, [view, user, isLoading, setAuthOpen, setView, toast]);

  const renderView = () => {
    switch (view) {
      case "dashboard": return <DashboardView user={user} stats={stats} hasLiveAccount={hasLiveAccount} />;
      case "discover": return <DiscoverView user={user} isLiveMode={isLiveMode} />;
      case "analytics": return <AnalyticsView />;
      case "comparison": return <ComparisonView user={user} />;
      case "portfolio": return <PortfolioView user={user} />;
      case "live_monitor": return <LiveMonitorView user={user} isLiveMode={isLiveMode} />;
      case "automated_trading": return <AutomatedTradingView user={user} />;
      case "trade_history": return <TradeHistoryView user={user} />;
      case "backtesting": return <BacktestingView user={user} />;
      case "risk_management": return <RiskManagementView user={user} />;
      case "broker_connections": return <BrokerConnectionsView user={user} onConnected={refetch} />;
      case "notifications": return <NotificationsView user={user} />;
      case "settings": return <SettingsView user={user} />;
      case "admin": return <AdminView user={user} />;
      case "watchlists": return <WatchlistsView user={user} />;
      case "instrument_mapping": return <InstrumentMappingView user={user} />;
      default: return <DashboardView user={user} stats={stats} />;
    }
  };

  return (
    <div className="min-h-screen rm-grid-bg flex flex-col">
      <TopNav
        user={user}
        unreadNotifications={stats.unreadNotifications ?? 0}
        connectedBrokers={stats.connectedBrokers ?? 0}
        onOpenNotifications={() => setNotifSheetOpen(true)}
      />
      <main className="flex-1 px-4 md:px-6 lg:px-8 py-6 max-w-[1800px] w-full mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm font-mono uppercase tracking-wider">
            Loading…
          </div>
        ) : (
          renderView()
        )}
      </main>
      <footer className="border-t border-border px-4 md:px-6 lg:px-8 py-3 text-[10px] text-muted-foreground flex items-center justify-between font-mono uppercase tracking-wider max-w-[1800px] mx-auto w-full">
        <span>TRADE LINK - Multi-broker copy-trading terminal</span>
        <div className="flex items-center gap-4">
          <Link href="/about" className="hover:text-foreground">About</Link>
          <Link href="/packages" className="hover:text-foreground">Packages</Link>
        </div>
        <span className="flex items-center gap-2">
          {hasLiveAccount ? (
            <span className="text-[10px] font-mono uppercase tracking-wider text-warning">● LIVE ACCOUNT · EXECUTION OFF</span>
          ) : null}
          <span className="hidden sm:inline normal-case tracking-normal">Automated execution may lose money. Past performance does not guarantee future returns.</span>
        </span>
      </footer>
      <NotificationsSheet
        open={notifSheetOpen}
        onOpenChange={setNotifSheetOpen}
        notifications={recentNotifs}
        unreadCount={stats.unreadNotifications ?? 0}
        onViewAll={() => {
          setView("notifications");
          setNotifSheetOpen(false);
        }}
      />
      <AuthDialog />
    </div>
  );
}
