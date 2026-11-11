"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useNavStore } from "@/lib/nav-store";
import { formatCurrency } from "@/lib/format";
import { DemoBadge } from "@/components/badges";
import { EXECUTION_MODE_LABELS, SIZING_MODE_LABELS } from "@/lib/types";
import type { ExecutionMode, SizingMode } from "@/lib/types";
import {
  Plus,
  Play,
  Pause,
  Square,
  X,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Link2,
  Building2,
  Bot,
  Zap,
  Bell,
  Eye,
  Radio,
  Target,
  Scale,
  Coins,
  ShieldCheck,
  Loader2,
  Wallet,
  Layers,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface BrokerAccount {
  id: string;
  brokerCode: string;
  accountLabel: string;
  balance: number;
  equity: number;
  currency: string;
  isDemo: boolean;
  isLiveAuthorized: boolean;
  status: string;
  authMethod?: string | null;
  destinationPositions?: { id: string }[];
}

interface ReplicationConfig {
  id: string;
  providerId?: string | null;
  sourceBrokerAccountId?: string | null;
  brokerAccountId: string;
  executionMode: ExecutionMode;
  sizingMode: SizingMode;
  equityMultiplier: number;
  fixedLotSize: number | null;
  riskPerTradePct: number | null;
  replicateStopLoss: boolean;
  replicateTakeProfit: boolean;
  replicatePartialClosures: boolean;
  status: "active" | "paused" | "stopped" | "error";
  brokerAccount?: BrokerAccount & { isLiveAuthorized: boolean };
  sourceBrokerAccount?: BrokerAccount | null;
  provider?: {
    id: string;
    name: string;
    platform?: { name?: string } | null;
  } | null;
}

// ============================================================================
// Data fetchers
// ============================================================================

async function fetchConfigs() {
  const res = await fetch("/api/replication");
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<{ configs: ReplicationConfig[] }>;
}

async function fetchBrokers() {
  const res = await fetch("/api/brokers");
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<{ accounts: BrokerAccount[] }>;
}

// ============================================================================
// Broker display helpers
// ============================================================================

const BROKER_LABELS: Record<string, string> = {
  deriv: "Deriv",
  ctrader: "cTrader",
  mt4: "MT4",
  mt5: "MT5",
  ftmo: "FTMO",
  fundednext: "FundedNext",
  myfundedfx: "MyFundedFX",
  the5ers: "The5ers",
  propfirm: "Prop Firm",
  external: "External",
};

function brokerDisplay(code?: string) {
  if (!code) return { label: "Broker", code: "?" };
  return { label: BROKER_LABELS[code] ?? code.toUpperCase(), code: code.toUpperCase() };
}

// ============================================================================
// Main view
// ============================================================================

export function AutomatedTradingView({ user }: { user: any }) {
  const setView = useNavStore((s) => s.setView);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["replication"],
    queryFn: fetchConfigs,
    enabled: !!user,
  });

  const { data: brokersData } = useQuery({
    queryKey: ["brokers"],
    queryFn: fetchBrokers,
    enabled: !!user,
  });

  const configs = data?.configs ?? [];
  const brokerAccounts = brokersData?.accounts ?? [];

  if (!user) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Replication</h1>
        <Card className="rm-glass">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Sign in to manage replication configs.{" "}
            <Button variant="link" className="px-1" onClick={() => setAuthOpen(true)}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Replication <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Mirror trades from a source account to your destination accounts automatically.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Replication
        </Button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : configs.length === 0 ? (
        <EmptyState
          hasBrokerAccounts={brokerAccounts.length > 0}
          onCreate={() => setShowCreate(true)}
          onConnectBroker={() => setView("broker_connections")}
        />
      ) : (
        <div className="space-y-3">
          {configs.map((c) => (
            <ReplicationCard
              key={c.id}
              config={c}
              brokerAccounts={brokerAccounts}
            />
          ))}
        </div>
      )}

      <CreateReplicationWizard
        open={showCreate}
        onOpenChange={setShowCreate}
        brokerAccounts={brokerAccounts}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["replication"] })
        }
        onConnectBroker={() => setView("broker_connections")}
      />
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState({
  hasBrokerAccounts,
  onCreate,
  onConnectBroker,
}: {
  hasBrokerAccounts: boolean;
  onCreate: () => void;
  onConnectBroker: () => void;
}) {
  return (
    <Card className="rm-glass border-dashed">
      <CardContent className="p-10 sm:p-16 text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            You haven&apos;t set up any replication yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Replication copies trades from a source account to your destination
            accounts automatically. Set up your first one in a few guided steps.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> New Replication
          </Button>
          {!hasBrokerAccounts && (
            <Button variant="outline" onClick={onConnectBroker}>
              <Link2 className="h-4 w-4 mr-1.5" /> Connect a broker first
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Replication card (existing config)
// ============================================================================

function ReplicationCard({
  config: c,
  brokerAccounts,
}: {
  config: ReplicationConfig;
  brokerAccounts: BrokerAccount[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // The source may be a broker account (new configs) or a provider (legacy).
  const sourceBroker = c.sourceBrokerAccount ?? brokerAccounts.find((a) => a.id === c.providerId);
  const sourceLabel =
    sourceBroker?.accountLabel ?? c.provider?.name ?? "Unknown source";
  const sourceBrokerInfo = brokerDisplay(
    sourceBroker?.brokerCode ?? c.provider?.platform?.name ?? undefined,
  );

  const dest = c.brokerAccount;
  const destBrokerInfo = brokerDisplay(dest?.brokerCode);

  async function control(
    action: "pause" | "resume" | "stop" | "close_all",
  ): Promise<boolean> {
    setPendingAction(action);
    try {
      const res = await fetch(`/api/replication/${c.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Action failed",
          description: data.error ?? "Unknown error",
          variant: "destructive",
        });
        return false;
      }
      toast({
        title:
          action === "pause" ? "Replication paused" :
          action === "resume" ? "Replication resumed" :
          action === "stop" ? "Replication stopped" :
          "Positions closed",
        description:
          action === "close_all"
            ? `Closed ${data.closed} position(s)${data.failed ? `, ${data.failed} failed` : ""}.`
            : `${sourceLabel} → ${dest?.accountLabel ?? "destination"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      return true;
    } catch (e: any) {
      toast({
        title: "Action failed",
        description: e.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  const statusStyles: Record<string, string> = {
    active: "bg-profit/15 text-profit border-profit/30",
    paused: "bg-warning/15 text-warning border-warning/30",
    stopped: "bg-muted text-muted-foreground border-border",
    error: "bg-loss/15 text-loss border-loss/30",
  };
  const statusLabel: Record<string, string> = {
    active: "Active",
    paused: "Paused",
    stopped: "Stopped",
    error: "Error",
  };

  const sizingSummary = (() => {
    switch (c.sizingMode) {
      case "equity_ratio":
        return `${c.equityMultiplier ?? 1}× equity ratio`;
      case "fixed_multiplier":
        return `${c.equityMultiplier ?? 1}× fixed multiplier`;
      case "fixed_lot":
        return `Fixed ${c.fixedLotSize ?? 0.01} lot`;
      case "risk_based":
        return `Risk ${c.riskPerTradePct ?? 1}% per trade`;
      default:
        return SIZING_MODE_LABELS[c.sizingMode] ?? "—";
    }
  })();

  return (
    <Card className="rm-glass">
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Source → Destination flow */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
          <AccountFlowBadge
            label={sourceLabel}
            brokerLabel={sourceBrokerInfo.label}
            brokerCode={sourceBrokerInfo.code}
            balance={sourceBroker?.balance}
            currency={sourceBroker?.currency}
            tone="source"
          />

          <div className="flex items-center justify-center sm:px-2">
            <ArrowRight className="h-5 w-5 text-primary shrink-0" />
          </div>

          <AccountFlowBadge
            label={dest?.accountLabel ?? "Unknown destination"}
            brokerLabel={destBrokerInfo.label}
            brokerCode={destBrokerInfo.code}
            balance={dest?.balance}
            currency={dest?.currency}
            tone="destination"
          />

          <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] font-mono uppercase tracking-wider ${statusStyles[c.status] ?? statusStyles.stopped}`}
            >
              {statusLabel[c.status] ?? c.status}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] font-mono uppercase tracking-wider bg-black/40 text-muted-foreground border-white/10"
            >
              {EXECUTION_MODE_LABELS[c.executionMode]}
            </Badge>
          </div>
        </div>

        <Separator className="bg-white/5" />

        {/* Sizing summary + flags */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="rm-label">Sizing</div>
            <div className="text-sm font-mono tnum">{sizingSummary}</div>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground flex-wrap">
            {c.replicateStopLoss && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-profit" /> Stop-loss
              </span>
            )}
            {c.replicateTakeProfit && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-profit" /> Take-profit
              </span>
            )}
            {c.replicatePartialClosures && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-profit" /> Partials
              </span>
            )}
          </div>
        </div>

        {/* Live trading warning */}
        {dest && !dest.isDemo && (
          <div className="p-2.5 rounded-md bg-warning/10 border border-warning/30 text-[11px] text-warning flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Live execution is unavailable in this build for{" "}
              <span className="font-mono">{dest.accountLabel}</span>. Trades
              will not be sent to this live account.
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {c.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => control("pause")}
              disabled={pendingAction !== null}
            >
              {pendingAction === "pause" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5 mr-1" />
              )}
              Pause
            </Button>
          )}
          {(c.status === "paused" || c.status === "stopped") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => control("resume")}
              disabled={pendingAction !== null}
            >
              {pendingAction === "resume" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              Resume
            </Button>
          )}
          {c.status !== "stopped" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => control("stop")}
              disabled={pendingAction !== null}
            >
              {pendingAction === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5 mr-1" />
              )}
              Stop
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-loss border-loss/30 hover:bg-loss/10"
                disabled={pendingAction !== null}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Close all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rm-glass">
              <AlertDialogHeader>
                <AlertDialogTitle>Close all destination positions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will close all open destination positions linked to{" "}
                  <span className="font-mono">{sourceLabel}</span> replication on{" "}
                  <span className="font-mono">{dest?.accountLabel}</span>. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => control("close_all")}>
                  Close all positions
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Account flow badge — small pill showing broker + label + balance
// ============================================================================

function AccountFlowBadge({
  label,
  brokerLabel,
  brokerCode,
  balance,
  currency,
  tone,
}: {
  label: string;
  brokerLabel: string;
  brokerCode: string;
  balance?: number;
  currency?: string;
  tone: "source" | "destination";
}) {
  const accent =
    tone === "source"
      ? "border-primary/30 bg-primary/5"
      : "border-info/30 bg-info/5";
  return (
    <div
      className={`flex-1 min-w-0 rounded-md border ${accent} p-3 flex items-center gap-3`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/60 border border-white/10 text-primary font-mono uppercase text-xs font-semibold">
        {brokerCode?.[0] ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{label}</span>
        </div>
        <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
          <span>{brokerLabel}</span>
          {balance !== undefined && (
            <>
              <span className="opacity-40">·</span>
              <span className="tnum">
                {formatCurrency(balance, currency ?? "USD")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Create replication wizard (4-step dialog)
// ============================================================================

interface WizardState {
  step: number;
  sourceAccountId: string;
  destinationAccountId: string;
  sizingMode: SizingMode;
  equityMultiplier: number;
  fixedLotSize: number;
  riskPerTradePct: number;
  executionMode: ExecutionMode;
  replicateStopLoss: boolean;
  replicateTakeProfit: boolean;
  replicatePartialClosures: boolean;
}

const INITIAL_WIZARD: WizardState = {
  step: 1,
  sourceAccountId: "",
  destinationAccountId: "",
  sizingMode: "equity_ratio",
  equityMultiplier: 1,
  fixedLotSize: 0.01,
  riskPerTradePct: 1,
  executionMode: "approval",
  replicateStopLoss: true,
  replicateTakeProfit: true,
  replicatePartialClosures: true,
};

function CreateReplicationWizard({
  open,
  onOpenChange,
  brokerAccounts,
  onCreated,
  onConnectBroker,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brokerAccounts: BrokerAccount[];
  onCreated: () => void;
  onConnectBroker: () => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD);
  const [loading, setLoading] = useState(false);

  function reset() {
    setState(INITIAL_WIZARD);
  }

  function close() {
    onOpenChange(false);
    // Defer reset so the close animation doesn't jump visually
    setTimeout(reset, 200);
  }

  function next() {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, 4) }));
  }
  function back() {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 1) }));
  }

  const sourceAccount = brokerAccounts.find(
    (a) => a.id === state.sourceAccountId,
  );
  const destinationAccount = brokerAccounts.find(
    (a) => a.id === state.destinationAccountId,
  );

  const canProceed =
    state.step === 1
      ? !!state.sourceAccountId
      : state.step === 2
        ? !!state.destinationAccountId && state.destinationAccountId !== state.sourceAccountId
        : state.step === 3
          ? true
          : true;

  async function submit() {
    if (!state.sourceAccountId || !state.destinationAccountId) {
      toast({
        title: "Missing selection",
        description: "Choose a source and destination account first.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/replication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBrokerAccountId: state.sourceAccountId,
          brokerAccountId: state.destinationAccountId,
          executionMode: state.executionMode,
          sizingMode: state.sizingMode,
          equityMultiplier: state.equityMultiplier,
          fixedLotSize:
            state.sizingMode === "fixed_lot" ? state.fixedLotSize : undefined,
          riskPerTradePct:
            state.sizingMode === "risk_based" ? state.riskPerTradePct : undefined,
          replicateStopLoss: state.replicateStopLoss,
          replicateTakeProfit: state.replicateTakeProfit,
          replicatePartialClosures: state.replicatePartialClosures,
          status: "paused",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create replication");
      }
      toast({
        title: "Replication created",
        description: `Copying from ${sourceAccount?.accountLabel ?? "source"} to ${destinationAccount?.accountLabel ?? "destination"}. Starts paused — resume when ready.`,
      });
      onCreated();
      close();
    } catch (e: any) {
      toast({
        title: "Failed to create",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const stepTitles = [
    "Choose your source",
    "Choose your destination",
    "Position sizing",
    "Execution mode",
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
        else onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header — wizard chrome */}
        <div className="px-6 pt-6 pb-4 border-b border-white/5">
          <DialogTitle className="text-base font-semibold">
            New Replication
          </DialogTitle>
          <DialogDescription className="text-xs">
            Set up automated trade mirroring in 4 quick steps.
          </DialogDescription>

          {/* Step indicator */}
          <div className="mt-4 flex items-center gap-2">
            {stepTitles.map((t, i) => {
              const idx = i + 1;
              const isActive = state.step === idx;
              const isDone = state.step > idx;
              return (
                <div key={t} className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className={`flex items-center gap-2 ${idx > 1 ? "hidden sm:flex" : ""}`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 transition-colors ${
                        isActive
                          ? "bg-primary"
                          : isDone
                            ? "bg-primary/60"
                            : "bg-white/15"
                      }`}
                    />
                  </div>
                  <div className={`text-[11px] font-mono uppercase tracking-wider truncate ${isActive ? "text-primary" : isDone ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                    <span className="hidden sm:inline">{t}</span>
                    <span className="sm:hidden">{idx}</span>
                  </div>
                  {idx < stepTitles.length && (
                    <div className="h-px flex-1 bg-white/5 min-w-[8px]" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            Step {state.step} of 4
          </div>
        </div>

        {/* Body — current step */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state.step === 1 && (
            <StepSource
              accounts={brokerAccounts}
              selectedId={state.sourceAccountId}
              onSelect={(id) => setState((s) => ({ ...s, sourceAccountId: id }))}
              onConnectBroker={onConnectBroker}
            />
          )}
          {state.step === 2 && (
            <StepDestination
              accounts={brokerAccounts}
              excludeId={state.sourceAccountId}
              selectedId={state.destinationAccountId}
              onSelect={(id) =>
                setState((s) => ({ ...s, destinationAccountId: id }))
              }
              onConnectBroker={onConnectBroker}
            />
          )}
          {state.step === 3 && (
            <StepSizing
              mode={state.sizingMode}
              equityMultiplier={state.equityMultiplier}
              fixedLotSize={state.fixedLotSize}
              riskPerTradePct={state.riskPerTradePct}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            />
          )}
          {state.step === 4 && (
            <StepExecution
              executionMode={state.executionMode}
              replicateStopLoss={state.replicateStopLoss}
              replicateTakeProfit={state.replicateTakeProfit}
              replicatePartialClosures={state.replicatePartialClosures}
              destination={destinationAccount}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            />
          )}
        </div>

        {/* Footer — nav buttons */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {state.step > 1 && (
              <Button variant="outline" size="sm" onClick={back} disabled={loading}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
            {state.step < 4 ? (
              <Button size="sm" onClick={next} disabled={!canProceed}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                {loading ? "Creating…" : "Create"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Step 1: Choose source
// ============================================================================

function StepSource({
  accounts,
  selectedId,
  onSelect,
  onConnectBroker,
}: {
  accounts: BrokerAccount[];
  selectedId: string;
  onSelect: (id: string) => void;
  onConnectBroker: () => void;
}) {
  const available = accounts.filter((a) => a.status === "connected" && (["mt4", "mt5"].includes(a.brokerCode) || (a.brokerCode === "ctrader" && a.authMethod === "oauth")));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Where do you want to copy from?</h2>
        <p className="text-sm text-muted-foreground">
          This account’s open trades are monitored. cTrader sources currently copy to MT4/MT5 destinations.
        </p>
      </div>

      {available.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/15 p-8 text-center space-y-3">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Connect a broker first</p>
            <p className="text-xs text-muted-foreground">
              Link a cTrader account or pair an online MT4/MT5 terminal to use it as a source.
            </p>
          </div>
          <Button size="sm" onClick={onConnectBroker}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" /> Go to Brokers
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {available.map((a) => (
            <SelectableAccountCard
              key={a.id}
              account={a}
              selected={a.id === selectedId}
              onSelect={() => onSelect(a.id)}
              role="source"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step 2: Choose destination
// ============================================================================

function StepDestination({
  accounts,
  excludeId,
  selectedId,
  onSelect,
  onConnectBroker,
}: {
  accounts: BrokerAccount[];
  excludeId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onConnectBroker: () => void;
}) {
  const available = accounts.filter((a) => a.id !== excludeId && a.status === "connected" && ["mt4", "mt5"].includes(a.brokerCode));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Where do you want to copy to?</h2>
        <p className="text-sm text-muted-foreground">
          Trades from your source will be mirrored here.
        </p>
      </div>

      {available.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/15 p-8 text-center space-y-3">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No other broker accounts</p>
            <p className="text-xs text-muted-foreground">
              Link an online MT4 or MT5 terminal to use as the destination.
            </p>
          </div>
          <Button size="sm" onClick={onConnectBroker}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" /> Connect another broker
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {available.map((a) => (
            <SelectableAccountCard
              key={a.id}
              account={a}
              selected={a.id === selectedId}
              onSelect={() => onSelect(a.id)}
              role="destination"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Selectable account card (used by steps 1 & 2)
// ============================================================================

function SelectableAccountCard({
  account,
  selected,
  onSelect,
  role,
}: {
  account: BrokerAccount;
  selected: boolean;
  onSelect: () => void;
  role: "source" | "destination";
}) {
  const info = brokerDisplay(account.brokerCode);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-md p-4 transition-all border ${
        selected
          ? "border-primary/40 bg-primary/10 shadow-[0_0_0_1px_rgba(255,184,0,0.2)]"
          : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/60 border border-white/10 text-primary font-mono uppercase text-xs font-semibold">
            {info.code[0]}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {account.accountLabel}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {info.label}
            </div>
          </div>
        </div>
        <div
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-white/20 text-transparent"
          }`}
        >
          <Check className="h-3 w-3" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="rm-label">Balance</div>
          <div className="text-sm font-mono tnum">
            {formatCurrency(account.balance, account.currency ?? "USD")}
          </div>
        </div>
        <div>
          <div className="rm-label">Equity</div>
          <div className="text-sm font-mono tnum">
            {formatCurrency(account.equity, account.currency ?? "USD")}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {account.isDemo ? (
          <Badge
            variant="outline"
            className="text-[9px] font-mono uppercase tracking-wider bg-warning/10 text-warning border-warning/30"
          >
            Practice
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[9px] font-mono uppercase tracking-wider bg-profit/10 text-profit border-profit/30"
          >
            Live
          </Badge>
        )}
        {account.isLiveAuthorized ? (
          <Badge
            variant="outline"
            className="text-[9px] font-mono uppercase tracking-wider bg-profit/10 text-profit border-profit/30"
          >
            <ShieldCheck className="h-2.5 w-2.5 mr-1" /> Authorized
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[9px] font-mono uppercase tracking-wider bg-muted text-muted-foreground border-border"
          >
            <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Not authorized
          </Badge>
        )}
        {role === "destination" && !account.isLiveAuthorized && (
          <span className="text-[10px] text-warning font-mono ml-auto">
            Live trading needed
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Step 3: Position sizing
// ============================================================================

interface SizingOption {
  mode: SizingMode;
  title: string;
  description: string;
  icon: typeof Radio;
}

const SIZING_OPTIONS: SizingOption[] = [
  {
    mode: "equity_ratio",
    title: "Mirror ratio",
    description:
      "Copy trades proportionally to your account size. If you have $1,000 and the source has $10,000, trades will be 1/10th the size.",
    icon: Scale,
  },
  {
    mode: "fixed_multiplier",
    title: "Fixed multiplier",
    description:
      "Copy trades at a fixed ratio. 2× means double the source volume.",
    icon: Radio,
  },
  {
    mode: "fixed_lot",
    title: "Fixed lot",
    description: "Always use the same lot size regardless of source.",
    icon: Coins,
  },
  {
    mode: "risk_based",
    title: "Risk-based",
    description:
      "Size trades based on how much you're willing to risk per trade.",
    icon: Target,
  },
];

function StepSizing({
  mode,
  equityMultiplier,
  fixedLotSize,
  riskPerTradePct,
  onChange,
}: {
  mode: SizingMode;
  equityMultiplier: number;
  fixedLotSize: number;
  riskPerTradePct: number;
  onChange: (
    patch: Partial<Pick<WizardState, "sizingMode" | "equityMultiplier" | "fixedLotSize" | "riskPerTradePct">>,
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">How should trades be sized?</h2>
        <p className="text-sm text-muted-foreground">
          How much volume should each copied trade have?
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SIZING_OPTIONS.map((opt) => {
          const selected = mode === opt.mode;
          const Icon = opt.icon;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => onChange({ sizingMode: opt.mode })}
              className={`text-left rounded-md p-4 transition-all border ${
                selected
                  ? "border-primary/40 bg-primary/10 shadow-[0_0_0_1px_rgba(255,184,0,0.2)]"
                  : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{opt.title}</span>
                </div>
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    selected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-white/20 text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Selected mode input */}
      <div className="rounded-md border border-white/10 bg-black/40 p-4 space-y-3">
        {mode === "equity_ratio" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="rm-label">Multiplier</label>
              <span className="text-sm font-mono tnum text-primary">
                {equityMultiplier.toFixed(1)}×
              </span>
            </div>
            <Slider
              min={0.1}
              max={10}
              step={0.1}
              value={[equityMultiplier]}
              onValueChange={([v]) => onChange({ equityMultiplier: v })}
            />
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>0.1×</span>
              <span>10×</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Destination volume = source volume × (dest equity / source equity) × multiplier.
            </p>
          </div>
        )}

        {mode === "fixed_multiplier" && (
          <div className="space-y-2">
            <label className="rm-label">Multiplier</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min={0.1}
                max={10}
                value={equityMultiplier}
                onChange={(e) =>
                  onChange({ equityMultiplier: parseFloat(e.target.value) || 0 })
                }
                className="font-mono tnum"
              />
              <span className="text-sm font-mono text-muted-foreground">×</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Destination volume = source volume × multiplier.
            </p>
          </div>
        )}

        {mode === "fixed_lot" && (
          <div className="space-y-2">
            <label className="rm-label">Lot size</label>
            <Input
              type="number"
              step="0.01"
              min={0.01}
              value={fixedLotSize}
              onChange={(e) =>
                onChange({ fixedLotSize: parseFloat(e.target.value) || 0 })
              }
              className="font-mono tnum"
            />
            <p className="text-[11px] text-muted-foreground">
              Every copied trade will use this lot size, regardless of source volume.
            </p>
          </div>
        )}

        {mode === "risk_based" && (
          <div className="space-y-2">
            <label className="rm-label">Risk per trade (%)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min={0.1}
                max={10}
                value={riskPerTradePct}
                onChange={(e) =>
                  onChange({ riskPerTradePct: parseFloat(e.target.value) || 0 })
                }
                className="font-mono tnum"
              />
              <span className="text-sm font-mono text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-warning flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Requires stop-loss on source trades.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step 4: Execution mode + toggles
// ============================================================================

interface ExecutionOption {
  mode: ExecutionMode;
  title: string;
  description: string;
  icon: typeof Bot;
  tag?: string;
  tagTone?: "info" | "warning" | "profit";
}

const EXECUTION_OPTIONS: ExecutionOption[] = [
  {
    mode: "approval",
    title: "Notify me",
    description:
      "Approval and rejection workflow is not implemented in this prototype.",
    icon: Bell,
    tag: "Unavailable",
    tagTone: "info",
  },
  {
    mode: "auto",
    title: "Auto-approve",
    description:
      "Runs simulated trades on practice accounts. Live broker execution is not available yet.",
    icon: Zap,
    tag: "Recommended",
    tagTone: "profit",
  },
  {
    mode: "notify_only",
    title: "Monitor only",
    description: "Shows monitor events without placing orders; provider trade history is not imported by this mode.",
    icon: Eye,
    tag: "For analysis",
    tagTone: "warning",
  },
];

function StepExecution({
  executionMode,
  replicateStopLoss,
  replicateTakeProfit,
  replicatePartialClosures,
  destination,
  onChange,
}: {
  executionMode: ExecutionMode;
  replicateStopLoss: boolean;
  replicateTakeProfit: boolean;
  replicatePartialClosures: boolean;
  destination?: BrokerAccount;
  onChange: (
    patch: Partial<Pick<WizardState, "executionMode" | "replicateStopLoss" | "replicateTakeProfit" | "replicatePartialClosures">>,
  ) => void;
}) {
  const destNeedsAuth = destination && !destination.isDemo;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">When should trades execute?</h2>
        <p className="text-sm text-muted-foreground">
          How do you want trades to be handled?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {EXECUTION_OPTIONS.map((opt) => {
          const selected = executionMode === opt.mode;
          const Icon = opt.icon;
          const isBlocked = opt.mode === "approval" || (opt.mode === "auto" && destNeedsAuth);
          return (
            <button
              key={opt.mode}
              type="button"
              disabled={isBlocked}
              onClick={() => onChange({ executionMode: opt.mode })}
              className={`text-left rounded-md p-4 transition-all border ${
                selected
                  ? "border-primary/40 bg-primary/10 shadow-[0_0_0_1px_rgba(255,184,0,0.2)]"
                  : isBlocked
                    ? "border-white/5 bg-black/20 opacity-50 cursor-not-allowed"
                    : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Icon
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      selected ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{opt.title}</span>
                      {opt.tag && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono uppercase tracking-wider ${
                            opt.tagTone === "profit"
                              ? "bg-profit/10 text-profit border-profit/30"
                              : opt.tagTone === "warning"
                                ? "bg-warning/10 text-warning border-warning/30"
                                : "bg-info/10 text-info border-info/30"
                          }`}
                        >
                          {opt.tag}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      {opt.description}
                    </p>
                    {isBlocked && (
                      <p className="text-[11px] text-warning mt-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Destination account needs live trading authorization first.
                      </p>
                    )}
                  </div>
                </div>
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    selected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-white/20 text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Separator className="bg-white/5" />

      {/* Toggles */}
      <div className="space-y-3">
        <div className="rm-label">Trade event replication</div>
        <div className="space-y-1 rounded-md border border-white/10 bg-black/40 divide-y divide-white/5">
          <ToggleRow
            label="Copy stop-loss"
            description="Mirror stop-loss modifications from the source."
            checked={replicateStopLoss}
            onCheckedChange={(v) => onChange({ replicateStopLoss: v })}
          />
          <ToggleRow
            label="Copy take-profit"
            description="Mirror take-profit modifications from the source."
            checked={replicateTakeProfit}
            onCheckedChange={(v) => onChange({ replicateTakeProfit: v })}
          />
          <ToggleRow
            label="Copy partial closes"
            description="When the source partially closes, mirror the same ratio."
            checked={replicatePartialClosures}
            onCheckedChange={(v) => onChange({ replicatePartialClosures: v })}
          />
        </div>
      </div>

      <div className="p-2.5 rounded-md bg-warning/10 border border-warning/30 text-[11px] text-warning flex items-start gap-2">
        <Wallet className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          New replications start <span className="font-mono">paused</span>.
          Resume from the card once you&apos;re ready to go live.
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Toggle row helper (step 4)
// ============================================================================

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          {description}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
