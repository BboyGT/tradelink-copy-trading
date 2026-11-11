"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { BackTo } from "@/components/back-to";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { DemoBadge } from "@/components/badges";
import {
  PROP_FIRM_PRESETS,
  PROP_FIRM_LIST,
  type PropFirmRules,
} from "@/lib/types";
import {
  Link2,
  RefreshCw,
  Trash2,
  ChevronDown,
  Eye,
  EyeOff,
  Power,
  Lock,
  AlertTriangle,
  Server,
  Activity,
  Wallet,
  Loader2,
  ShieldCheck,
  Info,
  ExternalLink,
  Award,
  Rocket,
  TrendingUp,
  Shield,
  Building2,
  CandlestickChart,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface BrokerConnectionsViewProps {
  user: any;
  onConnected: () => void;
}

type RetailBrokerCode = "deriv" | "ctrader" | "mt4" | "mt5" | "fxcm";
type PropFirmCode = "ftmo" | "fundednext" | "myfundedfx" | "the5ers" | "propfirm";
type PropFirmPhase = "challenge" | "verification" | "funded";

interface RetailBroker {
  code: RetailBrokerCode;
  name: string;
  color: string;
  blurb: string;
}

interface BrokerAccount {
  id: string;
  brokerCode: string;
  accountLabel: string;
  externalAccountId?: string | null;
  currency: string;
  leverage?: number | null;
  accountType?: string | null;
  isDemo: boolean;
  isLiveAuthorized: boolean;
  status: string;
  authMethod?: string | null;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  propFirmType?: string | null;
  propFirmPhase?: string | null;
  startingBalance?: number | null;
  challengeStartedAt?: string | null;
  lastSyncedAt?: string | null;
  destinationPositions?: Array<{ id: string }>;
}

// ============================================================================
// Static catalogs
// ============================================================================

const RETAIL_BROKERS: RetailBroker[] = [
  {
    code: "deriv",
    name: "Deriv",
    color: "#1e88e5",
    blurb: "Official OAuth account linking. Trade monitoring and copying are not yet available for Deriv contracts.",
  },
  {
    code: "ctrader",
    name: "cTrader",
    color: "#00897b",
    blurb: "Spotware OAuth and Open API account linking. cTrader trades can be copied to MT4/MT5; cTrader is not yet a destination.",
  },
  {
    code: "mt4",
    name: "MT4",
    color: "#43a047",
    blurb: "Pair an MT4 terminal with the TradeLink Expert Advisor bridge to monitor and execute copied trades.",
  },
  {
    code: "mt5",
    name: "MT5",
    color: "#8e24aa",
    blurb: "Pair an MT5 terminal with the TradeLink Expert Advisor bridge to monitor and execute copied trades.",
  },
  {
    code: "fxcm",
    name: "FXCM",
    color: "#d32f2f",
    blurb: "Requires an FXCM-approved FCLite integration. Account linking and trade copying are not yet available.",
  },
];

const PROP_FIRM_ICON_MAP: Record<string, typeof Award> = {
  Award,
  Rocket,
  TrendingUp,
  Shield,
  Building2,
};

const STARTING_BALANCE_PRESETS = [10000, 25000, 50000, 100000, 200000];

const PROP_FIRM_PHASES: { value: PropFirmPhase; label: string; description: string }[] = [
  {
    value: "challenge",
    label: "Challenge",
    description: "Initial evaluation phase — hit the profit target without breaching loss limits.",
  },
  {
    value: "verification",
    label: "Verification",
    description: "Second phase — confirm consistency on a smaller target.",
  },
  {
    value: "funded",
    label: "Funded",
    description: "Live funded account — just don't breach the loss limits.",
  },
];

const RETAIL_AUTH_BLURB =
  "Only an approved provider authorization or a verified terminal bridge can link a real account. TRADE LINK never accepts broker passwords here.";

// ============================================================================
// API helpers
// ============================================================================

async function fetchAccounts() {
  const res = await fetch("/api/brokers");
  if (!res.ok) throw new Error("Failed to load broker accounts");
  return res.json() as Promise<{ accounts: BrokerAccount[] }>;
}

interface ConnectPayload {
  brokerCode: string;
  accountLabel: string;
  credentials: Record<string, unknown>;
  isDemo: boolean;
  accountType?: "hedging" | "netting";
  propFirmType?: string;
  propFirmPhase?: PropFirmPhase;
  startingBalance?: number;
}

async function postConnect(payload: ConnectPayload) {
  const res = await fetch("/api/brokers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Connection failed");
  return data;
}

// ============================================================================
// Main view
// ============================================================================

export function BrokerConnectionsView({ user, onConnected }: BrokerConnectionsViewProps) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["broker-accounts"],
    queryFn: fetchAccounts,
    enabled: !!user,
    refetchInterval: 60000,
  });

  const accounts = accountsData?.accounts ?? [];

  // Dialog state
  const [retailDialogBroker, setRetailDialogBroker] = useState<RetailBroker | null>(null);
  const [propFirmDialogCode, setPropFirmDialogCode] = useState<PropFirmCode | null>(null);

  // Destructive dialog state
  const [disconnectAccount, setDisconnectAccount] = useState<BrokerAccount | null>(null);
  const [liveAuthAccount, setLiveAuthAccount] = useState<BrokerAccount | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const connectMutation = useMutation({
    mutationFn: postConnect,
    onSuccess: (_data, variables) => {
      toast({
        title: "Account connected",
        description: `${variables.accountLabel} is now linked to TRADE LINK.`,
      });
      setRetailDialogBroker(null);
      setPropFirmDialogCode(null);
      qc.invalidateQueries({ queryKey: ["broker-accounts"] });
      onConnected();
    },
    onError: (e: Error) => {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="space-y-4">
        <ViewHeader connectedCount={0} />
        <Card>
          <CardContent className="p-6 text-center">
            <Lock className="h-6 w-6 mx-auto mb-3 text-warning" />
            <h2 className="text-lg font-semibold">Sign in required</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Connect and manage your destination broker accounts by signing in.
            </p>
            <Button onClick={() => setAuthOpen(true)}>Sign in to continue</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ViewHeader connectedCount={accounts.length} />

      {/* ============ Section 1: Connect a broker ============ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">Connect a broker</h2>
        </div>

        {/* 1a. Retail brokers */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider font-mono">
              Retail Brokers
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Provider linking becomes available after its official authorization or terminal bridge is configured.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {RETAIL_BROKERS.map((b) => (
              <RetailBrokerCard
                key={b.code}
                broker={b}
                onConnect={() => setRetailDialogBroker(b)}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* 1b. Prop firm accounts */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider font-mono">
              Prop Firm Accounts
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Track your funded challenge — balance, phase, and rule compliance.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROP_FIRM_LIST.map((pf) => (
              <PropFirmBrokerCard
                key={pf.code}
                code={pf.code as PropFirmCode}
                name={pf.name}
                color={pf.color}
                iconName={pf.icon}
                onConnect={() => setPropFirmDialogCode(pf.code as PropFirmCode)}
              />
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* ============ Section 2: Connected accounts ============ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold tracking-tight">Your connected accounts</h2>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {accounts.length} connected
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Server className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No broker accounts connected yet. Pick a broker above to get started.
              </p>
              <Button
                variant="link"
                className="mt-2 text-primary"
                onClick={() => setView("discover")}
              >
                Or browse signal providers first
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onDisconnect={(a) => {
                  setDisconnectAccount(a);
                  setConfirmText("");
                }}
                onAuthorizeLive={(a) => {
                  setLiveAuthAccount(a);
                  setConfirmText("");
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ============ Dialogs ============ */}

      {/* Retail broker — OAuth-style connect */}
      <ConnectRetailDialog
        broker={retailDialogBroker}
        pending={connectMutation.isPending}
        onClose={() => setRetailDialogBroker(null)}
        onConnect={(payload) => connectMutation.mutate(payload)}
        onBridgeEnrolled={() => { qc.invalidateQueries({ queryKey: ["broker-accounts"] }); onConnected(); }}
      />

      {/* Prop firm — challenge connect */}
      <ConnectPropFirmDialog
        code={propFirmDialogCode}
        pending={connectMutation.isPending}
        onClose={() => setPropFirmDialogCode(null)}
        onConnect={(payload) => connectMutation.mutate(payload)}
      />

      {/* Disconnect confirmation */}
      <AlertDialog open={!!disconnectAccount} onOpenChange={(o) => !o && setDisconnectAccount(null)}>
        <AlertDialogContent className="rm-glass border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect broker account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect{" "}
              <span className="font-medium text-foreground">
                {disconnectAccount?.accountLabel}
              </span>{" "}
              ({disconnectAccount?.brokerCode?.toUpperCase()}). Any active replication configs that depend on this account will be paused. Open positions at the broker are <strong>not</strong> automatically closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DisconnectWarning />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!disconnectAccount) return;
                try {
                  const res = await fetch(`/api/brokers/${disconnectAccount.id}`, { method: "DELETE" });
                  if (!res.ok) {
                    const d = await res.json();
                    throw new Error(d.error ?? "Disconnect failed");
                  }
                  toast({ title: "Account disconnected", description: `${disconnectAccount.accountLabel} is now offline.` });
                  qc.invalidateQueries({ queryKey: ["broker-accounts"] });
                  onConnected();
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  toast({ title: "Failed to disconnect", description: msg, variant: "destructive" });
                } finally {
                  setDisconnectAccount(null);
                }
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enable live trading authorization */}
      <AlertDialog open={!!liveAuthAccount} onOpenChange={(o) => !o && setLiveAuthAccount(null)}>
        <AlertDialogContent className="rm-glass border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-warning" />
              Authorize live trading
            </AlertDialogTitle>
            <AlertDialogDescription>
              Authorizing live trading on{" "}
              <span className="font-medium text-foreground">
                {liveAuthAccount?.accountLabel}
              </span>{" "}
              will allow TRADE LINK to open, modify and close positions on this account. This is required before any replication can execute against it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <LiveWarning />
          <div className="space-y-2">
            <Label htmlFor="confirmText" className="text-xs">
              Type <span className="font-mono text-warning">I AUTHORIZE LIVE TRADING</span> to continue
            </Label>
            <Input
              id="confirmText"
              placeholder="I AUTHORIZE LIVE TRADING"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "I AUTHORIZE LIVE TRADING"}
              onClick={async () => {
                if (!liveAuthAccount) return;
                try {
                  const res = await fetch(`/api/brokers/${liveAuthAccount.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "enable_live", confirm: "I AUTHORIZE LIVE TRADING" }),
                  });
                  if (!res.ok) {
                    const d = await res.json();
                    throw new Error(d.error ?? "Authorization failed");
                  }
                  toast({
                    title: "Live trading authorized",
                    description: `${liveAuthAccount.accountLabel} can now execute trades.`,
                  });
                  qc.invalidateQueries({ queryKey: ["broker-accounts"] });
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  toast({ title: "Authorization failed", description: msg, variant: "destructive" });
                } finally {
                  setLiveAuthAccount(null);
                  setConfirmText("");
                }
              }}
            >
              Authorize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// View header
// ============================================================================

function ViewHeader({ connectedCount }: { connectedCount: number }) {
  return (
    <div className="space-y-2">
      <BackTo view="dashboard" label="Dashboard" />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Broker Connections <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your destination accounts in one click. We never ask for passwords in the main flow — just sign in at your broker.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
          <Server className="h-3.5 w-3.5" />
          <span>{connectedCount} connected account{connectedCount === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Retail broker card
// ============================================================================

function RetailBrokerCard({
  broker,
  onConnect,
}: {
  broker: RetailBroker;
  onConnect: () => void;
}) {
  return (
    <div
      className="rm-glass rounded-lg p-4 flex flex-col gap-3 transition-all hover:translate-y-[-1px] hover:shadow-lg"
      style={{
        borderTop: `2px solid ${broker.color}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md font-mono text-sm font-bold shrink-0"
          style={{
            background: `${broker.color}22`,
            color: broker.color,
            border: `1px solid ${broker.color}55`,
          }}
        >
          {broker.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{broker.name}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">
            {broker.code}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">
        {broker.blurb}
      </p>
      <Button
        size="sm"
        className="w-full"
        style={{
          background: `${broker.color}22`,
          color: broker.color,
          border: `1px solid ${broker.color}55`,
        }}
        onClick={onConnect}
      >
        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
        Connect
      </Button>
    </div>
  );
}

// ============================================================================
// Prop firm broker card
// ============================================================================

function PropFirmBrokerCard({
  code,
  name,
  color,
  iconName,
  onConnect,
}: {
  code: PropFirmCode;
  name: string;
  color: string;
  iconName: string;
  onConnect: () => void;
}) {
  const rules = PROP_FIRM_PRESETS[code];
  const Icon = PROP_FIRM_ICON_MAP[iconName] ?? Award;

  return (
    <div
      className="rm-glass rounded-lg p-4 flex flex-col gap-3 transition-all hover:translate-y-[-1px] hover:shadow-lg"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md shrink-0"
          style={{
            background: `${color}22`,
            color: color,
            border: `1px solid ${color}55`,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{name}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">
            Prop Firm
          </div>
        </div>
      </div>
      {rules && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <RuleStat label="Target" value={`${rules.profitTargetPct}%`} accent={color} />
          <RuleStat label="Daily loss" value={`${rules.maxDailyLossPct}%`} accent={color} />
          <RuleStat label="Max DD" value={`${rules.maxOverallLossPct}%`} accent={color} />
        </div>
      )}
      <Button
        size="sm"
        className="w-full"
        style={{
          background: `${color}22`,
          color: color,
          border: `1px solid ${color}55`,
        }}
        onClick={onConnect}
      >
        <CandlestickChart className="h-3.5 w-3.5 mr-1.5" />
        Connect Challenge
      </Button>
    </div>
  );
}

function RuleStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-md bg-black/40 border border-white/5 px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-mono mb-0.5">
        {label}
      </div>
      <div className="text-xs font-semibold font-mono" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

// ============================================================================
// Connect Retail Dialog (OAuth-style)
// ============================================================================

function ConnectRetailDialog({
  broker,
  pending,
  onClose,
  onConnect,
  onBridgeEnrolled,
}: {
  broker: RetailBroker | null;
  pending: boolean;
  onClose: () => void;
  onConnect: (payload: ConnectPayload) => void;
  onBridgeEnrolled: () => void;
}) {
  const [accountLabel, setAccountLabel] = useState("");
  const [isDemo, setIsDemo] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [accountType, setAccountType] = useState<"hedging" | "netting">("hedging");
  // Manual credentials (advanced)
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  // True while we are talking to /api/brokers/deriv/oauth-url before deciding
  // whether to redirect to Deriv's real OAuth page or fall back to mock.
  const [oauthChecking, setOauthChecking] = useState(false);
  const [bridgeEnrollment, setBridgeEnrollment] = useState<{ accountId: string; secret: string; brokerCode: "mt4" | "mt5" } | null>(null);
  const { toast } = useToast();

  // Reset state when broker changes
  const brokerCode = broker?.code;
  const brokerName = broker?.name ?? "";

  // Default label derived from broker
  const effectiveLabel = accountLabel || (brokerCode ? `My ${brokerName} Account` : "");

  function handleClose() {
    if (pending || oauthChecking) return;
    if (bridgeEnrollment) {
      void fetch(`/api/brokers/${bridgeEnrollment.accountId}`)
        .then((response) => response.json())
        .then((data) => data.account?.status === "pending"
          ? fetch(`/api/brokers/${bridgeEnrollment.accountId}`, { method: "DELETE" })
          : undefined)
        .catch(() => undefined);
    }
    onClose();
    // reset after close animation
    setTimeout(() => {
      setAccountLabel("");
      setToken("");
      setApiKey("");
      setClientId("");
      setLogin("");
      setPassword("");
      setServer("");
      setAdvancedOpen(false);
      setIsDemo(true);
      setAccountType("hedging");
      setOauthChecking(false);
      setBridgeEnrollment(null);
    }, 200);
  }

  async function handleContinue() {
    if (!broker) return;
    setOauthChecking(true);
    try {
      if (broker.code === "mt4" || broker.code === "mt5") {
        const res = await fetch("/api/brokers/bridge/enroll", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brokerCode: broker.code, accountLabel: effectiveLabel }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.bridgeSecret) throw new Error(data.error ?? "Terminal pairing could not start.");
        setBridgeEnrollment({ accountId: data.account.id, secret: data.bridgeSecret, brokerCode: broker.code });
        onBridgeEnrolled();
        toast({ title: "Terminal pairing ready", description: "Install the Expert Advisor, enter this one-time secret, then allow the terminal to connect." });
        setOauthChecking(false);
        return;
      }
      const res = await fetch(`/api/brokers/${broker.code}/oauth-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? `${broker.name} connection is not configured on this server.`);
      window.location.assign(data.url as string);
    } catch (error) {
      toast({ title: "Connection unavailable", description: error instanceof Error ? error.message : "Provider connection could not start.", variant: "destructive" });
      setOauthChecking(false);
    }
  }

  const useManual = advancedOpen && (
    false
  );

  return (
    <Dialog open={!!broker} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="rm-glass border-white/10 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {broker && (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-bold"
                style={{
                  background: `${broker.color}22`,
                  color: broker.color,
                  border: `1px solid ${broker.color}55`,
                }}
              >
                {broker.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            Connect to {brokerName}
          </DialogTitle>
          <DialogDescription>
            {RETAIL_AUTH_BLURB}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Account label */}
          <div className="space-y-1.5">
            <Label htmlFor="retail-label">Account label</Label>
            <Input
              id="retail-label"
              placeholder={`My ${brokerName} Account`}
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              A friendly name so you can tell this account apart from others.
            </p>
          </div>

          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            {brokerCode === "mt4" || brokerCode === "mt5"
              ? "MetaTrader accounts must pair through the terminal bridge. Do not enter your trading password in this website."
              : brokerCode === "fxcm"
                ? "FXCM linking requires the official OAuth application credentials and token refresh service to be configured by the deployment."
                : "This provider requires its official OAuth application and a completed account callback before an account can be linked."}
          </div>

          {bridgeEnrollment && (
            <div className="space-y-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs font-medium text-foreground">Finish pairing in your MetaTrader terminal</p>
              <ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
                <li>Download and compile the <a className="underline" href={`/api/brokers/bridge/download?platform=${bridgeEnrollment.brokerCode}`}>TRADE LINK {bridgeEnrollment.brokerCode.toUpperCase()} Expert Advisor</a>.</li>
                <li>Add <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : "your site host"}</span> to MetaTrader's WebRequest allowlist.</li>
                <li>Attach it to a chart and enter account ID <span className="font-mono">{bridgeEnrollment.accountId}</span>, this secret, and the site URL.</li>
              </ol>
              <div className="flex gap-2">
                <Input readOnly value={bridgeEnrollment.secret} type="password" autoComplete="off" aria-label="One-time terminal bridge secret" />
                <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(bridgeEnrollment.secret); toast({ title: "Bridge secret copied" }); }}>Copy secret</Button>
              </div>
              <p className="text-[10px] text-muted-foreground">This secret is shown once. Store it in the terminal EA inputs and keep it private. Account status changes to connected after its first valid heartbeat.</p>
            </div>
          )}

          {/* Credentials are deliberately not collected in the browser. */}
          {false && <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <div className="rounded-md border border-white/5 bg-black/20">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-white/5"
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {advancedOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    Advanced settings
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-3 border-t border-white/5">
                  <p className="text-[10px] text-muted-foreground pt-2">
                    For power users who already have API credentials. If left blank, we'll use the broker's secure login flow.
                  </p>

                  {/* Account type */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="retail-accountType" className="text-xs">Account type</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Hedging allows holding both buy and sell positions on the same instrument. Netting combines them. Most traders use hedging.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select value={accountType} onValueChange={(v) => setAccountType(v as "hedging" | "netting")}>
                      <SelectTrigger id="retail-accountType" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hedging">Hedging (default)</SelectItem>
                        <SelectItem value="netting">Netting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Credentials — varies by broker */}
                  {brokerCode === "deriv" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="retail-token" className="text-xs">API token (optional)</Label>
                      <Input
                        id="retail-token"
                        type="password"
                        placeholder="Deriv API token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  )}
                  {brokerCode === "ctrader" && (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="retail-apiKey" className="text-xs">API key (optional)</Label>
                        <Input
                          id="retail-apiKey"
                          type="password"
                          placeholder="cTrader API key"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="retail-clientId" className="text-xs">Client ID (optional)</Label>
                        <Input
                          id="retail-clientId"
                          placeholder="cTrader client ID"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}
                  {(brokerCode === "mt4" || brokerCode === "mt5") && (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="retail-login" className="text-xs">Login (optional)</Label>
                        <Input
                          id="retail-login"
                          placeholder="MT login"
                          value={login}
                          onChange={(e) => setLogin(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="retail-password" className="text-xs">Password (optional)</Label>
                        <Input
                          id="retail-password"
                          type="password"
                          placeholder="MT password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="retail-server" className="text-xs">Server (optional)</Label>
                        <Input
                          id="retail-server"
                          placeholder="e.g. My Deriv Account"
                          value={server}
                          onChange={(e) => setServer(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={pending || oauthChecking}>
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={pending || oauthChecking || !!bridgeEnrollment}
            style={broker ? { background: broker.color, color: "#fff" } : undefined}
          >
            {pending || oauthChecking ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            {bridgeEnrollment ? "Bridge setup created" : `Continue to ${brokerName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Connect Prop Firm Dialog
// ============================================================================

function ConnectPropFirmDialog({
  code,
  pending,
  onClose,
  onConnect,
}: {
  code: PropFirmCode | null;
  pending: boolean;
  onClose: () => void;
  onConnect: (payload: ConnectPayload) => void;
}) {
  const [phase, setPhase] = useState<PropFirmPhase>("challenge");
  const [startingBalance, setStartingBalance] = useState<number>(100000);
  const [customBalance, setCustomBalance] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);

  const rules: PropFirmRules | undefined = code ? PROP_FIRM_PRESETS[code] : undefined;
  const firm = PROP_FIRM_LIST.find((p) => p.code === code);

  function handleClose() {
    if (pending) return;
    onClose();
    setTimeout(() => {
      setPhase("challenge");
      setStartingBalance(100000);
      setCustomBalance("");
      setUseCustom(false);
    }, 200);
  }

  function handleConnect() {
    if (!code || !firm || !rules) return;
    const balance = useCustom && customBalance ? parseFloat(customBalance) : startingBalance;
    const label = `${firm.name} ${phase === "funded" ? "Funded" : phase === "verification" ? "Verification" : "Challenge"} $${formatBalanceShort(balance)}`;
    onConnect({
      brokerCode: code,
      accountLabel: label,
      credentials: { token: "demo-prop-bridge" },
      isDemo: true,
      accountType: "hedging",
      propFirmType: code,
      propFirmPhase: phase,
      startingBalance: balance,
    });
  }

  if (!code || !firm || !rules) return null;

  return (
    <Dialog open={!!code} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="rm-glass border-white/10 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{
                background: `${firm.color}22`,
                color: firm.color,
                border: `1px solid ${firm.color}55`,
              }}
            >
              {(() => {
                const Icon = PROP_FIRM_ICON_MAP[firm.icon] ?? Award;
                return <Icon className="h-4 w-4" />;
              })()}
            </span>
            Connect {firm.name} account
          </DialogTitle>
          <DialogDescription>
            Track your prop firm challenge inside TRADE LINK. We'll monitor your balance, equity, and rule compliance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Starting balance */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground font-mono">
              Starting balance
            </Label>
            <ToggleGroup
              type="single"
              value={useCustom ? "custom" : String(startingBalance)}
              onValueChange={(v) => {
                if (v === "custom") {
                  setUseCustom(true);
                } else if (v) {
                  setUseCustom(false);
                  setStartingBalance(Number(v));
                }
              }}
              className="flex w-full flex-wrap gap-1"
            >
              {STARTING_BALANCE_PRESETS.map((amt) => (
                <ToggleGroupItem
                  key={amt}
                  value={String(amt)}
                  variant="outline"
                  className="flex-1 min-w-[80px] font-mono text-xs"
                >
                  ${formatBalanceShort(amt)}
                </ToggleGroupItem>
              ))}
              <ToggleGroupItem
                value="custom"
                variant="outline"
                className="flex-1 min-w-[80px] font-mono text-xs"
              >
                Custom
              </ToggleGroupItem>
            </ToggleGroup>
            {useCustom && (
              <Input
                type="number"
                placeholder="Enter amount in USD"
                value={customBalance}
                onChange={(e) => setCustomBalance(e.target.value)}
                className="font-mono"
              />
            )}
          </div>

          {/* Phase selector */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground font-mono">
              Challenge phase
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PROP_FIRM_PHASES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPhase(p.value)}
                  className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors text-left ${
                    phase === p.value
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-white/5 bg-black/30 text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">
                    {p.description.split("—")[0].trim()}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {PROP_FIRM_PHASES.find((p) => p.value === phase)?.description}
            </p>
          </div>

          {/* Rules summary */}
          <div className="rounded-md border border-white/5 bg-black/30 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Shield className="h-3.5 w-3.5" style={{ color: firm.color }} />
              {firm.name} rules
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <RuleRow label="Profit target" value={`${rules.profitTargetPct}% of balance`} />
              <RuleRow label="Max daily loss" value={`${rules.maxDailyLossPct}% of balance`} />
              <RuleRow label="Max overall loss" value={`${rules.maxOverallLossPct}% ${rules.trailingDrawdown ? "(trailing)" : "(static)"}`} />
              <RuleRow label="Min trading days" value={rules.minTradingDays ? `${rules.minTradingDays} day${rules.minTradingDays === 1 ? "" : "s"}` : "None"} />
              <RuleRow label="Max trading days" value={rules.maxTradingDays ? `${rules.maxTradingDays} days` : "Unlimited"} />
              <RuleRow label="Consistency rule" value={rules.consistencyRulePct ? `${rules.consistencyRulePct}% max per day` : "None"} />
              <RuleRow label="News trading" value={rules.newsTradingAllowed ? "Allowed" : "Not allowed"} />
              <RuleRow label="Weekend holding" value={rules.weekendHoldingAllowed ? "Allowed" : "Not allowed"} />
              <RuleRow label="EA / bots" value={rules.eaAllowed ? "Allowed" : "Not allowed"} />
            </div>
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-white/5">
              {rules.description}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={pending || (useCustom && !customBalance)}
            style={{ background: firm.color, color: "#fff" }}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            Connect Prop Firm Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-mono">
        {label}
      </span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function formatBalanceShort(amt: number): string {
  if (amt >= 1000) return `${amt / 1000}k`;
  return String(amt);
}

// ============================================================================
// Account card
// ============================================================================

function AccountCard({
  account,
  onDisconnect,
  onAuthorizeLive,
}: {
  account: BrokerAccount;
  onDisconnect: (a: BrokerAccount) => void;
  onAuthorizeLive: (a: BrokerAccount) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [positions, setPositions] = useState<any[] | null>(null);
  const [livePositions, setLivePositions] = useState<any[] | null>(null);
  const [loadingPositions, setLoadingPositions] = useState(false);

  const isPropFirm = ["ftmo", "fundednext", "myfundedfx", "the5ers", "propfirm"].includes(account.brokerCode) || !!account.propFirmType;
  const rules: PropFirmRules | undefined = isPropFirm && account.propFirmType
    ? PROP_FIRM_PRESETS[account.propFirmType]
    : undefined;
  const firmMeta = PROP_FIRM_LIST.find((p) => p.code === account.propFirmType);
  const accentColor = isPropFirm
    ? firmMeta?.color ?? "#607d8b"
    : RETAIL_BROKERS.find((b) => b.code === account.brokerCode)?.color ?? "#1e88e5";

  // Prop firm rule compliance (computed from balance / equity)
  const compliance = useMemo(() => {
    if (!rules || !account.startingBalance) return null;
    const starting = account.startingBalance;
    const equity = account.equity;
    const balance = account.balance;
    // Profit progress: how close equity is to (starting * (1 + target/100))
    const targetEquity = starting * (1 + rules.profitTargetPct / 100);
    const profitProgress = Math.max(0, Math.min(100, ((equity - starting) / (targetEquity - starting)) * 100));
    // Overall loss used: how much of max overall loss is used
    const maxOverallLoss = starting * (rules.maxOverallLossPct / 100);
    const drawdown = Math.max(0, starting - equity);
    const lossUsedPct = Math.min(100, (drawdown / maxOverallLoss) * 100);
    const lossRemainingPct = Math.max(0, 100 - lossUsedPct);
    // Daily loss — we don't track daily P/L, so show as N/A unless we can compute it
    // For demo, assume the daily loss used is proportional to recent drawdown (best-effort)
    const maxDailyLoss = starting * (rules.maxDailyLossPct / 100);
    const dailyDrawdown = Math.max(0, Math.min(drawdown, maxDailyLoss));
    const dailyLossUsedPct = Math.min(100, (dailyDrawdown / maxDailyLoss) * 100);
    return {
      profitProgress,
      lossUsedPct,
      lossRemainingPct,
      dailyLossUsedPct,
      targetEquity,
      maxOverallLoss,
      maxDailyLoss,
    };
  }, [rules, account.startingBalance, account.equity, account.balance]);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/brokers/${account.id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Refresh failed");
      toast({ title: "Account synced", description: account.accountLabel });
      qc.invalidateQueries({ queryKey: ["broker-accounts"] });
      if (d.warning) toast({ title: "Sync warning", description: d.warning, variant: "default" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Refresh failed", description: msg, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  async function loadPositions() {
    setLoadingPositions(true);
    try {
      const res = await fetch(`/api/brokers/${account.id}/positions`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load positions");
      setPositions(d.positions ?? []);
      setLivePositions(d.livePositions ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Positions load failed", description: msg, variant: "destructive" });
      setPositions([]);
      setLivePositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }

  async function closePosition(positionId: string, volume?: number) {
    setClosingId(positionId);
    try {
      const res = await fetch(`/api/brokers/${account.id}/close-position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, volume }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Close failed");
      toast({
        title: "Position closed",
        description: `Realized P/L: ${formatCurrency(d.result?.realizedProfit ?? 0, account.currency)}`,
      });
      await loadPositions();
      qc.invalidateQueries({ queryKey: ["broker-accounts"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Close failed", description: msg, variant: "destructive" });
    } finally {
      setClosingId(null);
    }
  }

  const openPositionsCount = account.destinationPositions?.length ?? 0;
  const statusStyles: Record<string, string> = {
    connected: "bg-profit/15 text-profit border-profit/30",
    disconnected: "bg-black/40 text-muted-foreground border-white/5",
    expired: "bg-warning/15 text-warning border-warning/30",
    error: "bg-loss/15 text-loss border-loss/30",
  };
  const liveAuthorized = Boolean(account.isLiveAuthorized);

  // Display name (prop firm shows firm name, retail shows broker code)
  const displayName = isPropFirm
    ? firmMeta?.name ?? account.brokerCode.toUpperCase()
    : RETAIL_BROKERS.find((b) => b.code === account.brokerCode)?.name ?? account.brokerCode.toUpperCase();

  // Phase label for prop firm
  const phaseLabel = account.propFirmPhase
    ? PROP_FIRM_PHASES.find((p) => p.value === account.propFirmPhase)?.label ?? account.propFirmPhase
    : null;

  return (
    <div
      className="rm-glass rounded-md border border-white/5 hover:border-primary/30 transition-colors"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <BrokerLogo
              account={account}
              isPropFirm={isPropFirm}
              displayName={displayName}
              accentColor={accentColor}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{account.accountLabel}</span>
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-mono"
                  style={{
                    background: `${accentColor}22`,
                    color: accentColor,
                    borderColor: `${accentColor}55`,
                  }}
                >
                  {displayName}
                </Badge>
                {phaseLabel && (
                  <Badge variant="outline" className="text-[10px] uppercase font-mono" style={{
                    background: `${accentColor}15`,
                    color: accentColor,
                    borderColor: `${accentColor}40`,
                  }}>
                    {phaseLabel}
                  </Badge>
                )}
                {account.isDemo ? (
                  <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30">
                    Demo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-info/15 text-info border-info/30">
                    Real
                  </Badge>
                )}
                {account.authMethod === "oauth" && (
                  <Badge variant="outline" className="text-[10px] bg-profit/15 text-profit border-profit/30">
                    <ShieldCheck className="h-3 w-3 mr-1" /> Connected via OAuth
                  </Badge>
                )}
                {liveAuthorized ? (
                  <Badge variant="outline" className="text-[10px] bg-profit/15 text-profit border-profit/30">
                    <ShieldCheck className="h-3 w-3 mr-1" /> Live authorized
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                    <Lock className="h-3 w-3 mr-1" /> Live locked
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] ${statusStyles[account.status] ?? statusStyles.disconnected}`}
                >
                  {account.status}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                {account.externalAccountId ? `External: ${account.externalAccountId} • ` : ""}
                {account.currency}
                {account.leverage ? ` • 1:${account.leverage}` : ""}
                {account.authMethod ? ` • ${account.authMethod}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing} title="Sync from broker">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            {!liveAuthorized ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAuthorizeLive(account)}
                className="text-warning border-warning/30 hover:bg-warning/10"
              >
                <Power className="h-3.5 w-3.5 mr-1" /> Enable live
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDisconnect(account)}
              className="text-loss hover:bg-loss/10"
              title="Disconnect"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
          <Metric icon={Wallet} label="Balance" value={formatCurrency(account.balance, account.currency)} />
          <Metric
            icon={Activity}
            label="Equity"
            value={formatCurrency(account.equity, account.currency)}
            accent={account.equity >= account.balance ? "text-profit" : "text-loss"}
          />
          <Metric label="Margin" value={formatCurrency(account.margin, account.currency)} />
          <Metric label="Free margin" value={formatCurrency(account.freeMargin, account.currency)} />
          <Metric label="Open positions" value={String(openPositionsCount)} />
        </div>

        {/* Prop firm rule compliance */}
        {isPropFirm && compliance && rules && (
          <PropFirmCompliance
            rules={rules}
            compliance={compliance}
            currency={account.currency}
            accentColor={accentColor}
            lastSyncedAt={account.lastSyncedAt}
          />
        )}

        {/* Last synced */}
        {!isPropFirm && (
          <div className="text-[10px] text-muted-foreground font-mono">
            Last synced: {formatDateTime(account.lastSyncedAt)}
          </div>
        )}
      </div>

      <Separator />

      {/* Open positions collapsible */}
      <Collapsible
        open={positionsOpen}
        onOpenChange={(o) => {
          setPositionsOpen(o);
          if (o && positions === null) loadPositions();
        }}
      >
        <div className="p-3 flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs">
              <ChevronDown
                className={`h-3.5 w-3.5 mr-1 transition-transform ${positionsOpen ? "rotate-180" : ""}`}
              />
              Open positions
              {openPositionsCount > 0 && (
                <Badge variant="outline" className="ml-2 text-[10px]">{openPositionsCount}</Badge>
              )}
            </Button>
          </CollapsibleTrigger>
          {!liveAuthorized && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> Authorize live trading to close positions
            </span>
          )}
        </div>
        <CollapsibleContent>
          <div className="px-4 pb-4">
            {loadingPositions ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Loading positions…
              </div>
            ) : (positions?.length ?? 0) === 0 && (livePositions?.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No open positions on this account.
              </div>
            ) : (
              <PositionsTable
                account={account}
                liveAuthorized={liveAuthorized}
                positions={positions ?? []}
                livePositions={livePositions ?? []}
                closingId={closingId}
                onClose={closePosition}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function BrokerLogo({
  account,
  isPropFirm,
  displayName,
  accentColor,
}: {
  account: BrokerAccount;
  isPropFirm: boolean;
  displayName: string;
  accentColor: string;
}) {
  if (isPropFirm) {
    const firmMeta = PROP_FIRM_LIST.find((p) => p.code === account.propFirmType);
    const Icon = firmMeta ? (PROP_FIRM_ICON_MAP[firmMeta.icon] ?? Award) : Award;
    return (
      <div
        className="flex h-9 w-9 items-center justify-center rounded-md shrink-0"
        style={{
          background: `${accentColor}22`,
          color: accentColor,
          border: `1px solid ${accentColor}55`,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-md font-mono text-xs font-bold uppercase shrink-0"
      style={{
        background: `${accentColor}22`,
        color: accentColor,
        border: `1px solid ${accentColor}55`,
      }}
    >
      {displayName.slice(0, 2)}
    </div>
  );
}

function PropFirmCompliance({
  rules,
  compliance,
  currency,
  accentColor,
  lastSyncedAt,
}: {
  rules: PropFirmRules;
  compliance: {
    profitProgress: number;
    lossUsedPct: number;
    lossRemainingPct: number;
    dailyLossUsedPct: number;
    targetEquity: number;
    maxOverallLoss: number;
    maxDailyLoss: number;
  };
  currency: string;
  accentColor: string;
  lastSyncedAt?: string | null;
}) {
  return (
    <div className="rounded-md border border-white/5 bg-black/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" style={{ color: accentColor }} />
          Rule compliance
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          Synced {formatDateTime(lastSyncedAt)}
        </span>
      </div>

      <ComplianceBar
        label="Profit target"
        progress={compliance.profitProgress}
        suffix={`/ ${formatCurrency(compliance.targetEquity, currency)}`}
        accentColor={accentColor}
        reverse={false}
      />
      <ComplianceBar
        label="Max daily loss"
        progress={compliance.dailyLossUsedPct}
        suffix={`/ ${formatCurrency(compliance.maxDailyLoss, currency)}`}
        accentColor={accentColor}
        reverse
      />
      <ComplianceBar
        label={`Max overall loss${rules.trailingDrawdown ? " (trailing)" : ""}`}
        progress={compliance.lossUsedPct}
        suffix={`/ ${formatCurrency(compliance.maxOverallLoss, currency)}`}
        accentColor={accentColor}
        reverse
      />

      {compliance.lossUsedPct >= 80 && (
        <div className="flex items-center gap-1.5 text-[10px] text-loss">
          <AlertTriangle className="h-3 w-3" />
          Approaching max drawdown — reduce risk or pause replication.
        </div>
      )}
    </div>
  );
}

function ComplianceBar({
  label,
  progress,
  suffix,
  accentColor,
  reverse,
}: {
  label: string;
  progress: number;
  suffix?: string;
  accentColor: string;
  reverse: boolean; // if true, 100% = bad (loss used)
}) {
  const isWarning = reverse && progress >= 60;
  const isCritical = reverse && progress >= 80;
  const barColor = isCritical
    ? "var(--loss)"
    : isWarning
      ? "var(--warning)"
      : accentColor;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[10px]">
        <span className="text-muted-foreground uppercase tracking-wide font-mono">{label}</span>
        <span className="font-mono" style={{ color: barColor }}>
          {progress.toFixed(1)}% {suffix && <span className="text-muted-foreground">{suffix}</span>}
        </span>
      </div>
      <Progress value={progress} className="h-1.5" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="h-1.5 -mt-3 w-full overflow-hidden rounded-full">
        <div
          className="h-full transition-all"
          style={{ width: `${progress}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Metric + positions table
// ============================================================================

function Metric({
  icon: Icon,
  label,
  value,
  accent = "",
}: {
  icon?: typeof Wallet;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-sm bg-black/40 border border-white/5 p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`text-sm font-semibold tnum font-mono ${accent}`}>{value}</div>
    </div>
  );
}

function PositionsTable({
  account,
  liveAuthorized,
  positions,
  livePositions,
  closingId,
  onClose,
}: {
  account: BrokerAccount;
  liveAuthorized: boolean;
  positions: any[];
  livePositions: any[];
  closingId: string | null;
  onClose: (positionId: string, volume?: number) => void;
}) {
  const rows: any[] =
    livePositions.length > 0
      ? livePositions.map((p) => ({
          id: p.positionId,
          instrument: p.instrument,
          direction: p.direction,
          volume: p.volume,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          unrealizedProfit: p.unrealizedProfit,
          openTime: p.openTime,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          swap: p.swap,
          commission: p.commission,
          source: "live",
        }))
      : positions.map((p) => ({
          id: p.externalPositionId ?? p.id,
          instrument: p.instrument,
          direction: p.direction,
          volume: p.volume,
          entryPrice: p.entryPrice,
          currentPrice: null,
          unrealizedProfit: p.unrealizedProfit ?? p.netProfit,
          openTime: p.openTime,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          swap: p.swap,
          commission: p.commission,
          source: "stored",
        }));

  return (
    <div className="max-h-96 overflow-y-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
            <th className="text-left font-medium px-3 py-2">Instrument</th>
            <th className="text-left font-medium px-2 py-2">Dir</th>
            <th className="text-right font-medium px-2 py-2">Volume</th>
            <th className="text-right font-medium px-2 py-2">Entry</th>
            <th className="text-right font-medium px-2 py-2">Cur.</th>
            <th className="text-right font-medium px-2 py-2">uP/L</th>
            <th className="text-right font-medium px-2 py-2">SL / TP</th>
            <th className="text-right font-medium px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, idx) => {
            const isClosing = closingId === p.id;
            return (
              <tr key={`${p.id ?? idx}-${idx}`} className="border-b border-border last:border-0 hover:bg-accent/20">
                <td className="px-3 py-2 font-medium">{p.instrument}</td>
                <td className="px-2 py-2">
                  <span className={`text-xs font-medium ${p.direction === "BUY" ? "text-profit" : "text-loss"}`}>
                    {p.direction}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tnum">{formatNumber(p.volume)}</td>
                <td className="px-2 py-2 text-right tnum">{formatNumber(p.entryPrice, 5)}</td>
                <td className="px-2 py-2 text-right tnum">
                  {p.currentPrice !== null && p.currentPrice !== undefined ? formatNumber(p.currentPrice, 5) : "—"}
                </td>
                <td className={`px-2 py-2 text-right tnum font-medium ${(p.unrealizedProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                  {(p.unrealizedProfit ?? 0) >= 0 ? "+" : ""}{formatCurrency(p.unrealizedProfit ?? 0, account.currency)}
                </td>
                <td className="px-2 py-2 text-right tnum text-[11px] text-muted-foreground">
                  {p.stopLoss !== null && p.stopLoss !== undefined ? formatNumber(p.stopLoss, 5) : "—"} /{" "}
                  {p.takeProfit !== null && p.takeProfit !== undefined ? formatNumber(p.takeProfit, 5) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!liveAuthorized || isClosing}
                    onClick={() => onClose(p.id)}
                    className="h-7 text-xs"
                  >
                    {isClosing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                    Close
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Warnings
// ============================================================================

function DisconnectWarning() {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
      <div>
        <strong className="text-warning">Important:</strong> Disconnecting does not close open positions on the broker side. Log in to your broker platform to close them manually if needed.
      </div>
    </div>
  );
}

function LiveWarning() {
  return (
    <div className="rounded-md border border-loss/30 bg-loss/5 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-loss shrink-0 mt-0.5" />
      <div>
        <strong className="text-loss">Risk disclosure:</strong> Live trading can lose money. Execution may differ from source accounts due to spreads, slippage and execution delays. Only authorize accounts you intend to use for automated replication.
      </div>
    </div>
  );
}
