"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavStore } from "@/lib/nav-store";
import { formatPct, formatCurrency, formatNumber, formatDateTime } from "@/lib/format";
import { DataQualityBadge, HealthBadge, DemoBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Area, AreaChart, PieChart, Pie, Cell, Legend } from "recharts";
import { Activity, TrendingUp, TrendingDown, Clock, AlertTriangle, Layers, GitCompare } from "lucide-react";

const CHART_COLORS = ["var(--profit)", "var(--loss)", "var(--info)", "var(--warning)", "var(--chart-5)"];

async function fetchAnalytics(id: string | null) {
  if (!id) return null;
  const res = await fetch(`/api/analytics/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchProvider(id: string | null) {
  if (!id) return null;
  const res = await fetch(`/api/providers/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchSnapshots(id: string | null) {
  if (!id) return { snapshots: [] };
  const res = await fetch(`/api/providers/${id}/snapshots`);
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<{ snapshots: any[] }>;
}

export function AnalyticsView() {
  const providerId = useNavStore((s) => s.selectedProviderId);
  const setView = useNavStore((s) => s.setView);

  const { data: providerData } = useQuery({
    queryKey: ["provider", providerId],
    queryFn: () => fetchProvider(providerId),
    enabled: !!providerId,
  });
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics", providerId],
    queryFn: () => fetchAnalytics(providerId),
    enabled: !!providerId,
  });

  if (!providerId) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Provider Analytics</h1>
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Select a provider from <button onClick={() => setView("discover")} className="text-primary underline">Discover Providers</button> to see detailed analytics.
          </CardContent>
        </Card>
      </div>
    );
  }

  const provider = providerData?.provider;
  const stats = provider?.statistic ?? analytics?.performance;

  return (
    <div className="space-y-4">
      <BackTo view="discover" label="Back to providers" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {provider?.name ?? "Loading…"}
            <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            {provider?.platformName ?? "-"} • {provider?.accountCurrency ?? "USD"} • Started {formatDateTime(provider?.accountCreatedAt)}
          </p>
        </div>
        {provider && (
          <div className="flex items-center gap-1.5">
            <DataQualityBadge quality={provider.verificationLevel} />
            <HealthBadge status={provider.health} />
          </div>
        )}
      </div>

      {isLoading || !analytics ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <Tabs defaultValue="performance">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="drawdown">Drawdown</TabsTrigger>
            <TabsTrigger value="behaviour">Behaviour</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="changes">Changes</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-3 mt-3">
            <PerformanceTab analytics={analytics} providerData={providerData} />
          </TabsContent>
          <TabsContent value="drawdown" className="space-y-3 mt-3">
            <DrawdownTab analytics={analytics} />
          </TabsContent>
          <TabsContent value="behaviour" className="space-y-3 mt-3">
            <BehaviourTab analytics={analytics} />
          </TabsContent>
          <TabsContent value="risk" className="space-y-3 mt-3">
            <RiskTab analytics={analytics} />
          </TabsContent>
          <TabsContent value="trades" className="space-y-3 mt-3">
            <TradesTab providerData={providerData} />
          </TabsContent>
          <TabsContent value="changes" className="space-y-3 mt-3">
            <ChangeTrackingTab providerId={providerId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function MetricCard({ label, value, sublabel, quality, icon: Icon, accent }: any) {
  return (
    <Card className="rm-glass py-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="rm-label">{label}</span>
          {Icon && <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />}
        </div>
        <div className={`text-lg font-semibold tnum font-mono ${accent ?? ""}`}>{value}</div>
        {sublabel && <div className="rm-label mt-0.5">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}

function PerformanceTab({ analytics, providerData }: any) {
  const p = analytics.performance;
  const monthly = analytics.monthly ?? [];
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Lifetime return" value={formatPct(p.lifetimeReturnPct)} accent={p.lifetimeReturnPct > 0 ? "text-profit" : "text-loss"} icon={TrendingUp} />
        <MetricCard label="Monthly return" value={formatPct(p.monthlyReturnPct)} icon={TrendingUp} />
        <MetricCard label="Net profit" value={formatCurrency(p.netProfit, analytics.provider.accountCurrency)} accent={p.netProfit > 0 ? "text-profit" : "text-loss"} />
        <MetricCard label="Profit factor" value={p.profitFactor !== null ? p.profitFactor.toFixed(2) : "-"} accent="text-info" />
        <MetricCard label="Win rate" value={p.winRate !== null ? `${p.winRate.toFixed(1)}%` : "-"} />
        <MetricCard label="Total trades" value={p.totalClosedTrades} />
        <MetricCard label="Avg winning" value={formatCurrency(p.avgWinningTrade, analytics.provider.accountCurrency)} accent="text-profit" />
        <MetricCard label="Avg losing" value={formatCurrency(p.avgLosingTrade, analytics.provider.accountCurrency)} accent="text-loss" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly performance</CardTitle>
          <CardDescription className="text-[11px]">Click a bar to view all trades for that month</CardDescription>
        </CardHeader>
        <CardContent>
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any, _name: any, props: any) => {
                    const trades = props?.payload?.trades ?? 0;
                    const pctChange = (v / (analytics.provider.startingBalance)) * 100;
                    return [`${formatCurrency(v, analytics.provider.accountCurrency)} (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%)`, "Net P/L"];
                  }}
                  labelFormatter={(label: any) => `${label} - ${monthly.find((m: any) => m.month === label)?.trades ?? 0} trades`}
                />
                <Bar dataKey="netProfit" radius={[2, 2, 0, 0]}>
                  {monthly.map((m: any, i: number) => (
                    <Cell
                      key={i}
                      fill={m.netProfit >= 0 ? "var(--profit)" : "var(--loss)"}
                      className="cursor-pointer"
                      opacity={selectedMonth && selectedMonth !== m.month ? 0.4 : 1}
                      onClick={() => setSelectedMonth(m.month)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">No monthly data.</div>
          )}

          {/* Trades for selected month - full breakdown */}
          {selectedMonth && (() => {
            const monthTrades = (providerData?.recentTrades ?? [])
              .filter((t: any) => {
                if (!t.closeTime) return false;
                const d = new Date(t.closeTime);
                const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
                return key === selectedMonth;
              });
            const monthData = monthly.find((m: any) => m.month === selectedMonth);
            const wins = monthTrades.filter((t: any) => (t.netProfit ?? 0) > 0);
            const losses = monthTrades.filter((t: any) => (t.netProfit ?? 0) < 0);
            const slHits = monthTrades.filter((t: any) => t.closingReason === "stop_loss" || t.closingReason === "manual");
            const tpHits = monthTrades.filter((t: any) => t.closingReason === "take_profit");
            const grossProfit = wins.reduce((s: number, t: any) => s + (t.netProfit ?? 0), 0);
            const grossLoss = Math.abs(losses.reduce((s: number, t: any) => s + (t.netProfit ?? 0), 0));
            const monthPct = monthData ? (monthData.netProfit / analytics.provider.startingBalance) * 100 : 0;
            const winRate = monthTrades.length > 0 ? (wins.length / monthTrades.length) * 100 : 0;

            return (
              <div className="mt-4 p-4 rounded-lg border border-primary/20 bg-black/40">
                {/* Month summary header */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/5">
                  <div>
                    <div className="text-sm font-mono uppercase tracking-wider text-primary">{selectedMonth}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {monthTrades.length} trades • {monthData?.trades ?? monthTrades.length} closed
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-mono uppercase tracking-wider" onClick={() => setSelectedMonth(null)}>
                    Close
                  </Button>
                </div>

                {/* Month stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Net P/L</div>
                    <div className={`text-base font-mono font-semibold tnum ${monthData?.netProfit >= 0 ? "text-profit" : "text-loss"}`}>
                      {monthData ? formatCurrency(monthData.netProfit, analytics.provider.accountCurrency) : "-"}
                    </div>
                    <div className={`text-[10px] font-mono ${monthPct >= 0 ? "text-profit" : "text-loss"}`}>
                      {monthPct >= 0 ? "+" : ""}{monthPct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Win rate</div>
                    <div className="text-base font-mono font-semibold tnum text-foreground">{winRate.toFixed(1)}%</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{wins.length}W / {losses.length}L</div>
                  </div>
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Gross profit</div>
                    <div className="text-base font-mono font-semibold tnum text-profit">{formatCurrency(grossProfit, analytics.provider.accountCurrency)}</div>
                  </div>
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Gross loss</div>
                    <div className="text-base font-mono font-semibold tnum text-loss">{formatCurrency(grossLoss, analytics.provider.accountCurrency)}</div>
                  </div>
                </div>

                {/* SL / TP breakdown */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Stop-loss hits</div>
                    <div className="text-sm font-mono font-semibold text-loss">{slHits.length}</div>
                  </div>
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Take-profit hits</div>
                    <div className="text-sm font-mono font-semibold text-profit">{tpHits.length}</div>
                  </div>
                  <div className="p-2 rounded-md border border-white/5 bg-black/40">
                    <div className="rm-label">Manual closes</div>
                    <div className="text-sm font-mono font-semibold text-muted-foreground">{monthTrades.length - slHits.length - tpHits.length}</div>
                  </div>
                </div>

                {/* Trades table */}
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  All trades - {monthTrades.length}
                </div>
                <div className="border border-white/5 rounded-md rm-scroll">
                  <Table maxHeight="320px">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Open time</TableHead>
                        <TableHead>Instrument</TableHead>
                        <TableHead>Dir</TableHead>
                        <TableHead className="text-right">Vol</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Exit</TableHead>
                        <TableHead className="text-right">Net P/L</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthTrades.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-4">
                            No trades data available for this month (only recent 50 trades are loaded).
                          </TableCell>
                        </TableRow>
                      ) : (
                        monthTrades.map((t: any) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-[10px] text-muted-foreground">{formatDateTime(t.openTime)}</TableCell>
                            <TableCell className="text-xs font-medium">{t.instrument}</TableCell>
                            <TableCell>
                              <span className={`text-[10px] font-medium ${t.direction === "BUY" ? "text-profit" : "text-loss"}`}>
                                {t.direction}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tnum text-xs">{t.volume.toFixed(2)}</TableCell>
                            <TableCell className="text-right tnum text-xs">{t.entryPrice.toFixed(5)}</TableCell>
                            <TableCell className="text-right tnum text-xs">{t.exitPrice?.toFixed(5) ?? "-"}</TableCell>
                            <TableCell className={`text-right tnum text-xs font-medium ${(t.netProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                              {(t.netProfit ?? 0) >= 0 ? "+" : ""}{(t.netProfit ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <span className={`text-[9px] font-mono uppercase tracking-wider ${
                                t.closingReason === "take_profit" ? "text-profit" :
                                t.closingReason === "stop_loss" ? "text-loss" :
                                "text-muted-foreground"
                              }`}>
                                {t.closingReason === "take_profit" ? "TP" :
                                 t.closingReason === "stop_loss" ? "SL" :
                                 t.closingReason ?? "manual"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Trade outcome distribution</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={[
                  { name: "Winning", value: p.totalWinningTrades, fill: "var(--profit)" },
                  { name: "Losing", value: p.totalLosingTrades, fill: "var(--loss)" },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={80}
                innerRadius={40}
                label={({ name, value }) => {
                  const total = (p.totalWinningTrades ?? 0) + (p.totalLosingTrades ?? 0);
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${name}: ${value} (${pct}%)`;
                }}
                labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                isAnimationActive={true}
              >
                <Cell fill="var(--profit)" />
                <Cell fill="var(--loss)" />
              </Pie>
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                formatter={(value) => {
                  if (value === "Winning") return `${value}: ${p.totalWinningTrades}`;
                  return `${value}: ${p.totalLosingTrades}`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}

function DrawdownTab({ analytics }: any) {
  const dd = analytics.drawdown;
  const curve = dd.equityCurve ?? [];
  const ddSeries = dd.drawdownSeries ?? [];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Max drawdown" value={formatPct(dd.maxDrawdownPct)} accent="text-loss" icon={TrendingDown} />
        <MetricCard label="Current drawdown" value={formatPct(dd.currentDrawdownPct)} accent="text-warning" />
        <MetricCard label="Recovery factor" value={dd.recoveryFactor !== null ? dd.recoveryFactor.toFixed(2) : "-"} accent="text-info" />
        <MetricCard label="Largest losing streak" value={dd.largestLosingStreak ?? "-"} />
        <MetricCard label="Longest DD (days)" value={dd.longestDrawdownDays ?? "-"} />
        <MetricCard label="Avg recovery (days)" value={dd.avgRecoveryDays !== null ? dd.avgRecoveryDays.toFixed(1) : "-"} />
        <MetricCard label="Max DD monetary" value={formatCurrency(dd.maxDrawdownMonetary, analytics.provider.accountCurrency)} accent="text-loss" />
        <MetricCard label="Avg DD %" value={formatPct(dd.avgDrawdownPct)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Equity curve
            <DataQualityBadge quality={dd.dataQuality} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {curve.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={curve.map((p: any) => ({ time: p.time.slice(0, 10), equity: Math.round(p.equity * 100) / 100 }))}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--profit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="equity" stroke="var(--profit)" fill="url(#eqGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">No equity data.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Drawdown series</CardTitle></CardHeader>
        <CardContent>
          {ddSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={ddSeries.map((p: any) => ({ time: p.time.slice(0, 10), dd: -p.drawdownPct }))}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--loss)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="dd" stroke="var(--loss)" fill="url(#ddGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">No drawdown events.</div>
          )}
        </CardContent>
      </Card>

      <Card className="rm-glass-gold py-0">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <strong className="text-warning font-mono uppercase tracking-wider text-[11px]">Drawdown measurement note:</strong>{" "}
            <span className="font-mono">Drawdown is calculated from closed trades,
            not intra-trade equity. Real intra-trade equity drawdown may be deeper. Data quality label:</span>{" "}
            <DataQualityBadge quality={dd.dataQuality} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function BehaviourTab({ analytics }: any) {
  const b = analytics.behaviour;
  const instruments = Object.entries(b.instruments ?? {}) as [string, number][];
  const sessions = Object.entries(b.sessions ?? {}) as [string, number][];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Trades per day" value={b.avgTradesPerDay.toFixed(2)} icon={Activity} />
        <MetricCard label="Trades per week" value={b.tradesPerWeek.toFixed(1)} />
        <MetricCard label="Avg holding" value={`${b.avgHoldingHours.toFixed(1)}h`} icon={Clock} />
        <MetricCard label="Longest holding" value={`${b.longestHoldingHours.toFixed(1)}h`} />
        <MetricCard label="Avg volume" value={formatNumber(b.avgVolume)} />
        <MetricCard label="Largest volume" value={formatNumber(b.largestVolume)} />
        <MetricCard label="Max simultaneous" value={b.maxSimultaneousPositions} />
        <MetricCard label="Buy/Sell ratio" value={b.buySellRatio.toFixed(2)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Instrument distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={instruments.map(([k, v]) => ({ instrument: k, trades: v }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="instrument" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="trades" radius={[2, 2, 0, 0]}>
                  {instruments.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Trading sessions</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={sessions.map(([k, v]) => ({ name: k, value: v }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {sessions.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RiskTab({ analytics }: any) {
  const r = analytics.risk;
  const instr = Object.entries(r.instrumentExposure ?? {}) as [string, number][];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Avg losing trade" value={formatCurrency(r.avgLosingTrade, analytics.provider.accountCurrency)} accent="text-loss" icon={TrendingDown} />
        <MetricCard label="Largest losing trade" value={formatCurrency(r.largestLosingTrade, analytics.provider.accountCurrency)} accent="text-loss" />
        <MetricCard label="Avg risk/reward" value={r.avgRiskReward !== null ? r.avgRiskReward.toFixed(2) : "-"} accent="text-info" />
        <MetricCard label="Risk concentration" value={`${(r.riskConcentration * 100).toFixed(1)}%`} accent={r.riskConcentration > 0.5 ? "text-loss" : "text-profit"} />
        <MetricCard label="Position concentration" value={`${(r.positionConcentration * 100).toFixed(1)}%`} />
        <MetricCard label="Avg losing streak" value={r.avgLosingStreak.toFixed(1)} />
        <MetricCard label="Avg winning streak" value={r.avgWinningStreak.toFixed(1)} />
      </div>

      {instr.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Instrument exposure</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={instr.map(([k, v]) => ({ instrument: k, trades: v }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="instrument" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="trades" fill="var(--info)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function TradesTab({ providerData }: any) {
  const trades = providerData?.recentTrades ?? [];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent trades ({trades.length})</CardTitle></CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Open time</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Dir</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Exit</TableHead>
                <TableHead className="text-right">Net P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.slice(0, 50).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="text-[11px] text-muted-foreground">{formatDateTime(t.openTime)}</TableCell>
                  <TableCell className="text-sm font-medium">{t.instrument}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${t.direction === "BUY" ? "text-profit" : "text-loss"}`}>
                      {t.direction}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tnum text-sm">{t.volume.toFixed(2)}</TableCell>
                  <TableCell className="text-right tnum text-sm">{t.entryPrice.toFixed(5)}</TableCell>
                  <TableCell className="text-right tnum text-sm">{t.exitPrice?.toFixed(5) ?? "-"}</TableCell>
                  <TableCell className={`text-right tnum text-sm font-medium ${(t.netProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                    {(t.netProfit ?? 0) >= 0 ? "+" : ""}{(t.netProfit ?? 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangeTrackingTab({ providerId }: { providerId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["provider-snapshots", providerId],
    queryFn: () => fetchSnapshots(providerId),
    enabled: !!providerId,
  });

  const snapshots = (data?.snapshots ?? []) as any[];

  // Chart needs oldest-first ordering so the return curve trends upward.
  const chronological = [...snapshots].sort(
    (a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime(),
  );

  const chartData = chronological.map((s) => ({
    date: new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    returnPct: s.returnPct ?? null,
    drawdownPct: s.drawdownPct ?? null,
    winRate: s.winRate ?? null,
  }));

  if (isLoading) {
    return (
      <>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </>
    );
  }

  if (snapshots.length === 0) {
    return (
      <Card className="rm-glass">
        <CardContent className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
          <GitCompare className="h-8 w-8 text-muted-foreground/60" />
          <div>
            <div className="text-base font-medium text-foreground mb-1">No change tracking data yet</div>
            <div className="text-xs">
              Snapshots of this provider&apos;s stats will appear here once an admin captures them.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // For the table, show newest-first (matches the API ordering).
  const tableRows = snapshots;

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  const returnDelta = (latest?.returnPct ?? 0) - (oldest?.returnPct ?? 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Snapshots"
          value={snapshots.length}
          icon={GitCompare}
        />
        <MetricCard
          label="Latest return"
          value={formatPct(latest?.returnPct ?? null)}
          accent={(latest?.returnPct ?? 0) >= 0 ? "text-profit" : "text-loss"}
          icon={TrendingUp}
        />
        <MetricCard
          label="Oldest return"
          value={formatPct(oldest?.returnPct ?? null)}
          accent={(oldest?.returnPct ?? 0) >= 0 ? "text-profit" : "text-loss"}
        />
        <MetricCard
          label="Return delta"
          value={formatPct(returnDelta)}
          accent={returnDelta >= 0 ? "text-profit" : "text-loss"}
          icon={returnDelta >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Return % over time
          </CardTitle>
          <CardDescription className="text-[11px]">
            {snapshots.length} snapshots across the last {Math.round(
              (new Date(latest.snapshotAt).getTime() - new Date(oldest.snapshotAt).getTime()) / (24 * 60 * 60 * 1000),
            )} days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                formatter={(v: any, name: any) => {
                  if (v === null || v === undefined) return ["-", name];
                  return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, name === "returnPct" ? "Return" : name === "drawdownPct" ? "Drawdown" : "Win rate"];
                }}
              />
              <Line
                type="monotone"
                dataKey="returnPct"
                stroke="var(--profit)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--profit)" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Snapshot history</CardTitle>
          <CardDescription className="text-[11px]">
            Each row is a captured point-in-time view of the provider&apos;s stats.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto rm-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                  <TableHead className="text-right">Drawdown %</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Avg volume</TableHead>
                  <TableHead>Risk profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDateTime(s.snapshotAt)}
                    </TableCell>
                    <TableCell className={`text-right tnum text-sm font-medium ${(s.returnPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                      {formatPct(s.returnPct ?? null)}
                    </TableCell>
                    <TableCell className="text-right tnum text-sm text-loss">
                      {s.drawdownPct !== null && s.drawdownPct !== undefined ? `-${s.drawdownPct.toFixed(2)}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right tnum text-sm">
                      {s.winRate !== null && s.winRate !== undefined ? `${s.winRate.toFixed(1)}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right tnum text-sm">
                      {formatNumber(s.avgVolume ?? null)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${
                        s.riskProfile === "high_risk" ? "text-loss" :
                        s.riskProfile === "moderate_risk" ? "text-warning" :
                        s.riskProfile === "low_risk" ? "text-info" :
                        s.riskProfile === "conservative" ? "text-profit" :
                        "text-muted-foreground"
                      }`}>
                        {s.riskProfile ?? "-"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
