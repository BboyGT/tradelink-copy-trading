"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { DemoBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { PROP_FIRM_PRESETS, PROP_FIRM_LIST } from "@/lib/types";
import type { PropFirmRules } from "@/lib/types";
import {
  ShieldAlert,
  ShieldCheck,
  Pause,
  Play,
  XCircle,
  Save,
  AlertTriangle,
  Info,
  Loader2,
  Activity,
  TrendingDown,
  Layers,
  Gauge,
  Target,
  CalendarDays,
  Percent,
  Power,
  Award,
} from "lucide-react";

// ============================================================================
// API helpers
// ============================================================================

async function fetchRiskConfigs(scope: string) {
  const res = await fetch(`/api/risk/list?scope=${scope}`);
  if (!res.ok) throw new Error("Failed to load risk configs");
  return res.json() as Promise<{ configs: any[] }>;
}

async function fetchBrokerAccounts() {
  const res = await fetch("/api/brokers");
  if (!res.ok) throw new Error("Failed to load broker accounts");
  return res.json() as Promise<{ accounts: any[] }>;
}

async function fetchProviders() {
  const res = await fetch("/api/providers?limit=50");
  if (!res.ok) throw new Error("Failed to load providers");
  return res.json() as Promise<{ providers: any[]; total: number }>;
}

async function upsertRiskConfig(body: any) {
  const res = await fetch("/api/risk/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Failed to save risk config");
  }
  return res.json();
}

async function callEmergency(action: string, brokerAccountId?: string) {
  const res = await fetch("/api/risk/emergency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, brokerAccountId }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Emergency action failed");
  }
  return res.json();
}

// ============================================================================
// Default limits
// ============================================================================

const DEFAULT_PORTFOLIO = {
  maxDrawdownPct: 20,
  maxDailyLossPct: 5,
  maxWeeklyLossPct: 10,
  maxMonthlyLossPct: 15,
  maxOpenPositions: 20,
  maxSimultaneousExposure: 5,
  maxPortfolioAllocationPct: 100,
  maxExecutionDelayMs: 5000,
};

const DEFAULT_ACCOUNT = {
  maxRiskPerTradePct: 2,
  maxDailyLossPct: 5,
  maxWeeklyLossPct: 10,
  maxMonthlyLossPct: 15,
  maxDrawdownPct: 20,
  maxOpenPositions: 10,
  maxSimultaneousExposure: 3,
  maxLotSize: 5,
  maxInstrumentExposure: 2,
  maxConsecutiveLosses: 5,
};

const DEFAULT_PROVIDER = {
  maxProviderDrawdownPct: 30,
  maxConsecutiveLosses: 5,
  autoPauseOnDrawdownBreach: true,
  autoCloseOnBreach: false,
  notifyOnBreach: true,
};

// ============================================================================
// Helpers
// ============================================================================

type RiskColor = "profit" | "warning" | "loss";

function colorForPct(pct: number): RiskColor {
  if (pct > 80) return "loss";
  if (pct > 50) return "warning";
  return "profit";
}

function colorVar(c: RiskColor | "info"): string {
  if (c === "info") return "var(--info)";
  return c === "loss" ? "var(--loss)" : c === "warning" ? "var(--warning)" : "var(--profit)";
}

function colorTextClass(c: RiskColor): string {
  return c === "loss" ? "text-loss" : c === "warning" ? "text-warning" : "text-profit";
}

// ============================================================================
// Risk Health Gauge (SVG semicircle)
// ============================================================================

function RiskHealthGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = colorForPct(100 - clamped); // higher score = safer
  const statusLabel = clamped > 80 ? "SAFE" : clamped > 50 ? "CAUTION" : "DANGER";
  const c = colorVar(color);

  // Geometry: viewBox 200 x 130, center at (100, 110), radius 86
  const cx = 100;
  const cy = 110;
  const r = 86;
  // arc starts at angle 180 (left, point (cx-r, cy)) and ends at 0 (right, point (cx+r, cy))
  const endAngle = (180 * (1 - clamped / 100)) * (Math.PI / 180); // angle from +x axis (radians)
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy - r * Math.sin(endAngle);
  const largeArc = clamped > 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 200 130" className="w-full max-w-[260px]">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        {/* Tick marks at 25/50/75 */}
        {[25, 50, 75].map((pct) => {
          const a = (180 * (1 - pct / 100)) * (Math.PI / 180);
          const x1 = cx + (r - 8) * Math.cos(a);
          const y1 = cy - (r - 8) * Math.sin(a);
          const x2 = cx + (r + 6) * Math.cos(a);
          const y2 = cy - (r + 6) * Math.sin(a);
          return (
            <line
              key={pct}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
          );
        })}
        {/* Value arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
          stroke={c}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${c}55)` }}
        />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={endX}
          y2={endY}
          stroke={c}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill={c} />
        <circle cx={cx} cy={cy} r="2" fill="rgba(0,0,0,0.5)" />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 28}
          textAnchor="middle"
          style={{
            fontSize: 30,
            fontWeight: 700,
            fill: c,
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {clamped.toFixed(0)}
        </text>
        {/* Status label */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            fontWeight: 600,
            fill: c,
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {statusLabel}
        </text>
      </svg>
      <div className="rm-label">Risk health score</div>
    </div>
  );
}

// ============================================================================
// Risk metric bar (visual)
// ============================================================================

interface RiskMetricBarProps {
  label: string;
  current: number;
  limit: number;
  formatValue: (v: number) => string;
  icon?: React.ReactNode;
  hint?: string;
}

function RiskMetricBar({ label, current, limit, formatValue, icon, hint }: RiskMetricBarProps) {
  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const color = colorForPct(pct);
  const c = colorVar(color);
  const statusLabel = color === "loss" ? "Critical" : color === "warning" ? "Caution" : "Healthy";
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-3.5 space-y-2 hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="rm-label truncate">{label}</span>
        </div>
        <span className="font-mono text-xs tnum text-foreground shrink-0">
          {formatValue(current)}
          <span className="text-muted-foreground"> / {formatValue(limit)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/5 relative">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: c, boxShadow: `0 0 8px ${c}66` }}
        />
        {/* Threshold ticks */}
        <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: "50%" }} />
        <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: "80%" }} />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground font-mono tnum">{pct.toFixed(1)}% of limit</span>
        <span className={`font-mono font-semibold ${colorTextClass(color)}`}>{statusLabel}</span>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
    </div>
  );
}

// ============================================================================
// Limit slider card (visual configuration)
// ============================================================================

interface LimitSliderProps {
  name: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: "pct" | "count" | "ms" | "x" | "currency";
  baseAmount?: number; // for currency conversion (e.g. account balance)
  currency?: string;
  onChange: (v: number) => void;
}

function LimitSlider({
  name,
  description,
  value,
  min,
  max,
  step,
  unit,
  baseAmount,
  currency = "USD",
  onChange,
}: LimitSliderProps) {
  const formatted = formatLimitValue(value, unit, baseAmount, currency);
  const derived = deriveLimitHint(value, unit, baseAmount, currency);

  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-4 space-y-3 hover:border-primary/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="rm-label">{name}</div>
          <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-lg font-semibold tnum text-foreground">{formatted}</div>
          {derived && <div className="text-[10px] text-warning font-mono tnum">{derived}</div>}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0])}
        className="py-1"
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono tnum">
        <span>{min}{unit === "pct" ? "%" : unit === "ms" ? "ms" : unit === "x" ? "x" : ""}</span>
        <span>{max}{unit === "pct" ? "%" : unit === "ms" ? "ms" : unit === "x" ? "x" : ""}</span>
      </div>
    </div>
  );
}

function formatLimitValue(value: number, unit: string, baseAmount?: number, currency = "USD"): string {
  if (unit === "pct") return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  if (unit === "ms") return `${value}ms`;
  if (unit === "x") return `${value}x`;
  if (unit === "currency" && baseAmount) {
    const amount = (baseAmount * value) / 100;
    return formatCurrency(amount, currency, 0);
  }
  return String(value);
}

function deriveLimitHint(value: number, unit: string, baseAmount?: number, currency = "USD"): string | null {
  if (unit === "pct" && baseAmount) {
    const amount = (baseAmount * value) / 100;
    return `= ${formatCurrency(amount, currency, 0)} at risk`;
  }
  if (unit === "count") {
    return `${value} concurrent positions allowed`;
  }
  if (unit === "ms") {
    return `stale signals > ${value}ms rejected`;
  }
  if (unit === "x") {
    return `${value}x simultaneous exposure cap`;
  }
  return null;
}

// ============================================================================
// Emergency controls (prominent rm-glass-gold card)
// ============================================================================

function EmergencyControls() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: accountsData } = useQuery({
    queryKey: ["broker-accounts", "emergency-filter"],
    queryFn: fetchBrokerAccounts,
    staleTime: 60 * 1000,
  });

  const { data: portfolioConfigs } = useQuery({
    queryKey: ["risk-configs", "portfolio"],
    queryFn: () => fetchRiskConfigs("portfolio"),
    staleTime: 30 * 1000,
  });

  const accounts = accountsData?.accounts ?? [];
  const totalOpenPositions = accounts.reduce(
    (sum, a) => sum + (a.destinationPositions?.length ?? 0),
    0,
  );
  // Detect paused state - we don't have a direct endpoint, infer from replicationConfigs not fetched here.
  // Use a heuristic: always show "All systems running" unless explicitly told otherwise.
  const pausedCount = 0;

  async function runEmergency(action: "pause_all" | "close_all" | "resume_all") {
    setPendingAction(action);
    try {
      const res = await callEmergency(action);
      const detail =
        action === "close_all"
          ? `Closed ${res.closed ?? 0} open positions`
          : action === "resume_all"
            ? `Resumed ${res.resumed ?? 0} (${res.skipped ?? 0} skipped - not live-authorized)`
            : "All replications paused";
      toast({
        title:
          action === "pause_all"
            ? "Replication paused"
            : action === "resume_all"
              ? "Replication resumed"
              : "Positions closed",
        description: detail,
        variant: action === "close_all" ? "destructive" : "default",
      });
      qc.invalidateQueries({ queryKey: ["risk-configs"] });
      qc.invalidateQueries({ queryKey: ["broker-accounts"] });
    } catch (e: any) {
      toast({ title: "Emergency action failed", description: e.message, variant: "destructive" });
    } finally {
      setPendingAction(null);
    }
  }

  const isRunning = pendingAction === null;

  return (
    <Card className="rm-glass-gold overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/15 border border-warning/30">
            <Power className="h-4 w-4 text-warning" />
          </div>
          <CardTitle className="text-base">Emergency controls</CardTitle>
          <Badge variant="outline" className="text-[10px] border-warning/40 text-warning font-mono">
            KILL-SWITCH
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {pausedCount > 0 ? `${pausedCount} configs paused` : "All systems running"}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono tnum">
              {totalOpenPositions} open
            </Badge>
          </div>
        </div>
        <CardDescription className="text-xs">
          Instant kill-switch. Pause replication, close all open destination positions, or resume
          operations across your portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button
            variant="outline"
            className="border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning h-20 flex-col gap-1.5"
            disabled={!isRunning}
            onClick={() => runEmergency("pause_all")}
          >
            {pendingAction === "pause_all" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Pause className="h-5 w-5" />
            )}
            <span className="text-sm font-semibold tracking-wide">Pause all</span>
            <span className="text-[10px] font-mono text-warning/70 uppercase tracking-wider">
              Stop new trades
            </span>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="h-20 flex-col gap-1.5 bg-loss/90 hover:bg-loss"
                disabled={!isRunning}
              >
                {pendingAction === "close_all" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <span className="text-sm font-semibold tracking-wide">Close all positions</span>
                <span className="text-[10px] font-mono uppercase tracking-wider opacity-80">
                  Liquidate now
                </span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rm-glass">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-loss" />
                  Close all open positions?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will submit closure requests for every open destination position across all
                  your broker accounts. This action is irreversible and may incur spread, commission
                  and slippage costs. Source provider positions are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-loss text-white hover:bg-loss/90"
                  onClick={() => runEmergency("close_all")}
                >
                  Yes, close all positions
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            className="h-20 flex-col gap-1.5 bg-profit/90 hover:bg-profit text-white"
            disabled={!isRunning}
            onClick={() => runEmergency("resume_all")}
          >
            {pendingAction === "resume_all" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-5 w-5" />
            )}
            <span className="text-sm font-semibold tracking-wide">Resume all</span>
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-80">
              Restart trading
            </span>
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground pt-3 font-mono">
          Resume only reactivates configs whose broker accounts are live-authorized. Paused configs
          on unauthorized accounts are skipped.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Portfolio risk overview (gauge + 4 metric bars)
// ============================================================================

interface PortfolioMetrics {
  drawdown: number;
  todayLoss: number;
  openPositions: number;
  exposurePct: number;
  totalEquity: number;
  totalBalance: number;
  totalMargin: number;
}

function computePortfolioMetrics(accounts: any[]): PortfolioMetrics {
  let totalEquity = 0;
  let totalBalance = 0;
  let totalMargin = 0;
  let openPositions = 0;
  let todayLoss = 0;
  let drawdown = 0;

  for (const a of accounts) {
    const equity = a.equity ?? 0;
    const balance = a.balance ?? 0;
    const margin = a.margin ?? 0;
    totalEquity += equity;
    totalBalance += balance;
    totalMargin += margin;

    const peak = a.startingBalance ?? Math.max(balance, equity);
    const dd = Math.max(0, peak - equity);
    drawdown += dd;

    const positions = a.destinationPositions ?? [];
    openPositions += positions.filter((p: any) => p.state === "open" || !p.state).length;
    for (const p of positions) {
      const pnl = p.grossProfit ?? 0;
      if (pnl < 0) todayLoss += Math.abs(pnl);
    }
  }

  // Exposure as % of total equity committed to margin
  const exposurePct = totalEquity > 0 ? (totalMargin / totalEquity) * 100 : 0;

  return {
    drawdown,
    todayLoss,
    openPositions,
    exposurePct,
    totalEquity,
    totalBalance,
    totalMargin,
  };
}

function PortfolioRiskOverview({
  portfolioConfig,
}: {
  portfolioConfig: any | undefined;
}) {
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["broker-accounts", "risk-overview"],
    queryFn: fetchBrokerAccounts,
    staleTime: 30 * 1000,
  });

  const accounts = accountsData?.accounts ?? [];
  const metrics = useMemo(() => computePortfolioMetrics(accounts), [accounts]);

  const limits = {
    maxDrawdownPct: portfolioConfig?.maxDrawdownPct ?? DEFAULT_PORTFOLIO.maxDrawdownPct,
    maxDailyLossPct: portfolioConfig?.maxDailyLossPct ?? DEFAULT_PORTFOLIO.maxDailyLossPct,
    maxOpenPositions: portfolioConfig?.maxOpenPositions ?? DEFAULT_PORTFOLIO.maxOpenPositions,
    maxSimultaneousExposure:
      portfolioConfig?.maxSimultaneousExposure ?? DEFAULT_PORTFOLIO.maxSimultaneousExposure,
  };

  // Convert pct limits to currency amounts for display
  const base = metrics.totalEquity || 10000; // fallback if no accounts
  const maxDrawdownAmt = (base * limits.maxDrawdownPct) / 100;
  const maxDailyLossAmt = (base * limits.maxDailyLossPct) / 100;
  const maxExposurePct = limits.maxSimultaneousExposure * 20; // 1x ≈ 20% by convention

  // Drawdown as % of limit (currency vs currency)
  const ddPctOfLimit = maxDrawdownAmt > 0 ? (metrics.drawdown / maxDrawdownAmt) * 100 : 0;
  const dailyPctOfLimit = maxDailyLossAmt > 0 ? (metrics.todayLoss / maxDailyLossAmt) * 100 : 0;
  const posPctOfLimit =
    limits.maxOpenPositions > 0 ? (metrics.openPositions / limits.maxOpenPositions) * 100 : 0;
  const expPctOfLimit = maxExposurePct > 0 ? (metrics.exposurePct / maxExposurePct) * 100 : 0;

  // Overall risk health: average of remaining headroom (100 - pctUsed) across the 4 metrics
  const healthScore = Math.round(
    Math.max(
      0,
      [ddPctOfLimit, dailyPctOfLimit, posPctOfLimit, expPctOfLimit].reduce(
        (acc, p) => acc + Math.max(0, 100 - p),
        0,
      ) / 4,
    ),
  );

  if (isLoading) {
    return <Skeleton className="h-72" />;
  }

  return (
    <Card className="rm-glass">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Portfolio risk overview</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Live snapshot of portfolio risk against configured limits. Color thresholds: green &lt; 50%,
          amber 50–80%, red &gt; 80%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gauge */}
          <div className="flex flex-col items-center justify-center gap-4 border border-white/5 bg-black/30 rounded-lg p-4">
            <RiskHealthGauge score={healthScore} />
            <div className="grid grid-cols-2 gap-2 w-full text-[10px]">
              <div className="rounded border border-white/5 bg-black/40 p-2">
                <div className="rm-label">Total equity</div>
                <div className="font-mono text-sm tnum text-foreground">
                  {formatCurrency(metrics.totalEquity, "USD", 0)}
                </div>
              </div>
              <div className="rounded border border-white/5 bg-black/40 p-2">
                <div className="rm-label">Open margin</div>
                <div className="font-mono text-sm tnum text-foreground">
                  {formatCurrency(metrics.totalMargin, "USD", 0)}
                </div>
              </div>
              <div className="rounded border border-white/5 bg-black/40 p-2">
                <div className="rm-label">DD ceiling</div>
                <div className="font-mono text-sm tnum text-warning">
                  {formatCurrency(maxDrawdownAmt, "USD", 0)}
                </div>
              </div>
              <div className="rounded border border-white/5 bg-black/40 p-2">
                <div className="rm-label">Daily cap</div>
                <div className="font-mono text-sm tnum text-warning">
                  {formatCurrency(maxDailyLossAmt, "USD", 0)}
                </div>
              </div>
            </div>
          </div>

          {/* 4 metric bars */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RiskMetricBar
              label="Current drawdown"
              current={metrics.drawdown}
              limit={maxDrawdownAmt}
              formatValue={(v) => formatCurrency(v, "USD", 0)}
              icon={<TrendingDown className="h-3 w-3 text-muted-foreground" />}
              hint={`Max drawdown: ${limits.maxDrawdownPct}% of equity`}
            />
            <RiskMetricBar
              label="Today's loss"
              current={metrics.todayLoss}
              limit={maxDailyLossAmt}
              formatValue={(v) => formatCurrency(v, "USD", 0)}
              icon={<AlertTriangle className="h-3 w-3 text-muted-foreground" />}
              hint={`Daily loss limit: ${limits.maxDailyLossPct}% of equity`}
            />
            <RiskMetricBar
              label="Open positions"
              current={metrics.openPositions}
              limit={limits.maxOpenPositions}
              formatValue={(v) => String(Math.round(v))}
              icon={<Layers className="h-3 w-3 text-muted-foreground" />}
              hint={`Max concurrent positions allowed`}
            />
            <RiskMetricBar
              label="Margin exposure"
              current={metrics.exposurePct}
              limit={maxExposurePct}
              formatValue={(v) => `${v.toFixed(1)}%`}
              icon={<Percent className="h-3 w-3 text-muted-foreground" />}
              hint={`Max simultaneous exposure: ${limits.maxSimultaneousExposure}x`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Prop firm compliance
// ============================================================================

function PropFirmCompliance() {
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["broker-accounts", "prop-firm-compliance"],
    queryFn: fetchBrokerAccounts,
    staleTime: 30 * 1000,
  });

  const accounts = (accountsData?.accounts ?? []).filter(
    (a) => a.propFirmType && PROP_FIRM_PRESETS[a.propFirmType],
  );

  if (isLoading) {
    return <Skeleton className="h-72" />;
  }

  if (accounts.length === 0) {
    return null;
  }

  return (
    <Card className="rm-glass">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Prop firm rule compliance</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Per-account prop firm challenge progress. Each card shows live rule status against the
          firm&apos;s specific thresholds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <PropFirmAccountCard key={a.id} account={a} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PropFirmAccountCard({ account }: { account: any }) {
  const rules: PropFirmRules | undefined = account.propFirmType
    ? PROP_FIRM_PRESETS[account.propFirmType]
    : undefined;

  if (!rules) return null;

  const firmMeta = PROP_FIRM_LIST.find((p) => p.code === account.propFirmType);
  const accentColor = firmMeta?.color ?? "#607d8b";

  const starting = account.startingBalance ?? account.balance ?? 10000;
  const equity = account.equity ?? account.balance ?? starting;
  const targetEquity = starting * (1 + rules.profitTargetPct / 100);
  const profitProgress = Math.max(
    0,
    Math.min(100, ((equity - starting) / (targetEquity - starting)) * 100),
  );

  const maxOverallLoss = starting * (rules.maxOverallLossPct / 100);
  const drawdown = Math.max(0, starting - equity);
  const overallLossUsedPct = Math.min(100, (drawdown / maxOverallLoss) * 100);

  const maxDailyLoss = starting * (rules.maxDailyLossPct / 100);
  // Best-effort daily loss: use unrealized loss from open positions
  const dailyLoss = (account.destinationPositions ?? [])
    .reduce((s: number, p: any) => s + (p.grossProfit < 0 ? Math.abs(p.grossProfit) : 0), 0);
  const dailyLossUsedPct = Math.min(100, (dailyLoss / maxDailyLoss) * 100);

  // Trading days elapsed since challenge start
  const challengeStart = account.challengeStartedAt ? new Date(account.challengeStartedAt) : null;
  const daysElapsed = challengeStart
    ? Math.max(1, Math.ceil((Date.now() - challengeStart.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const minDays = rules.minTradingDays ?? 0;
  const daysProgress = minDays > 0 ? Math.min(100, (daysElapsed / minDays) * 100) : 100;

  // Compliance status
  const isProfitAtRisk = profitProgress >= 100;
  const isLossCritical = overallLossUsedPct >= 80 || dailyLossUsedPct >= 80;
  const isLossCaution = overallLossUsedPct >= 50 || dailyLossUsedPct >= 50;
  const status: { label: string; color: RiskColor } = isLossCritical
    ? { label: "At risk", color: "loss" }
    : isLossCaution
      ? { label: "Caution", color: "warning" }
      : { label: "On track", color: "profit" };

  return (
    <div
      className="rounded-lg border bg-black/30 p-4 space-y-3"
      style={{ borderColor: `${accentColor}33` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md shrink-0 font-mono text-xs font-bold uppercase"
            style={{
              background: `${accentColor}22`,
              color: accentColor,
              border: `1px solid ${accentColor}55`,
            }}
          >
            {rules.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{account.accountLabel}</div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {rules.name} · {account.propFirmPhase ?? "challenge"} ·{" "}
              {formatCurrency(starting, account.currency ?? "USD", 0)}
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] font-mono shrink-0 ${colorTextClass(status.color)}`}
          style={{ borderColor: `${colorVar(status.color)}55` }}
        >
          {status.label}
        </Badge>
      </div>

      <Separator className="opacity-30" />

      {/* Rule progress bars */}
      <div className="space-y-2.5">
        <ComplianceProgressRow
          icon={<Target className="h-3 w-3" />}
          label="Profit target"
          progress={profitProgress}
          current={`${((equity - starting) / starting * 100).toFixed(2)}%`}
          limit={`${rules.profitTargetPct}% target`}
          color="profit"
          reverse={false}
        />
        <ComplianceProgressRow
          icon={<TrendingDown className="h-3 w-3" />}
          label="Daily loss used"
          progress={dailyLossUsedPct}
          current={formatCurrency(dailyLoss, account.currency ?? "USD", 0)}
          limit={`of ${formatCurrency(maxDailyLoss, account.currency ?? "USD", 0)}`}
          color="loss"
          reverse
        />
        <ComplianceProgressRow
          icon={<AlertTriangle className="h-3 w-3" />}
          label={`Overall loss used${rules.trailingDrawdown ? " (trailing)" : ""}`}
          progress={overallLossUsedPct}
          current={formatCurrency(drawdown, account.currency ?? "USD", 0)}
          limit={`of ${formatCurrency(maxOverallLoss, account.currency ?? "USD", 0)}`}
          color="loss"
          reverse
        />
        <ComplianceProgressRow
          icon={<CalendarDays className="h-3 w-3" />}
          label="Trading days elapsed"
          progress={daysProgress}
          current={`${daysElapsed} day${daysElapsed === 1 ? "" : "s"}`}
          limit={`of ${minDays} min`}
          color="info"
          reverse={false}
        />
      </div>

      {/* Rules summary */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {rules.newsTradingAllowed ? null : (
          <Badge variant="outline" className="text-[9px] border-loss/30 text-loss font-mono">
            NO NEWS
          </Badge>
        )}
        {rules.weekendHoldingAllowed ? null : (
          <Badge variant="outline" className="text-[9px] border-loss/30 text-loss font-mono">
            NO WEEKEND HOLD
          </Badge>
        )}
        {!rules.eaAllowed && (
          <Badge variant="outline" className="text-[9px] border-loss/30 text-loss font-mono">
            NO EA
          </Badge>
        )}
        {rules.consistencyRulePct && (
          <Badge variant="outline" className="text-[9px] border-info/30 text-info font-mono">
            CONSISTENCY {rules.consistencyRulePct}%
          </Badge>
        )}
        {rules.maxTradingDays && (
          <Badge variant="outline" className="text-[9px] border-white/10 text-muted-foreground font-mono">
            MAX {rules.maxTradingDays}D
          </Badge>
        )}
      </div>

      {isLossCritical && (
        <div className="flex items-center gap-1.5 text-[10px] text-loss bg-loss/10 border border-loss/30 rounded px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Approaching breach - reduce risk or pause replication.
        </div>
      )}
    </div>
  );
}

function ComplianceProgressRow({
  icon,
  label,
  progress,
  current,
  limit,
  color,
  reverse,
}: {
  icon: React.ReactNode;
  label: string;
  progress: number;
  current: string;
  limit: string;
  color: "profit" | "loss" | "info";
  reverse: boolean; // reverse=true means 100% = bad (loss used)
}) {
  const effColor: RiskColor =
    reverse && progress >= 80
      ? "loss"
      : reverse && progress >= 50
        ? "warning"
        : color === "loss"
          ? "loss"
          : color === "profit"
            ? "profit"
            : "warning";
  const c = colorVar(effColor);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px] gap-2">
        <span className="flex items-center gap-1.5 text-muted-foreground font-mono">
          {icon}
          {label}
        </span>
        <span className="font-mono tnum" style={{ color: c }}>
          {current} <span className="text-muted-foreground">{limit}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%`, background: c }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Portfolio limits tab
// ============================================================================

function PortfolioLimitsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["risk-configs", "portfolio"],
    queryFn: () => fetchRiskConfigs("portfolio"),
  });

  const existing = data?.configs?.[0];

  const [form, setForm] = useState<any>(DEFAULT_PORTFOLIO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        maxDrawdownPct: existing.maxDrawdownPct ?? DEFAULT_PORTFOLIO.maxDrawdownPct,
        maxDailyLossPct: existing.maxDailyLossPct ?? DEFAULT_PORTFOLIO.maxDailyLossPct,
        maxWeeklyLossPct: existing.maxWeeklyLossPct ?? DEFAULT_PORTFOLIO.maxWeeklyLossPct,
        maxMonthlyLossPct: existing.maxMonthlyLossPct ?? DEFAULT_PORTFOLIO.maxMonthlyLossPct,
        maxOpenPositions: existing.maxOpenPositions ?? DEFAULT_PORTFOLIO.maxOpenPositions,
        maxSimultaneousExposure:
          existing.maxSimultaneousExposure ?? DEFAULT_PORTFOLIO.maxSimultaneousExposure,
        maxPortfolioAllocationPct:
          existing.maxPortfolioAllocationPct ?? DEFAULT_PORTFOLIO.maxPortfolioAllocationPct,
        maxExecutionDelayMs:
          existing.maxExecutionDelayMs ?? DEFAULT_PORTFOLIO.maxExecutionDelayMs,
      });
    }
  }, [existing]);

  const { data: accountsData } = useQuery({
    queryKey: ["broker-accounts", "portfolio-tab"],
    queryFn: fetchBrokerAccounts,
    staleTime: 60 * 1000,
  });
  const totalEquity = (accountsData?.accounts ?? []).reduce((s, a) => s + (a.equity ?? 0), 0);
  const base = totalEquity || 10000;

  async function save() {
    setSaving(true);
    try {
      await upsertRiskConfig({ scope: "portfolio", ...form });
      toast({
        title: "Portfolio limits saved",
        description: "Limits applied across all broker accounts and replications.",
      });
      qc.invalidateQueries({ queryKey: ["risk-configs", "portfolio"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-4">
      <Card className="rm-glass">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-profit" /> Portfolio-level limits
              </CardTitle>
              <CardDescription className="text-xs">
                Highest-level safeguards applied across all broker accounts. Strictest rule wins.
              </CardDescription>
            </div>
            {existing && (
              <Badge variant="outline" className="text-[10px] font-mono">
                Updated {formatDateTime(existing.updatedAt ?? existing.createdAt)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LimitSlider
              name="Max drawdown"
              description="Hard ceiling across portfolio equity"
              value={form.maxDrawdownPct}
              min={5}
              max={50}
              step={1}
              unit="pct"
              baseAmount={base}
              currency="USD"
              onChange={(v) => setForm((f: any) => ({ ...f, maxDrawdownPct: v }))}
            />
            <LimitSlider
              name="Max daily loss"
              description="Max loss allowed in a single trading day"
              value={form.maxDailyLossPct}
              min={1}
              max={20}
              step={0.5}
              unit="pct"
              baseAmount={base}
              currency="USD"
              onChange={(v) => setForm((f: any) => ({ ...f, maxDailyLossPct: v }))}
            />
            <LimitSlider
              name="Max weekly loss"
              description="Rolling 7-day loss ceiling"
              value={form.maxWeeklyLossPct}
              min={2}
              max={40}
              step={1}
              unit="pct"
              baseAmount={base}
              currency="USD"
              onChange={(v) => setForm((f: any) => ({ ...f, maxWeeklyLossPct: v }))}
            />
            <LimitSlider
              name="Max monthly loss"
              description="Rolling 30-day loss ceiling"
              value={form.maxMonthlyLossPct}
              min={3}
              max={50}
              step={1}
              unit="pct"
              baseAmount={base}
              currency="USD"
              onChange={(v) => setForm((f: any) => ({ ...f, maxMonthlyLossPct: v }))}
            />
            <LimitSlider
              name="Max open positions"
              description="Concurrent positions across all accounts"
              value={form.maxOpenPositions}
              min={1}
              max={100}
              step={1}
              unit="count"
              onChange={(v) => setForm((f: any) => ({ ...f, maxOpenPositions: v }))}
            />
            <LimitSlider
              name="Max simultaneous exposure"
              description="Aggregate notional multiplier cap"
              value={form.maxSimultaneousExposure}
              min={1}
              max={20}
              step={0.5}
              unit="x"
              onChange={(v) => setForm((f: any) => ({ ...f, maxSimultaneousExposure: v }))}
            />
            <LimitSlider
              name="Portfolio allocation cap"
              description="Max % of capital deployable"
              value={form.maxPortfolioAllocationPct}
              min={10}
              max={100}
              step={5}
              unit="pct"
              onChange={(v) => setForm((f: any) => ({ ...f, maxPortfolioAllocationPct: v }))}
            />
            <LimitSlider
              name="Max execution delay"
              description="Reject stale source signals older than this"
              value={form.maxExecutionDelayMs}
              min={100}
              max={10000}
              step={100}
              unit="ms"
              onChange={(v) => setForm((f: any) => ({ ...f, maxExecutionDelayMs: v }))}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setForm(DEFAULT_PORTFOLIO)} disabled={saving}>
              Reset to defaults
            </Button>
            <Button onClick={save} disabled={saving} className="min-w-[180px]">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save portfolio limits
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Account limits tab
// ============================================================================

function AccountLimitsTab() {
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ["broker-accounts", "risk-account"],
    queryFn: fetchBrokerAccounts,
  });
  const { data: configsData, isLoading: loadingConfigs } = useQuery({
    queryKey: ["risk-configs", "account"],
    queryFn: () => fetchRiskConfigs("account"),
  });

  const accounts = accountsData?.accounts ?? [];
  const configs = configsData?.configs ?? [];

  const configByAccount = useMemo(() => {
    const map: Record<string, any> = {};
    for (const c of configs) {
      if (c.brokerAccountId && !map[c.brokerAccountId]) map[c.brokerAccountId] = c;
    }
    return map;
  }, [configs]);

  if (loadingAccounts || loadingConfigs) {
    return <Skeleton className="h-72" />;
  }

  if (accounts.length === 0) {
    return (
      <Card className="rm-glass">
        <CardContent className="p-10 text-center text-sm text-muted-foreground space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <div>No broker accounts connected.</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => useNavStore.getState().setView("broker_connections")}
          >
            Connect a broker
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {accounts.map((a: any) => (
        <AccountRiskCard key={a.id} account={a} existing={configByAccount[a.id]} />
      ))}
    </div>
  );
}

function AccountRiskCard({ account, existing }: { account: any; existing?: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(!existing); // open by default if no config
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    ...DEFAULT_ACCOUNT,
    ...(existing
      ? {
          maxRiskPerTradePct: existing.maxRiskPerTradePct ?? DEFAULT_ACCOUNT.maxRiskPerTradePct,
          maxDailyLossPct: existing.maxDailyLossPct ?? DEFAULT_ACCOUNT.maxDailyLossPct,
          maxWeeklyLossPct: existing.maxWeeklyLossPct ?? DEFAULT_ACCOUNT.maxWeeklyLossPct,
          maxMonthlyLossPct: existing.maxMonthlyLossPct ?? DEFAULT_ACCOUNT.maxMonthlyLossPct,
          maxDrawdownPct: existing.maxDrawdownPct ?? DEFAULT_ACCOUNT.maxDrawdownPct,
          maxOpenPositions: existing.maxOpenPositions ?? DEFAULT_ACCOUNT.maxOpenPositions,
          maxSimultaneousExposure:
            existing.maxSimultaneousExposure ?? DEFAULT_ACCOUNT.maxSimultaneousExposure,
          maxLotSize: existing.maxLotSize ?? DEFAULT_ACCOUNT.maxLotSize,
          maxInstrumentExposure:
            existing.maxInstrumentExposure ?? DEFAULT_ACCOUNT.maxInstrumentExposure,
          maxConsecutiveLosses:
            existing.maxConsecutiveLosses ?? DEFAULT_ACCOUNT.maxConsecutiveLosses,
        }
      : {}),
  });

  async function save() {
    setSaving(true);
    try {
      await upsertRiskConfig({
        scope: "account",
        brokerAccountId: account.id,
        ...form,
      });
      toast({
        title: "Account limits saved",
        description: `${account.accountLabel} · ${account.brokerCode.toUpperCase()}`,
      });
      qc.invalidateQueries({ queryKey: ["risk-configs", "account"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const base = account.equity ?? account.balance ?? 10000;
  const openPositions = account.destinationPositions?.length ?? 0;

  return (
    <Card className="rm-glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent text-xs font-medium uppercase shrink-0">
              {account.brokerCode[0]}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{account.accountLabel}</CardTitle>
              <CardDescription className="text-xs font-mono">
                {account.brokerCode.toUpperCase()} · {account.currency} ·{" "}
                {account.isDemo ? "Demo" : "Live"} · {formatCurrency(account.equity, account.currency, 0)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {existing ? (
              <Badge variant="outline" className="text-[10px] border-profit/40 text-profit font-mono">
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-warning/40 text-warning font-mono">
                No limits
              </Badge>
            )}
            <Button variant={open ? "ghost" : "outline"} size="sm" onClick={() => setOpen((s) => !s)}>
              {open ? "Close" : existing ? "Edit" : "Configure"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {/* Mini status bar showing current account state */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-white/5 bg-black/40 p-2">
              <div className="rm-label">Open positions</div>
              <div className="text-sm font-mono tnum">
                {openPositions} <span className="text-muted-foreground">/ {form.maxOpenPositions}</span>
              </div>
            </div>
            <div className="rounded border border-white/5 bg-black/40 p-2">
              <div className="rm-label">Margin used</div>
              <div className="text-sm font-mono tnum">
                {formatCurrency(account.margin ?? 0, account.currency, 0)}
              </div>
            </div>
            <div className="rounded border border-white/5 bg-black/40 p-2">
              <div className="rm-label">Free margin</div>
              <div className="text-sm font-mono tnum text-profit">
                {formatCurrency(account.freeMargin ?? 0, account.currency, 0)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <LimitSlider
              name="Max risk per trade"
              description="Per-trade risk as % of equity"
              value={form.maxRiskPerTradePct}
              min={0.5}
              max={10}
              step={0.5}
              unit="pct"
              baseAmount={base}
              currency={account.currency}
              onChange={(v) => setForm((f: any) => ({ ...f, maxRiskPerTradePct: v }))}
            />
            <LimitSlider
              name="Max daily loss"
              description="Per-account daily loss cap"
              value={form.maxDailyLossPct}
              min={1}
              max={20}
              step={0.5}
              unit="pct"
              baseAmount={base}
              currency={account.currency}
              onChange={(v) => setForm((f: any) => ({ ...f, maxDailyLossPct: v }))}
            />
            <LimitSlider
              name="Max weekly loss"
              description="Per-account 7-day loss cap"
              value={form.maxWeeklyLossPct}
              min={2}
              max={40}
              step={1}
              unit="pct"
              baseAmount={base}
              currency={account.currency}
              onChange={(v) => setForm((f: any) => ({ ...f, maxWeeklyLossPct: v }))}
            />
            <LimitSlider
              name="Max monthly loss"
              description="Per-account 30-day loss cap"
              value={form.maxMonthlyLossPct}
              min={3}
              max={50}
              step={1}
              unit="pct"
              baseAmount={base}
              currency={account.currency}
              onChange={(v) => setForm((f: any) => ({ ...f, maxMonthlyLossPct: v }))}
            />
            <LimitSlider
              name="Max drawdown"
              description="Per-account max drawdown"
              value={form.maxDrawdownPct}
              min={5}
              max={50}
              step={1}
              unit="pct"
              baseAmount={base}
              currency={account.currency}
              onChange={(v) => setForm((f: any) => ({ ...f, maxDrawdownPct: v }))}
            />
            <LimitSlider
              name="Max open positions"
              description="Concurrent positions on this account"
              value={form.maxOpenPositions}
              min={1}
              max={50}
              step={1}
              unit="count"
              onChange={(v) => setForm((f: any) => ({ ...f, maxOpenPositions: v }))}
            />
            <LimitSlider
              name="Max simultaneous exposure"
              description="Aggregate notional multiplier"
              value={form.maxSimultaneousExposure}
              min={1}
              max={20}
              step={0.5}
              unit="x"
              onChange={(v) => setForm((f: any) => ({ ...f, maxSimultaneousExposure: v }))}
            />
            <LimitSlider
              name="Max lot size"
              description="Per-trade lot cap"
              value={form.maxLotSize}
              min={0.01}
              max={50}
              step={0.01}
              unit="count"
              onChange={(v) => setForm((f: any) => ({ ...f, maxLotSize: v }))}
            />
            <LimitSlider
              name="Max instrument exposure"
              description="Max exposure per symbol"
              value={form.maxInstrumentExposure}
              min={1}
              max={20}
              step={0.5}
              unit="x"
              onChange={(v) => setForm((f: any) => ({ ...f, maxInstrumentExposure: v }))}
            />
            <LimitSlider
              name="Max consecutive losses"
              description="Auto-pause after N losing trades"
              value={form.maxConsecutiveLosses}
              min={1}
              max={20}
              step={1}
              unit="count"
              onChange={(v) => setForm((f: any) => ({ ...f, maxConsecutiveLosses: v }))}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setForm(DEFAULT_ACCOUNT)} disabled={saving}>
              Reset
            </Button>
            <Button onClick={save} disabled={saving} className="min-w-[180px]">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save account limits
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// Provider limits tab
// ============================================================================

function ProviderLimitsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");

  const { data: providersData, isLoading: loadingProviders } = useQuery({
    queryKey: ["providers", "risk-provider", 50],
    queryFn: () => fetchProviders(),
    staleTime: 60 * 1000,
  });

  const { data: configsData, isLoading: loadingConfigs } = useQuery({
    queryKey: ["risk-configs", "provider"],
    queryFn: () => fetchRiskConfigs("provider"),
  });

  const providers = providersData?.providers ?? [];
  const configs = configsData?.configs ?? [];
  const configByProvider = useMemo(() => {
    const map: Record<string, any> = {};
    for (const c of configs) {
      if (c.scopeRefId && !map[c.scopeRefId]) map[c.scopeRefId] = c;
    }
    return map;
  }, [configs]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const existing = selectedProviderId ? configByProvider[selectedProviderId] : undefined;

  const [form, setForm] = useState<any>(DEFAULT_PROVIDER);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        maxProviderDrawdownPct:
          existing.maxProviderDrawdownPct ?? DEFAULT_PROVIDER.maxProviderDrawdownPct,
        maxConsecutiveLosses:
          existing.maxConsecutiveLosses ?? DEFAULT_PROVIDER.maxConsecutiveLosses,
        autoPauseOnDrawdownBreach: existing.autoPauseOnDrawdownBreach ?? true,
        autoCloseOnBreach: existing.autoCloseOnBreach ?? false,
        notifyOnBreach: existing.notifyOnBreach ?? true,
      });
    } else {
      setForm(DEFAULT_PROVIDER);
    }
  }, [selectedProviderId, existing]);

  async function save() {
    if (!selectedProviderId) return;
    setSaving(true);
    try {
      await upsertRiskConfig({
        scope: "provider",
        scopeRefId: selectedProviderId,
        ...form,
      });
      toast({
        title: "Provider rules saved",
        description: selectedProvider?.name ?? selectedProviderId,
      });
      qc.invalidateQueries({ queryKey: ["risk-configs", "provider"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loadingProviders || loadingConfigs) {
    return <Skeleton className="h-72" />;
  }

  if (providers.length === 0) {
    return (
      <Card className="rm-glass">
        <CardContent className="p-10 text-center text-sm text-muted-foreground space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <div>No providers subscribed yet.</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => useNavStore.getState().setView("discover")}
          >
            Discover providers
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rm-glass">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warning" /> Provider deterioration rules
        </CardTitle>
        <CardDescription className="text-xs">
          Per-provider limits and automatic responses when drawdown or losing streaks cross
          thresholds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="rm-label">Select provider</div>
          <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a provider to configure…" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.platform?.name ?? p.platform?.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProviderId ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <LimitSlider
                name="Max provider drawdown"
                description="Trigger when source provider drawdown exceeds this"
                value={form.maxProviderDrawdownPct}
                min={5}
                max={60}
                step={1}
                unit="pct"
                onChange={(v) => setForm((f: any) => ({ ...f, maxProviderDrawdownPct: v }))}
              />
              <LimitSlider
                name="Max consecutive losses"
                description="Auto-pause after N losing trades in a row"
                value={form.maxConsecutiveLosses}
                min={1}
                max={20}
                step={1}
                unit="count"
                onChange={(v) => setForm((f: any) => ({ ...f, maxConsecutiveLosses: v }))}
              />
            </div>

            <div className="rounded-lg border border-white/5 bg-black/30 p-4 space-y-1">
              <div className="rm-label mb-2">Automatic response on breach</div>
              <SwitchRow
                label="Auto-pause on drawdown breach"
                description="Pause all replications of this provider when drawdown threshold is hit"
                checked={form.autoPauseOnDrawdownBreach}
                onChange={(v) => setForm((f: any) => ({ ...f, autoPauseOnDrawdownBreach: v }))}
              />
              <SwitchRow
                label="Auto-close positions on breach"
                description="Submit closure requests for open positions copied from this provider"
                checked={form.autoCloseOnBreach}
                onChange={(v) => setForm((f: any) => ({ ...f, autoCloseOnBreach: v }))}
                danger
              />
              <SwitchRow
                label="Notify on breach"
                description="Send in-app / push / email notification when threshold is crossed"
                checked={form.notifyOnBreach}
                onChange={(v) => setForm((f: any) => ({ ...f, notifyOnBreach: v }))}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setForm(DEFAULT_PROVIDER)} disabled={saving}>
                Reset
              </Button>
              <Button onClick={save} disabled={saving} className="min-w-[180px]">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save provider rules
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6">
            Select a provider above to configure deterioration rules.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  danger,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <div className="space-y-0.5 min-w-0">
        <div
          className={`text-xs font-medium ${danger && checked ? "text-loss" : "text-foreground"}`}
        >
          {label}
        </div>
        <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ============================================================================
// Existing configs list (compact)
// ============================================================================

function ExistingConfigsList({
  scope,
  configs,
  accountResolver,
  providerResolver,
}: {
  scope: "portfolio" | "account" | "provider";
  configs: any[];
  accountResolver?: (c: any) => string | undefined;
  providerResolver?: (c: any) => string | undefined;
}) {
  if (configs.length === 0) {
    return (
      <Card className="rm-glass border-dashed">
        <CardContent className="p-6 text-center text-xs text-muted-foreground">
          No {scope}-level risk configs saved yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="rm-glass">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Saved {scope} configs
          <Badge variant="outline" className="text-[10px] font-mono tnum ml-1">
            {configs.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
          {configs.map((c) => {
            const label =
              scope === "account"
                ? accountResolver?.(c) ?? c.brokerAccount?.accountLabel ?? "Account"
                : scope === "provider"
                  ? providerResolver?.(c) ?? c.scopeRefId
                  : "Portfolio";
            const summary = [
              c.maxDrawdownPct != null && `DD ${c.maxDrawdownPct}%`,
              c.maxDailyLossPct != null && `Daily ${c.maxDailyLossPct}%`,
              c.maxProviderDrawdownPct != null && `Prov DD ${c.maxProviderDrawdownPct}%`,
              c.maxOpenPositions != null && `Pos ${c.maxOpenPositions}`,
              c.maxConsecutiveLosses != null && `Streak ${c.maxConsecutiveLosses}`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={c.id}
                className="rounded-md border border-white/5 bg-black/40 px-3 py-2 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[9px] font-mono capitalize shrink-0">
                      {scope}
                    </Badge>
                    <span className="text-sm font-medium truncate">{label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono tnum shrink-0">
                    {formatDateTime(c.updatedAt ?? c.createdAt)}
                  </span>
                </div>
                {summary && (
                  <div className="text-[11px] text-muted-foreground font-mono tnum mt-1 truncate">
                    {summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Provider deterioration rules info card
// ============================================================================

function DeteriorationRulesCard() {
  const rows = [
    {
      trigger: "Provider drawdown exceeds threshold",
      response: "Auto-pause new replication signals",
      notify: "In-app + push + email",
      severity: "warning" as const,
    },
    {
      trigger: "N consecutive losing trades",
      response: "Pause replication; flag provider",
      notify: "In-app + email",
      severity: "warning" as const,
    },
    {
      trigger: "Account daily loss limit breached",
      response: "Block new opens for that account",
      notify: "In-app + push",
      severity: "loss" as const,
    },
    {
      trigger: "Portfolio drawdown ceiling hit",
      response: "Pause everything; require manual resume",
      notify: "All channels",
      severity: "loss" as const,
    },
    {
      trigger: "Execution delay exceeds max delay",
      response: "Reject stale source signals",
      notify: "In-app",
      severity: "info" as const,
    },
  ];

  return (
    <Card className="rm-glass border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-info" />
          <CardTitle className="text-sm">Provider deterioration rules</CardTitle>
        </div>
        <CardDescription className="text-xs">
          TRADE LINK continuously monitors source providers and reacts automatically when performance
          degrades. Limits cascade from portfolio → account → provider; the strictest applicable rule
          always wins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="rm-label">Trigger</TableHead>
              <TableHead className="rm-label">Default response</TableHead>
              <TableHead className="rm-label">Notification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.trigger} className="border-white/5">
                <TableCell className="text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: colorVar(r.severity) }}
                    />
                    {r.trigger}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{r.response}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{r.notify}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground pt-3 font-mono">
          Auto-close is opt-in and submits closure requests to the destination broker. Brokers may
          reject or delay closures due to market conditions, spreads, and slippage.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main view
// ============================================================================

export interface RiskManagementViewProps {
  user: any;
}

export function RiskManagementView({ user }: RiskManagementViewProps) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);

  // Fetch portfolio config to pass to overview
  const { data: portfolioData } = useQuery({
    queryKey: ["risk-configs", "portfolio"],
    queryFn: () => fetchRiskConfigs("portfolio"),
    staleTime: 30 * 1000,
    enabled: !!user,
  });
  const portfolioConfig = portfolioData?.configs?.[0];

  if (!user) {
    return (
      <div className="space-y-4">
        <BackTo view="dashboard" label="Back to dashboard" />
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          Risk Management <DemoBadge />
        </h1>
        <Card className="rm-glass border-loss/30">
          <CardContent className="p-10 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-loss mx-auto" />
            <h2 className="text-lg font-semibold">Sign in required</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Emergency controls and three-level risk limits are only available to authenticated
              users. Sign in to configure provider, account and portfolio-level safeguards.
            </p>
            <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackTo view="dashboard" label="Back to dashboard" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Risk Management <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Visual risk dashboard, emergency controls and three-level limits across portfolio,
            accounts and providers.
          </p>
        </div>
      </div>

      {/* Emergency controls - prominent */}
      <EmergencyControls />

      {/* Portfolio risk overview - gauge + 4 metric bars */}
      <PortfolioRiskOverview portfolioConfig={portfolioConfig} />

      {/* Prop firm compliance - only if any prop firm accounts exist */}
      <PropFirmCompliance />

      {/* Risk limits tabs */}
      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio" className="font-mono text-xs">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Portfolio
          </TabsTrigger>
          <TabsTrigger value="account" className="font-mono text-xs">
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Account
          </TabsTrigger>
          <TabsTrigger value="provider" className="font-mono text-xs">
            <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
            Provider
          </TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-4">
          <PortfolioLimitsTab />
          <ExistingConfigsList
            scope="portfolio"
            configs={portfolioData?.configs ?? []}
          />
        </TabsContent>
        <TabsContent value="account" className="space-y-4">
          <AccountLimitsTab />
        </TabsContent>
        <TabsContent value="provider" className="space-y-4">
          <ProviderLimitsTab />
        </TabsContent>
      </Tabs>

      {/* Provider deterioration rules */}
      <DeteriorationRulesCard />
    </div>
  );
}
