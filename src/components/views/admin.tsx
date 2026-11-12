"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DemoBadge } from "@/components/badges";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  ShieldCheck,
  Users,
  Activity,
  ArrowLeftRight,
  Link2,
  Bot,
  ScrollText,
  RefreshCw,
  Check,
  X,
  ShieldAlert,
  ServerCog,
  Lock,
  DownloadCloud,
  AlertCircle,
  Database,
  Loader2,
} from "lucide-react";

// ---------- API helpers ----------

async function fetchHealth() {
  const res = await fetch("/api/admin/health");
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Failed to load health metrics");
  }
  return res.json() as Promise<{
    admin: { email: string };
    metrics: {
      users: number;
      providers: number;
      trades: number;
      brokerAccounts: number;
      replicationConfigs: number;
      auditEvents24h: number;
    };
    integrations: any[];
  }>;
}

async function fetchIntegrations() {
  const res = await fetch("/api/admin/integrations");
  if (!res.ok) throw new Error("Failed to load integrations");
  return res.json() as Promise<{ platforms: any[] }>;
}

async function fetchAudit(limit: number) {
  const res = await fetch(`/api/admin/audit?limit=${limit}`);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Failed to load audit log");
  }
  return res.json() as Promise<{ events: any[]; total: number }>;
}

// Check whether the Deriv OAuth app is configured on the backend.
// We piggy-back on /api/brokers/deriv/oauth-url: a 200 with a `url` field
// means DERIV_APP_ID is set; any error or missing `url` means not configured.
async function fetchDerivOAuthStatus() {
  const res = await fetch("/api/brokers/deriv/oauth-url");
  const data = await res.json().catch(() => ({}));
  return {
    configured: res.ok && !!data.url,
    url: (data.url as string | undefined) ?? null,
    error: (data.error as string | undefined) ?? null,
  };
}

// Trigger the Deriv provider import. The endpoint is admin-only and returns
// { imported, updated, total, message } on success.
async function importDerivProviders() {
  const res = await fetch("/api/providers/import-deriv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 50 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Import failed");
  }
  return data as {
    imported: number;
    updated: number;
    total: number;
    message?: string;
  };
}

// Capability keys we display in the registry table.
const CAPABILITY_KEYS: { key: string; label: string }[] = [
  { key: "providerDiscovery", label: "Discovery" },
  { key: "providerStatistics", label: "Statistics" },
  { key: "historicalTrades", label: "History" },
  { key: "liveTradeEvents", label: "Live events" },
  { key: "openPositions", label: "Positions" },
  { key: "stopLossInfo", label: "SL info" },
  { key: "takeProfitInfo", label: "TP info" },
  { key: "partialClosures", label: "Partial close" },
  { key: "tradeExecution", label: "Execution" },
  { key: "positionModification", label: "Modify" },
  { key: "positionClosure", label: "Closure" },
  { key: "accountEquity", label: "Equity" },
  { key: "accountBalance", label: "Balance" },
];

const STREAMING_LABELS: Record<string, string> = {
  real_time: "Real-time",
  near_real_time: "Near real-time",
  periodic: "Periodic",
  historical_only: "Historical only",
  unavailable: "Unavailable",
};

const STREAMING_VARIANT: Record<string, string> = {
  real_time: "border-profit/40 text-profit bg-profit/10",
  near_real_time: "border-info/40 text-info bg-info/10",
  periodic: "border-warning/40 text-warning bg-warning/10",
  historical_only: "border-muted-foreground/30 text-muted-foreground",
  unavailable: "border-loss/40 text-loss bg-loss/10",
};

// ---------- Main view ----------

export function AdminView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);

  if (!user || user.role !== "admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          Admin <DemoBadge />
        </h1>
        <Card className="border-warning/30">
          <CardContent className="p-10 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-warning mx-auto" />
            <h2 className="text-lg font-semibold">Admin access required</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              This page is restricted to administrators. Administrators monitor system
              health, integration capabilities and audit trails - but never have access
              to user broker credentials or private trading information.
            </p>
            {!user ? (
              <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
            ) : (
              <Button variant="outline" onClick={() => setView("dashboard")}>
                Back to dashboard
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [auditLimit] = useState(100);
  const [refreshKey, setRefreshKey] = useState(0);
  const qc = useQueryClient();
  const { toast } = useToast();

  const {
    data: health,
    isLoading: healthLoading,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["admin-health", refreshKey],
    queryFn: fetchHealth,
  });

  const {
    data: integrationsData,
    isLoading: integLoading,
    refetch: refetchInteg,
  } = useQuery({
    queryKey: ["admin-integrations", refreshKey],
    queryFn: fetchIntegrations,
  });

  const {
    data: auditData,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ["admin-audit", auditLimit, refreshKey],
    queryFn: () => fetchAudit(auditLimit),
  });

  // Deriv OAuth status - drives the "configured / not configured" badge in the
  // Deriv Provider Import card. We don't blow up the whole dashboard if this
  // fails; the card just shows "not configured".
  const {
    data: derivOAuth,
    isLoading: derivOAuthLoading,
  } = useQuery({
    queryKey: ["deriv-oauth-status", refreshKey],
    queryFn: fetchDerivOAuthStatus,
    retry: false,
  });

  const derivImportMutation = useMutation({
    mutationFn: importDerivProviders,
    onSuccess: (data) => {
      toast({
        title: "Deriv providers imported",
        description: data.message ?? `Imported ${data.imported} new, updated ${data.updated} existing.`,
      });
      // Providers list / platform metrics may have changed.
      qc.invalidateQueries({ queryKey: ["admin-health"] });
      qc.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Deriv import failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  function refreshAll() {
    setRefreshKey((k) => k + 1);
    refetchHealth();
    refetchInteg();
    refetchAudit();
  }

  const metrics = health?.metrics;
  const metricCards = [
    {
      label: "Users",
      value: metrics?.users,
      icon: Users,
      accent: "text-info",
    },
    {
      label: "Providers",
      value: metrics?.providers,
      icon: Activity,
      accent: "text-profit",
    },
    {
      label: "Provider trades",
      value: metrics?.trades,
      icon: ArrowLeftRight,
      accent: "text-info",
    },
    {
      label: "Broker accounts",
      value: metrics?.brokerAccounts,
      icon: Link2,
      accent: "text-info",
    },
    {
      label: "Replication configs",
      value: metrics?.replicationConfigs,
      icon: Bot,
      accent: "text-profit",
    },
    {
      label: "Audit events (24h)",
      value: metrics?.auditEvents24h,
      icon: ScrollText,
      accent: "text-warning",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Admin dashboard <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            System health, integration capability registry and audit trail. Signed in
            as <span className="text-foreground font-medium">{health?.admin?.email ?? "-"}</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Privacy note */}
      <Card className="border-info/30">
        <CardContent className="p-3 flex items-start gap-2">
          <Lock className="h-4 w-4 text-info mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Administrators do <span className="text-foreground font-medium">not</span> have
            access to user broker credentials or private trading information. Broker
            credentials are encrypted at rest and only ever decrypted inside the broker
            connector at execution time.
          </p>
        </CardContent>
      </Card>

      {/* Metrics grid */}
      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ServerCog className="h-4 w-4 text-muted-foreground" /> Platform metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {metricCards.map((m) => {
            const Icon = m.icon;
            return (
              <Card key={m.label} className="rm-glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`h-4 w-4 ${m.accent}`} />
                  </div>
                  <div className={`text-lg font-semibold tnum font-mono ${m.accent}`}>
                    {healthLoading ? (
                      <Skeleton className="h-6 w-12" />
                    ) : (
                      formatNumber(m.value ?? 0, 0)
                    )}
                  </div>
                  <div className="rm-label mt-0.5">{m.label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Integration registry */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-profit" />
                Integration capability registry
              </CardTitle>
              <CardDescription className="text-xs">
                Per-platform feature matrix. An integration is never marked as
                fully functional when only some features work - partial capability is
                shown explicitly.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {integrationsData?.platforms?.length ?? 0} platforms
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {integLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded-md border border-white/5">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-xs">Platform</TableHead>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Kind</TableHead>
                    <TableHead className="text-xs">Streaming</TableHead>
                    <TableHead className="text-xs">Capabilities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(integrationsData?.platforms ?? []).map((p: any) => {
                    const caps = (p.capabilities ?? {}) as Record<string, boolean | string>;
                    const streaming = typeof caps.streamingMode === "string" ? caps.streamingMode : "unavailable";
                    return (
                      <TableRow key={p.id ?? p.code}>
                        <TableCell className="text-sm font-medium align-top">
                          {p.name}
                        </TableCell>
                        <TableCell className="text-xs align-top">
                          <code className="rounded bg-black/40 border border-white/5 px-1.5 py-0.5 text-muted-foreground font-mono">
                            {p.code}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs align-top capitalize text-muted-foreground">
                          {p.kind?.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${STREAMING_VARIANT[streaming] ?? ""}`}
                          >
                            {STREAMING_LABELS[streaming] ?? streaming}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1 max-w-2xl">
                            {CAPABILITY_KEYS.map((c) => {
                              const ok = !!caps[c.key];
                              return (
                                <Badge
                                  key={c.key}
                                  variant="outline"
                                  className={`text-[10px] ${
                                    ok
                                      ? "border-profit/30 bg-profit/15 text-profit"
                                      : "border-white/5 bg-black/40 text-muted-foreground"
                                  }`}
                                  title={ok ? "Supported" : "Not supported"}
                                >
                                  {ok ? (
                                    <Check className="h-2.5 w-2.5" />
                                  ) : (
                                    <X className="h-2.5 w-2.5" />
                                  )}
                                  {c.label}
                                </Badge>
                              );
                            })}
                            {caps.notes && (
                              <span className="text-[10px] text-muted-foreground italic self-center">
                                {caps.notes}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(integrationsData?.platforms ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                        No integration platforms registered.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground pt-2">
            Capabilities reflect what each platform API actually exposes - read-only
            platforms (e.g. cTrader Copy) cannot execute trades even when configured as
            a destination.
          </p>
        </CardContent>
      </Card>

      {/* Deriv provider import */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <DownloadCloud className="h-4 w-4 text-profit" />
                Deriv Provider Import
              </CardTitle>
              <CardDescription className="text-xs">
                Pull real Deriv copy trading providers into the Discover page.
              </CardDescription>
            </div>
            {/* DERIV_APP_ID status badge */}
            {derivOAuthLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : derivOAuth?.configured ? (
              <Badge
                variant="outline"
                className="text-[10px] border-profit/40 text-profit bg-profit/10"
                title={derivOAuth.url ?? undefined}
              >
                <Check className="h-3 w-3 mr-1" /> DERIV_APP_ID configured
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] border-warning/40 text-warning bg-warning/10"
                title={derivOAuth?.error ?? "DERIV_APP_ID is not set"}
              >
                <AlertCircle className="h-3 w-3 mr-1" /> DERIV_APP_ID not configured
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This fetches real Deriv copy trading providers and adds them to the
            Discover page.
          </p>

          {/* Result panel - only shows after a successful import */}
          {derivImportMutation.data && (
            <div className="rounded-md border border-profit/30 bg-profit/10 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-profit">
                <Database className="h-3.5 w-3.5" />
                Import result
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded bg-black/30 p-2">
                  <div className="text-[10px] text-muted-foreground">Imported</div>
                  <div className="text-base font-semibold tnum font-mono text-profit">
                    {formatNumber(derivImportMutation.data.imported ?? 0, 0)}
                  </div>
                </div>
                <div className="rounded bg-black/30 p-2">
                  <div className="text-[10px] text-muted-foreground">Updated</div>
                  <div className="text-base font-semibold tnum font-mono text-info">
                    {formatNumber(derivImportMutation.data.updated ?? 0, 0)}
                  </div>
                </div>
                <div className="rounded bg-black/30 p-2">
                  <div className="text-[10px] text-muted-foreground">Total seen</div>
                  <div className="text-base font-semibold tnum font-mono">
                    {formatNumber(derivImportMutation.data.total ?? 0, 0)}
                  </div>
                </div>
              </div>
              {derivImportMutation.data.message && (
                <p className="text-[10px] text-muted-foreground italic">
                  {derivImportMutation.data.message}
                </p>
              )}
            </div>
          )}

          {/* Error from the import endpoint (e.g. Deriv API down) */}
          {derivImportMutation.isError && (
            <div className="rounded-md border border-loss/30 bg-loss/10 p-3 text-xs text-loss flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Import failed</div>
                <div className="text-[11px] opacity-90">
                  {(derivImportMutation.error as Error)?.message ?? "Unknown error"}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => derivImportMutation.mutate()}
              disabled={derivImportMutation.isPending}
            >
              {derivImportMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DownloadCloud className="h-4 w-4 mr-2" />
              )}
              Import Deriv Providers
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Hits <code className="font-mono text-foreground">/api/providers/import-deriv</code> -
              admin only.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-info" /> Audit log
              </CardTitle>
              <CardDescription className="text-xs">
                Last {auditLimit} sensitive actions across the platform. Showing{" "}
                {auditData?.events?.length ?? 0} of {auditData?.total ?? 0} total events.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="max-h-[32rem] overflow-y-auto rounded-md border border-white/5">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Result</TableHead>
                    <TableHead className="text-xs">IP</TableHead>
                    <TableHead className="text-xs">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditData?.events ?? []).map((ev: any) => (
                    <AuditRow key={ev.id} ev={ev} />
                  ))}
                  {(auditData?.events ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                        No audit events recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditRow({ ev }: { ev: any }) {
  const [expanded, setExpanded] = useState(false);
  const resultColor: Record<string, string> = {
    success: "border-profit/40 text-profit bg-profit/10",
    failure: "border-loss/40 text-loss bg-loss/10",
    warning: "border-warning/40 text-warning bg-warning/10",
  };
  let pretty = "{}";
  try {
    const parsed = typeof ev.details === "string" ? JSON.parse(ev.details) : ev.details;
    pretty = JSON.stringify(parsed ?? {}, null, 2);
  } catch {
    pretty = String(ev.details ?? "{}");
  }
  const email = ev.user?.email ?? "system";
  return (
    <TableRow className="align-top">
      <TableCell className="text-[11px] text-muted-foreground tnum whitespace-nowrap">
        {formatDateTime(ev.createdAt)}
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap">{email}</TableCell>
      <TableCell className="text-xs">
        <code className="rounded bg-black/40 border border-white/5 px-1.5 py-0.5 text-foreground font-mono">{ev.action}</code>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`text-[10px] capitalize ${resultColor[ev.result] ?? ""}`}
        >
          {ev.result}
        </Badge>
      </TableCell>
      <TableCell className="text-[11px] text-muted-foreground tnum whitespace-nowrap">
        {ev.ipAddress ?? "-"}
      </TableCell>
      <TableCell className="max-w-md">
        <button
          onClick={() => setExpanded((s) => !s)}
          className="text-left w-full"
        >
          <pre
            className={`text-[10px] text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto font-mono ${
              expanded ? "max-h-96" : "max-h-8 overflow-hidden"
            }`}
          >
            {pretty}
          </pre>
        </button>
      </TableCell>
    </TableRow>
  );
}
