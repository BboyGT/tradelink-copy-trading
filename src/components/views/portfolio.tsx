"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useNavStore } from "@/lib/nav-store";
import { formatCurrency, formatPct, formatNumber } from "@/lib/format";
import { DemoBadge, DataQualityBadge, HealthBadge, ProfitPill } from "@/components/badges";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend } from "recharts";
import { Wallet, Activity, Bot, TrendingUp, TrendingDown, Layers, AlertTriangle, ArrowUpRight } from "lucide-react";

async function fetchPortfolio() {
  const res = await fetch("/api/portfolio/overview");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function PortfolioView({ user }: { user: any }) {
  const setView = useNavStore((s) => s.setView);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);

  const { data, isLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (!user) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">My Copy Portfolio</h1>
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Sign in to view your portfolio. <Button variant="link" className="px-1" onClick={() => setAuthOpen(true)}>Sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  const t = data.totals;
  const accounts = data.accounts ?? [];
  const replications = data.activeReplications ?? [];
  const subscribed = data.subscribedProviders ?? [];

  // Allocations pie
  const allocationPie = subscribed.map((s: any) => ({ name: s.name, value: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            My Copy Portfolio <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Combined view of all destination accounts and replication configs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("broker_connections")}>
            Add broker
          </Button>
          <Button size="sm" onClick={() => setView("automated_trading")}>
            <Bot className="h-4 w-4 mr-1.5" /> New replication
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total balance" value={formatCurrency(t.totalBalance)} icon={Wallet} accent="text-info" />
        <StatCard label="Total equity" value={formatCurrency(t.totalEquity)} icon={Activity} accent="text-profit" />
        <StatCard label="Unrealized P/L" value={formatCurrency(t.unrealizedPL)} icon={t.unrealizedPL >= 0 ? TrendingUp : TrendingDown} accent={t.unrealizedPL >= 0 ? "text-profit" : "text-loss"} />
        <StatCard label="Realized P/L" value={formatCurrency(t.realizedPL)} icon={t.realizedPL >= 0 ? TrendingUp : TrendingDown} accent={t.realizedPL >= 0 ? "text-profit" : "text-loss"} />
        <StatCard label="Open positions" value={t.openPositions} icon={Layers} />
        <StatCard label="Net return" value={formatCurrency(t.netPortfolioReturn)} icon={Activity} accent={t.netPortfolioReturn >= 0 ? "text-profit" : "text-loss"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Broker accounts */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Destination accounts</CardTitle>
            <CardDescription className="text-xs">{accounts.length} connected</CardDescription>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No broker accounts connected.{" "}
                <Button variant="link" className="px-1" onClick={() => setView("broker_connections")}>Connect one</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((a: any) => (
                  <div key={a.id} className="p-3 rounded-md border border-border flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent text-[10px] uppercase font-medium">
                      {a.brokerCode}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{a.accountLabel}</span>
                        {a.isDemo && <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">DEMO</Badge>}
                        {a.isLiveAuthorized ? (
                          <Badge variant="outline" className="text-[10px] bg-profit/10 text-profit border-profit/30">LIVE</Badge>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{a.currency} • {a.openPositions} open positions</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tnum">{formatCurrency(a.balance, a.currency)}</div>
                      <div className={`text-[11px] tnum ${(a.equity - a.balance) >= 0 ? "text-profit" : "text-loss"}`}>
                        {(a.equity - a.balance) >= 0 ? "+" : ""}{formatCurrency(a.equity - a.balance, a.currency)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk allocation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Allocation</CardTitle>
            <CardDescription className="text-xs">Provider distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {subscribed.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No active subscriptions.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={allocationPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={(e: any) => e.name}
                  >
                    {subscribed.map((_: any, i: number) => (
                      <Cell key={i} fill={["var(--profit)", "var(--info)", "var(--warning)", "var(--chart-5)", "var(--loss)"][i % 5]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active replications */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Active replications</CardTitle>
            <CardDescription className="text-xs">{replications.length} configured</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setView("automated_trading")}>
            Configure <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {replications.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No replications configured yet.{" "}
              <Button variant="link" className="px-1" onClick={() => setView("automated_trading")}>Set one up</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {replications.map((r: any) => (
                <div key={r.id} className="p-3 rounded-md border border-border flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium uppercase">
                    {r.provider[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{r.provider}</span>
                      <Badge variant="outline" className={`text-[10px] ${
                        r.status === "active" ? "bg-profit/10 text-profit border-profit/30" :
                        r.status === "paused" ? "bg-warning/10 text-warning border-warning/30" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {r.status}
                      </Badge>
                      {r.health === "high_risk" && (
                        <Badge variant="outline" className="text-[10px] bg-loss/10 text-loss border-loss/30">
                          HIGH RISK
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      → {r.brokerAccount} ({r.brokerCode}) • {r.executionMode} • {r.sizingMode}
                      {r.sizingMode === "equity_ratio" && ` ${r.equityMultiplier}x`}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setView("automated_trading")}>
                    Manage
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk disclosure */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <strong className="text-warning">Important:</strong> Multi-account replication magnifies risk.
            Ensure each destination account has its own risk limits configured in{" "}
            <Button variant="link" className="px-1 h-auto p-0 text-warning" onClick={() => setView("risk_management")}>Risk Management</Button>.
            Source performance ≠ destination performance — execution differences apply.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
        </div>
        <div className={`text-lg font-semibold tnum ${accent ?? ""}`}>{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
