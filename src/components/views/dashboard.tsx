"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNavStore } from "@/lib/nav-store";
import { formatCurrency, formatPct } from "@/lib/format";
import { ProfitPill, DemoBadge, DataQualityBadge } from "@/components/badges";
import { Activity, TrendingUp, TrendingDown, Wallet, Link2, Bot, Bell, Shield, AlertTriangle, ArrowUpRight, BarChart3 as BarChart3Icon, GitCompare as GitCompareIcon, FlaskConical as FlaskConicalIcon, History as HistoryIcon } from "lucide-react";
import Link from "next/link";

async function fetchRecommendations() {
  const res = await fetch("/api/providers/recommend?limit=5");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface DashboardViewProps {
  user: { email: string; name?: string; role: string } | null;
  stats: any;
  hasLiveAccount?: boolean;
}

export function DashboardView({ user, stats, hasLiveAccount }: DashboardViewProps) {
  const setView = useNavStore((s) => s.setView);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const { data: recsData } = useQuery({
    queryKey: ["recommendations", "dashboard"],
    queryFn: fetchRecommendations,
  });

  const recommendations = recsData?.recommendations ?? [];

  if (!user) {
    return <LandingHero onSignIn={() => setAuthOpen(true)} onGetStarted={() => setAuthOpen(true)} />;
  }

  const statCards = [
    { label: "Total Balance", value: formatCurrency(stats.totalBalance ?? 0), icon: Wallet, accent: "text-info" },
    { label: "Total Equity", value: formatCurrency(stats.totalEquity ?? 0), icon: Activity, accent: "text-primary" },
    { label: "Unrealized P/L", value: formatCurrency((stats.totalEquity ?? 0) - (stats.totalBalance ?? 0)), icon: stats.totalEquity >= stats.totalBalance ? TrendingUp : TrendingDown, accent: (stats.totalEquity ?? 0) >= (stats.totalBalance ?? 0) ? "text-profit" : "text-loss" },
    { label: "Connected Brokers", value: stats.connectedBrokers ?? 0, icon: Link2, accent: "text-info" },
    { label: "Active Replications", value: stats.activeReplications ?? 0, icon: Bot, accent: "text-primary" },
    { label: "Subscribed Providers", value: stats.subscribedProviders ?? 0, icon: Activity, accent: "text-info" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, <span className="text-primary">{user.name ?? user.email.split("@")[0]}</span></h1>
          <p className="text-sm text-muted-foreground font-mono text-[11px] uppercase tracking-wider mt-1">
            Position terminal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("discover")} className="font-mono uppercase text-[11px] tracking-wider">
            Discover providers
          </Button>
          <Button size="sm" onClick={() => setView("automated_trading")} className="font-mono uppercase text-[11px] tracking-wider">
            <Bot className="h-3.5 w-3.5 mr-1.5" /> Configure replication
          </Button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="rm-glass">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-4 w-4 ${s.accent}`} />
                </div>
                <div className={`text-lg font-semibold tnum font-mono ${s.accent}`}>{s.value}</div>
                <div className="rm-label mt-0.5">{s.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recommended providers */}
        <Card className="lg:col-span-2 rm-glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base font-mono tracking-tight">RECOMMENDED PROVIDERS</CardTitle>
              <CardDescription className="text-[11px] font-mono uppercase tracking-wider">Risk-adjusted ranking · data confidence scored</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setView("discover")} className="font-mono text-[11px] uppercase tracking-wider">
              View all <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recommendations.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center font-mono uppercase tracking-wider text-[11px]">
                Loading recommendations…
              </div>
            ) : (
              <div className="space-y-2">
                {recommendations.slice(0, 5).map((r: any) => (
                  <button
                    key={r.provider.id}
                    onClick={() => useNavStore.getState().selectProvider(r.provider.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-md border border-white/5 bg-black/40 hover:bg-primary/10 hover:border-primary/30 transition-colors text-left"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 border border-white/10 text-xs font-mono uppercase text-primary">
                      {r.provider.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.provider.name}</span>
                        <DataQualityBadge quality={r.provider.verificationLevel} />
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                        {r.score.reasonSummary}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-primary tnum font-mono">{r.score.score}/100</div>
                      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                        {Math.round(r.score.confidence * 100)}% conf.
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System status */}
        <Card className="rm-glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-mono tracking-tight">SYSTEM STATUS</CardTitle>
            <CardDescription className="text-[11px] font-mono uppercase tracking-wider">Real-time infrastructure health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow label="WebSocket events" status="operational" detail="Connected" />
            <StatusRow label="Broker connectors" status="operational" detail={`${stats.connectedBrokers ?? 0} connected`} />
            <StatusRow label="Replication engine" status={stats.activeReplications > 0 ? "active" : "idle"} detail={`${stats.activeReplications ?? 0} configs`} />
            <StatusRow label="Risk monitor" status="operational" detail="Continuous" />
            <StatusRow label="Notification service" status="operational" detail={`${stats.unreadNotifications ?? 0} unread`} />

            <div className="pt-3 mt-3 border-t border-border">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setView("risk_management")}>
                <Shield className="h-4 w-4 mr-2" /> Risk management
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="rm-glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-mono tracking-tight">QUICK ACTIONS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction icon={Link2} title="Connect broker" desc="Deriv, cTrader, MT4, MT5" onClick={() => setView("broker_connections")} />
            <QuickAction icon={Bot} title="Setup replication" desc="Choose sizing & risk" onClick={() => setView("automated_trading")} />
            <QuickAction icon={Activity} title="Monitor trades" desc="Live source events" onClick={() => setView("live_monitor")} />
            <QuickAction icon={Shield} title="Risk limits" desc="Provider/account/portfolio" onClick={() => setView("risk_management")} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/5">
            <QuickAction icon={BarChart3Icon} title="Analytics" desc="Provider deep-dive" onClick={() => setView("discover")} />
            <QuickAction icon={GitCompareIcon} title="Compare" desc="Side-by-side providers" onClick={() => setView("comparison")} />
            <QuickAction icon={FlaskConicalIcon} title="Backtest" desc="Simulate trades" onClick={() => setView("backtesting")} />
            <QuickAction icon={HistoryIcon} title="History" desc="Trade ledger" onClick={() => setView("trade_history")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, status, detail }: { label: string; status: string; detail: string }) {
  const colorMap: Record<string, string> = {
    operational: "bg-primary",
    active: "bg-primary",
    idle: "bg-muted-foreground",
    degraded: "bg-warning",
    down: "bg-loss",
  };
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2 w-2 rounded-full ${colorMap[status] ?? "bg-muted-foreground"} ${status === "operational" || status === "active" ? "rm-pulse-dot" : ""}`} style={{ background: status === "operational" || status === "active" ? "var(--primary)" : undefined }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
      </div>
      <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">{detail}</div>
    </div>
  );
}

function QuickAction({ icon: Icon, title, desc, onClick }: { icon: any; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-1 p-3 rounded-md border border-white/5 bg-black/40 hover:bg-primary/10 hover:border-primary/30 transition-colors text-left"
    >
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-muted-foreground font-mono">{desc}</div>
    </button>
  );
}

function LandingHero({ onSignIn, onGetStarted }: { onSignIn: () => void; onGetStarted: () => void }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center py-12 md:py-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs mb-6 font-mono uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-primary rm-pulse-dot" style={{ background: "var(--primary)" }} />
          Multi-broker • Multi-source • Real-time
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Discover, evaluate, replicate.
          <br />
          <span className="text-primary rm-glow-gold">One copy-trading terminal.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 font-mono">
          TRADE LINK connects to Deriv, cTrader, MT4 and MT5 simultaneously. Discover signal providers across
          marketplaces, examine their complete trade history, run simulations, and automatically replicate
          their trades into your own brokerage accounts with independent equity ratios and risk controls.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button size="lg" onClick={onGetStarted} className="font-mono uppercase tracking-wider text-xs">
            Get started free
          </Button>
          <Button size="lg" variant="outline" onClick={onSignIn} className="font-mono uppercase tracking-wider text-xs">
            Sign in
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
        <FeatureCard
          icon={Activity}
          title="Provider discovery"
          desc="Import providers from multiple copy-trading platforms. Filter by drawdown, win rate, profit factor, recovery factor and more."
        />
        <FeatureCard
          icon={Bot}
          title="Automated replication"
          desc="Three modes: fully automatic, approval required, notify only. Equity ratio, fixed multiplier, fixed lot, and risk-based sizing."
        />
        <FeatureCard
          icon={Shield}
          title="Risk management"
          desc="Limits at provider, account, and portfolio level. Emergency pause, close-all, and automatic provider deterioration rules."
        />
        <FeatureCard
          icon={TrendingUp}
          title="Complete analytics"
          desc="Performance, drawdown, behaviour, risk metrics. Every statistic carries a data-quality label — verified, calculated, estimated."
        />
        <FeatureCard
          icon={Activity}
          title="Backtesting"
          desc="Simulate a provider's historical trades against $100, $1k, $10k accounts. Includes spreads, commissions, swaps, slippage."
        />
        <FeatureCard
          icon={Link2}
          title="Multi-broker"
          desc="One source provider replicates to multiple destinations simultaneously, each with independent sizing rules."
        />
      </div>

      <div className="mt-12 p-6 rounded-lg rm-glass-gold text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium text-warning font-mono uppercase tracking-wider text-xs">RISK DISCLOSURE</span>
        </div>
        <p className="text-xs text-muted-foreground max-w-3xl mx-auto font-mono">
          Automated trading can lose money. Execution can differ from source accounts due to spreads, slippage,
          and execution delays. Historical performance does not guarantee future returns. TRADE LINK never
          fabricates provider data, trade history, or execution results.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="p-5 rounded-lg rm-glass hover:bg-primary/5 hover:border-primary/30 transition-colors">
      <Icon className="h-5 w-5 text-primary mb-3" />
      <h3 className="text-sm font-semibold mb-1 font-mono tracking-tight">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed font-mono">{desc}</p>
    </div>
  );
}
