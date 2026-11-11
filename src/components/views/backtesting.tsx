"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency,
  formatPct,
  formatNumber,
} from "@/lib/format";
import { DemoBadge, DataQualityBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import type { SizingMode } from "@/lib/types";
import { SIZING_MODE_LABELS } from "@/lib/types";
import {
  Search,
  FlaskConical,
  Play,
  Settings2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Activity,
  Percent,
  Layers,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Info,
} from "lucide-react";

const PRESETS = [
  { label: "$100", value: 100 },
  { label: "$500", value: 500 },
  { label: "$1k", value: 1000 },
  { label: "$5k", value: 5000 },
  { label: "$10k", value: 10000 },
];

const SIZING_MODES: SizingMode[] = ["equity_ratio", "fixed_multiplier", "fixed_lot", "risk_based"];
const MULTIPLIER_PRESETS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

async function searchProviders(search: string) {
  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  qs.set("limit", "20");
  qs.set("sortBy", "return");
  const res = await fetch(`/api/providers?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchAnalytics(id: string) {
  const res = await fetch(`/api/analytics/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function BacktestingView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const selectProvider = useNavStore((s) => s.selectProvider);
  const { toast } = useToast();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [startingBalance, setStartingBalance] = useState<number>(1000);
  const [sizingMode, setSizingMode] = useState<SizingMode>("equity_ratio");
  const [sourceEquity, setSourceEquity] = useState<number>(1000);
  const [equityMultiplier, setEquityMultiplier] = useState<number>(1);
  const [fixedMultiplier, setFixedMultiplier] = useState<number>(1);
  const [fixedLot, setFixedLot] = useState<number>(0.1);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(1);
  const [stopLossDistance, setStopLossDistance] = useState<number>(0);

  const [spreadPips, setSpreadPips] = useState<number>(0.5);
  const [commissionPerLot, setCommissionPerLot] = useState<number>(7);
  const [swapPerLotPerDay, setSwapPerLotPerDay] = useState<number>(0);
  const [slippagePips, setSlippagePips] = useState<number>(0.2);

  const [maxDrawdownPct, setMaxDrawdownPct] = useState<number>(50);
  const [stopOnDrawdown, setStopOnDrawdown] = useState<boolean>(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["providers", search, "backtest-search"],
    queryFn: () => searchProviders(search),
    enabled: searchOpen,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics", providerId],
    queryFn: () => fetchAnalytics(providerId!),
    enabled: !!providerId,
  });

  // Auto-fill source equity from provider.startingBalance
  useEffect(() => {
    if (analytics?.provider?.startingBalance) {
      setSourceEquity(analytics.provider.startingBalance);
    }
  }, [analytics?.provider?.startingBalance]);

  const providerStats = analytics?.performance;
  const providerName = analytics?.provider?.name ?? "—";
  const providerCurrency = analytics?.provider?.accountCurrency ?? "USD";

  function selectProviderForBacktest(id: string) {
    setProviderId(id);
    setSearchOpen(false);
    setSearch("");
    setResult(null);
    setError(null);
  }

  function buildConfig() {
    const cfg: any = {
      startingBalance,
      sizingMode,
      estimatedSpreadPips: spreadPips,
      commissionPerLot,
      swapPerLotPerDay,
      slippagePips,
    };
    if (stopOnDrawdown) cfg.maxDrawdownPct = maxDrawdownPct;
    if (sizingMode === "equity_ratio") {
      cfg.startingEquity = startingBalance;
      cfg.equityMultiplier = equityMultiplier;
    } else if (sizingMode === "fixed_multiplier") {
      cfg.equityMultiplier = fixedMultiplier;
    } else if (sizingMode === "fixed_lot") {
      cfg.fixedLotSize = fixedLot;
    } else if (sizingMode === "risk_based") {
      cfg.riskPerTradePct = riskPerTradePct;
      if (stopLossDistance > 0) {
        cfg.stopLossDistance = stopLossDistance;
      }
    }
    return cfg;
  }

  async function runSimulation() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!providerId) {
      toast({
        title: "Select a provider",
        description: "Pick a provider to backtest.",
      });
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const cfg = buildConfig();
      const res = await fetch(`/api/backtest/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, config: cfg }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Simulation failed");
      }
      setResult(json.result);
      toast({
        title: "Simulation complete",
        description: `Final balance: ${formatCurrency(json.result.finalBalance, providerCurrency)}`,
      });
    } catch (e: any) {
      setError(e.message);
      toast({
        title: "Simulation failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackTo view="discover" label="Back to providers" />
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Backtesting &amp; simulation <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Simulate a provider&apos;s historical trades against your own account config. All results are hypothetical.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT PANEL — form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Simulation config
            </CardTitle>
            <CardDescription className="text-xs">
              Choose a provider, your account capital, and position-sizing rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Provider search */}
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {providerId ? (
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold uppercase">
                          {providerName?.[0] ?? "?"}
                        </span>
                        <span className="truncate">{providerName}</span>
                        <Badge variant="outline" className="text-[9px] ml-auto">{providerCurrency}</Badge>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Search className="h-3.5 w-3.5" /> Select a provider…
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search providers…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {searchLoading ? (
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                      </div>
                    ) : (searchData?.providers ?? []).length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground">No providers found.</div>
                    ) : (
                      (searchData?.providers ?? []).map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => selectProviderForBacktest(p.id)}
                          className="w-full text-left px-3 py-2 hover:bg-sidebar-accent/50 transition-colors flex items-center gap-2 border-b border-border/50 last:border-0"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold uppercase">
                            {p.name?.[0] ?? "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{p.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {p.platform?.name} • {p.accountCurrency ?? "USD"}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Provider stats */}
            {providerId && analyticsLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : providerId && analytics ? (
              <div className="grid grid-cols-3 gap-2">
                <StatTile
                  label="Lifetime"
                  value={formatPct(providerStats?.lifetimeReturnPct)}
                  accent={providerStats?.lifetimeReturnPct && providerStats.lifetimeReturnPct > 0 ? "text-profit" : "text-loss"}
                  icon={TrendingUp}
                />
                <StatTile
                  label="Max DD"
                  value={formatPct(analytics?.drawdown?.maxDrawdownPct)}
                  accent="text-loss"
                  icon={TrendingDown}
                />
                <StatTile
                  label="Win rate"
                  value={
                    providerStats?.winRate !== null && providerStats?.winRate !== undefined
                      ? `${providerStats.winRate.toFixed(1)}%`
                      : "—"
                  }
                  icon={Target}
                />
              </div>
            ) : null}

            <Separator />

            {/* Starting balance */}
            <div className="space-y-2">
              <Label className="text-xs">Starting balance ({providerCurrency})</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(parseFloat(e.target.value) || 0)}
                  min={1}
                  step={100}
                  className="tnum"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    variant={startingBalance === p.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    onClick={() => setStartingBalance(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Sizing mode */}
            <div className="space-y-1.5">
              <Label className="text-xs">Sizing mode</Label>
              <Select value={sizingMode} onValueChange={(v) => setSizingMode(v as SizingMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZING_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {SIZING_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditional sizing fields */}
            <div className="rounded-md border border-border p-3 bg-sidebar/30 space-y-3">
              {sizingMode === "equity_ratio" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between">
                      Source equity (provider)
                      <Badge variant="outline" className="text-[9px]">{providerCurrency}</Badge>
                    </Label>
                    <Input
                      type="number"
                      value={sourceEquity}
                      onChange={(e) => setSourceEquity(parseFloat(e.target.value) || 0)}
                      className="tnum"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Auto-filled from provider&apos;s starting balance. Volume scales proportionally to your destination equity.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between">
                      Equity multiplier
                      <span className="tnum text-foreground font-medium">{equityMultiplier.toFixed(2)}×</span>
                    </Label>
                    <Slider
                      value={[equityMultiplier]}
                      onValueChange={(v) => setEquityMultiplier(v[0])}
                      min={0.1}
                      max={5}
                      step={0.1}
                    />
                  </div>
                </>
              )}

              {sizingMode === "fixed_multiplier" && (
                <div className="space-y-2">
                  <Label className="text-xs">Source volume multiplier</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MULTIPLIER_PRESETS.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant={fixedMultiplier === m ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2.5 text-[11px] tnum"
                        onClick={() => setFixedMultiplier(m)}
                      >
                        {m}×
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={fixedMultiplier}
                    onChange={(e) => setFixedMultiplier(parseFloat(e.target.value) || 0)}
                    step={0.1}
                    className="tnum"
                  />
                </div>
              )}

              {sizingMode === "fixed_lot" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Fixed lot size</Label>
                  <Input
                    type="number"
                    value={fixedLot}
                    onChange={(e) => setFixedLot(parseFloat(e.target.value) || 0)}
                    min={0.01}
                    step={0.01}
                    className="tnum"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Every replicated trade uses the same volume regardless of source size.
                  </p>
                </div>
              )}

              {sizingMode === "risk_based" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between">
                      Risk per trade
                      <span className="tnum text-foreground font-medium">{riskPerTradePct.toFixed(1)}%</span>
                    </Label>
                    <Slider
                      value={[riskPerTradePct]}
                      onValueChange={(v) => setRiskPerTradePct(v[0])}
                      min={0.1}
                      max={10}
                      step={0.1}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between">
                      Stop loss distance (price units)
                      <span className="tnum text-foreground font-medium">{stopLossDistance.toFixed(2)}</span>
                    </Label>
                    <Input
                      type="number"
                      value={stopLossDistance}
                      onChange={(e) => setStopLossDistance(parseFloat(e.target.value) || 0)}
                      min={0}
                      step={0.01}
                      className="tnum"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Required for risk-based sizing. Set manually per instrument.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Costs */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
                  <span className="flex items-center gap-2">
                    <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    Trading costs
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <CostInput label="Spread (pips)" value={spreadPips} onChange={setSpreadPips} step={0.1} />
                  <CostInput label="Commission / lot" value={commissionPerLot} onChange={setCommissionPerLot} step={0.5} />
                  <CostInput label="Swap / lot / day" value={swapPerLotPerDay} onChange={setSwapPerLotPerDay} step={0.1} />
                  <CostInput label="Slippage (pips)" value={slippagePips} onChange={setSlippagePips} step={0.1} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Risk limit */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    Risk limit
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Stop simulation at max drawdown</Label>
                  <Switch checked={stopOnDrawdown} onCheckedChange={setStopOnDrawdown} />
                </div>
                {stopOnDrawdown && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between">
                      Max drawdown %
                      <span className="tnum text-foreground font-medium">{maxDrawdownPct.toFixed(0)}%</span>
                    </Label>
                    <Slider
                      value={[maxDrawdownPct]}
                      onValueChange={(v) => setMaxDrawdownPct(v[0])}
                      min={5}
                      max={90}
                      step={5}
                    />
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            <Button
              onClick={runSimulation}
              disabled={running || !providerId}
              className="w-full"
            >
              {running ? (
                <>
                  <Activity className="h-4 w-4 mr-1.5 animate-pulse" />
                  Running simulation…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  Run simulation
                </>
              )}
            </Button>
            {!user && (
              <p className="text-[10px] text-center text-muted-foreground">
                Sign in to run simulations.{" "}
                <Button variant="link" className="h-auto p-0 text-[10px]" onClick={() => setAuthOpen(true)}>
                  Sign in
                </Button>
              </p>
            )}
          </CardContent>
        </Card>

        {/* RIGHT PANEL — results */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Simulation result
                </CardTitle>
                <CardDescription className="text-xs">
                  Hypothetical replay of {providerName} against your config.
                </CardDescription>
              </div>
              <div className="bg-warning/15 border border-warning/35 text-warning text-[10px] font-semibold px-2 py-1 rounded uppercase tracking-wide">
                Hypothetical result
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {error ? (
              <div className="border border-loss/30 bg-loss/5 rounded-md p-4 text-xs text-loss flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Simulation failed</div>
                  <div className="text-muted-foreground mt-1">{error}</div>
                </div>
              </div>
            ) : running ? (
              <ResultSkeleton />
            ) : result ? (
              <ResultView result={result} currency={providerCurrency} providerId={providerId} onViewAnalytics={() => providerId && selectProvider(providerId)} />
            ) : (
              <PlaceholderView />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent, icon: Icon }: { label: string; value: string; accent?: string; icon: any }) {
  return (
    <div className="rounded-md border border-border bg-sidebar/30 p-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      </div>
      <div className={`text-sm font-semibold tnum ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function CostInput({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        className="h-8 text-xs tnum"
      />
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function PlaceholderView() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-10 px-6">
      <div className="rounded-full bg-sidebar-accent/60 p-3 mb-3">
        <FlaskConical className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">No simulation yet</p>
      <p className="text-xs text-muted-foreground max-w-sm mt-1">
        Example: pick a provider with a 20% lifetime return, set a $1,000 starting balance,
        choose equity-ratio sizing with 1× multiplier, then click{" "}
        <span className="font-medium text-foreground">Run simulation</span> to see a hypothetical equity curve,
        win rate, profit factor and drawdown — adjusted for spreads, commissions, and slippage.
      </p>
      <div className="flex items-start gap-2 mt-4 max-w-sm text-left">
        <Info className="h-3.5 w-3.5 text-info shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground">
          Results are always hypothetical. Real execution may differ due to broker latency, slippage,
          and market conditions. Past performance does not guarantee future returns.
        </p>
      </div>
    </div>
  );
}

function ResultView({ result, currency, providerId, onViewAnalytics }: any) {
  const r = result;
  const equityCurve = (r.equityCurve ?? []).map((p: any, i: number) => ({
    time: typeof p.time === "string" ? p.time.slice(0, 10) : `T${i}`,
    equity: Math.round((p.equity ?? 0) * 100) / 100,
  }));
  const monthly = (r.monthlyPerformance ?? []).map((m: any) => ({
    month: m.month,
    netProfit: Math.round((m.netProfit ?? 0) * 100) / 100,
    trades: m.trades ?? 0,
  }));

  const metrics = [
    { label: "Final balance", value: formatCurrency(r.finalBalance, currency), icon: Wallet, accent: "text-info" },
    {
      label: "Net profit",
      value: formatCurrency(r.netProfit, currency),
      icon: r.netProfit >= 0 ? TrendingUp : TrendingDown,
      accent: r.netProfit >= 0 ? "text-profit" : "text-loss",
    },
    {
      label: "Win rate",
      value: `${(r.winRate ?? 0).toFixed(1)}%`,
      icon: Target,
    },
    {
      label: "Profit factor",
      value: r.profitFactor !== null && r.profitFactor !== undefined ? r.profitFactor.toFixed(2) : "—",
      icon: Percent,
      accent: r.profitFactor !== null && r.profitFactor >= 1 ? "text-profit" : "text-loss",
    },
    {
      label: "Max drawdown",
      value: formatPct(r.maxDrawdownPct),
      icon: TrendingDown,
      accent: "text-loss",
    },
    {
      label: "Recovery factor",
      value: r.recoveryFactor !== null && r.recoveryFactor !== undefined ? r.recoveryFactor.toFixed(2) : "—",
      icon: Activity,
      accent: "text-info",
    },
    { label: "Total trades", value: formatNumber(r.totalTrades, 0), icon: Layers },
    {
      label: "Executed / missed",
      value: `${r.executedTrades} / ${r.missedTrades}`,
      icon: CheckCircle2,
      accent: r.missedTrades > 0 ? "text-warning" : "text-primary",
    },
    {
      label: "Largest loss",
      value: formatCurrency(r.largestLoss, currency),
      icon: TrendingDown,
      accent: "text-loss",
    },
  ];

  const warnings: string[] = r.warnings ?? [];

  return (
    <div className="space-y-4">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="rounded-md border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</span>
                {Icon && <Icon className={`h-3 w-3 ${m.accent ?? "text-muted-foreground"}`} />}
              </div>
              <div className={`text-base font-semibold tnum ${m.accent ?? ""}`}>{m.value}</div>
            </div>
          );
        })}
      </div>

      {/* Equity curve */}
      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-xs font-medium">Equity curve</span>
          <Badge variant="outline" className="text-[9px]">hypothetical</Badge>
        </div>
        <div className="p-3">
          {equityCurve.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="btEq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--profit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={10} minTickGap={20} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={56} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => formatCurrency(v as number, currency)}
                />
                <Area type="monotone" dataKey="equity" stroke="var(--profit)" fill="url(#btEq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-muted-foreground py-8 text-center">No equity curve produced.</div>
          )}
        </div>
      </div>

      {/* Monthly performance */}
      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-xs font-medium">Monthly performance</span>
          <span className="text-[10px] text-muted-foreground">{monthly.length} months</span>
        </div>
        <div className="p-3">
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={10} minTickGap={20} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={56} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => formatCurrency(v as number, currency)}
                />
                <Bar dataKey="netProfit" radius={[2, 2, 0, 0]}>
                  {monthly.map((m: any, i: number) => (
                    <Cell key={i} fill={m.netProfit >= 0 ? "var(--profit)" : "var(--loss)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-muted-foreground py-8 text-center">No monthly data.</div>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-warning uppercase tracking-wide">
              Warnings ({warnings.length})
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {warnings.map((w, i) => (
              <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {providerId && onViewAnalytics && (
        <Button variant="outline" size="sm" className="w-full" onClick={onViewAnalytics}>
          View provider analytics
        </Button>
      )}
    </div>
  );
}
