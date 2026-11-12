"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency,
  formatPct,
  formatNumber,
  formatDuration,
} from "@/lib/format";
import { DemoBadge, DataQualityBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import type { SizingMode } from "@/lib/types";
import {
  Search,
  X,
  Plus,
  Save,
  GitCompare,
  ArrowUpRight,
  History,
  Trophy,
  ChevronDown,
  Layers,
} from "lucide-react";

const MAX_PROVIDERS = 4;

async function searchProviders(search: string) {
  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  qs.set("limit", "20");
  const res = await fetch(`/api/providers?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchAnalytics(id: string) {
  const res = await fetch(`/api/analytics/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchComparisons() {
  const res = await fetch(`/api/comparisons/list`);
  if (!res.ok) return { comparisons: [] };
  return res.json();
}

interface MetricRowDef {
  key: string;
  label: string;
  // higher = better when true, lower = better when false
  higherIsBetter: boolean;
  format: (v: any, ctx: any) => string;
  raw: (a: any) => number | null;
}

const METRIC_ROWS: MetricRowDef[] = [
  {
    key: "lifetimeReturnPct",
    label: "Lifetime return",
    higherIsBetter: true,
    raw: (a) => a?.performance?.lifetimeReturnPct ?? null,
    format: (v) => formatPct(v),
  },
  {
    key: "monthlyReturnPct",
    label: "Monthly return",
    higherIsBetter: true,
    raw: (a) => a?.performance?.monthlyReturnPct ?? null,
    format: (v) => formatPct(v),
  },
  {
    key: "maxDrawdownPct",
    label: "Max drawdown",
    higherIsBetter: false,
    raw: (a) => a?.drawdown?.maxDrawdownPct ?? null,
    format: (v) => formatPct(v),
  },
  {
    key: "winRate",
    label: "Win rate",
    higherIsBetter: true,
    raw: (a) => a?.performance?.winRate ?? null,
    format: (v) => (v !== null ? `${v.toFixed(1)}%` : "-"),
  },
  {
    key: "profitFactor",
    label: "Profit factor",
    higherIsBetter: true,
    raw: (a) => a?.performance?.profitFactor ?? null,
    format: (v) => (v !== null ? v.toFixed(2) : "-"),
  },
  {
    key: "totalClosedTrades",
    label: "Total trades",
    higherIsBetter: true,
    raw: (a) => a?.performance?.totalClosedTrades ?? null,
    format: (v) => formatNumber(v, 0),
  },
  {
    key: "recoveryFactor",
    label: "Recovery factor",
    higherIsBetter: true,
    raw: (a) => a?.drawdown?.recoveryFactor ?? null,
    format: (v) => (v !== null ? v.toFixed(2) : "-"),
  },
  {
    key: "avgHoldingHours",
    label: "Avg holding time",
    higherIsBetter: false,
    raw: (a) => a?.behaviour?.avgHoldingHours ?? null,
    format: (v) => (v !== null ? formatDuration(v) : "-"),
  },
  {
    key: "riskConcentration",
    label: "Risk concentration",
    higherIsBetter: false,
    raw: (a) => a?.risk?.riskConcentration ?? null,
    format: (v) => (v !== null ? `${(v * 100).toFixed(1)}%` : "-"),
  },
];

export function ComparisonView({ user }: { user: any }) {
  const setView = useNavStore((s) => s.setView);
  const selectProvider = useNavStore((s) => s.selectProvider);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["providers", search, "comparison-search"],
    queryFn: () => searchProviders(search),
    enabled: searchOpen,
  });

  // Fetch analytics for each selected provider
  const analyticsQueries = useQuery({
    queryKey: ["comparison-analytics", selectedIds],
    queryFn: async () => {
      const results = await Promise.all(
        selectedIds.map(async (id) => {
          try {
            const data = await fetchAnalytics(id);
            return { id, data, ok: true };
          } catch (e: any) {
            return { id, data: null, ok: false };
          }
        }),
      );
      return results;
    },
    enabled: selectedIds.length > 0,
  });

  const { data: savedComparisonsData, refetch: refetchComparisons } = useQuery({
    queryKey: ["comparisons-list"],
    queryFn: fetchComparisons,
    enabled: !!user,
  });

  const analyticsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of analyticsQueries.data ?? []) {
      map[r.id] = r.data;
    }
    return map;
  }, [analyticsQueries.data]);

  function addProvider(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length >= MAX_PROVIDERS) {
        toast({
          title: "Max providers reached",
          description: `You can compare up to ${MAX_PROVIDERS} providers at once.`,
        });
        return prev;
      }
      return [...prev, id];
    });
    setSearchOpen(false);
    setSearch("");
  }

  function removeProvider(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  function clearAll() {
    setSelectedIds([]);
    setSaveName("");
  }

  function bestIndexFor(row: MetricRowDef): number {
    let bestIdx = -1;
    let bestVal: number | null = null;
    selectedIds.forEach((id, idx) => {
      const a = analyticsMap[id];
      if (!a) return;
      const v = row.raw(a);
      if (v === null || v === undefined) return;
      if (bestVal === null) {
        bestVal = v;
        bestIdx = idx;
      } else if (row.higherIsBetter ? v > bestVal : v < bestVal) {
        bestVal = v;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  async function saveComparison() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (selectedIds.length < 2) {
      toast({
        title: "Select more providers",
        description: "Pick at least 2 providers to save a comparison.",
      });
      return;
    }
    setSaving(true);
    try {
      const result: Record<string, any> = {};
      for (const row of METRIC_ROWS) {
        result[row.key] = selectedIds.map((id) => {
          const a = analyticsMap[id];
          return a ? row.raw(a) : null;
        });
      }
      const payload = {
        name: saveName?.trim() || `${selectedIds.length} providers`,
        providerIds: selectedIds,
        config: { metricRows: METRIC_ROWS.map((r) => r.key) },
        result,
      };
      const res = await fetch(`/api/comparisons/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Save failed");
      }
      toast({
        title: "Comparison saved",
        description: `Saved as "${payload.name}".`,
      });
      setSaveName("");
      refetchComparisons();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function loadComparison(c: any) {
    try {
      const ids = typeof c.providerIds === "string" ? JSON.parse(c.providerIds) : c.providerIds;
      if (Array.isArray(ids)) {
        setSelectedIds(ids.slice(0, MAX_PROVIDERS));
        setSaveName(c.name ?? "");
        queryClient.invalidateQueries({ queryKey: ["comparison-analytics"] });
      }
    } catch {}
  }

  const hasSelection = selectedIds.length > 0;
  const savedComparisons = savedComparisonsData?.comparisons ?? [];

  return (
    <div className="space-y-4">
      <BackTo view="discover" label="Back to providers" />
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            Provider comparison <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare up to {MAX_PROVIDERS} providers side-by-side. Best value in each row is highlighted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("discover")}>
            <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Browse providers
          </Button>
          <Button
            size="sm"
            onClick={saveComparison}
            disabled={saving || selectedIds.length < 2}
            title={!user ? "Sign in to save" : undefined}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving…" : "Save comparison"}
          </Button>
        </div>
      </div>

      {/* Comparison row */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Selected ({selectedIds.length}/{MAX_PROVIDERS})
              </Label>
              {hasSelection && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
                  Clear all
                </Button>
              )}
            </div>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedIds.length >= MAX_PROVIDERS}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add provider
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] p-0" align="end">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, ID, description…"
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
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : (searchData?.providers ?? []).length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No providers found.
                    </div>
                  ) : (
                    (searchData?.providers ?? []).map((p: any) => {
                      const already = selectedIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => !already && addProvider(p.id)}
                          disabled={already}
                          className="w-full text-left px-3 py-2 hover:bg-primary/10 hover:border-primary/30 disabled:opacity-40 transition-colors flex items-center gap-2 border-b border-white/5 last:border-0"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 border border-white/10 text-primary text-[10px] font-mono uppercase">
                            {p.name?.[0] ?? "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{p.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {p.platform?.name} • {p.accountCurrency ?? "USD"}
                            </div>
                          </div>
                          {already ? (
                            <Badge variant="outline" className="text-[9px]">Added</Badge>
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {!hasSelection ? (
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No providers selected</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Add 2 to {MAX_PROVIDERS} providers to see a side-by-side comparison of returns, drawdown, win rate and more.
              </p>
              <Button size="sm" onClick={() => setView("discover")}>
                <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Browse providers
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {selectedIds.map((id) => {
                const a = analyticsMap[id];
                const provider = a?.provider;
                const stats = provider;
                return (
                  <Card key={id} className="rm-glass hover:border-primary/30 transition-colors relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-loss"
                      onClick={() => removeProvider(id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <CardContent className="p-4 pt-3">
                      {analyticsQueries.isLoading || !a ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-3 w-1/2" />
                          <Separator className="my-2" />
                          <Skeleton className="h-5 w-1/2" />
                          <Skeleton className="h-3 w-3/4" />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => selectProvider(id)}
                            className="block text-left w-full"
                          >
                            <div className="text-sm font-semibold truncate hover:text-primary">
                              {provider?.name ?? "Unknown"}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {provider?.platformName ?? "-"} • {provider?.accountCurrency ?? "USD"}
                            </div>
                          </button>
                          <div className="mt-2">
                            <DataQualityBadge quality={provider?.verificationLevel ?? "unavailable"} />
                          </div>
                          <Separator className="my-3" />
                          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                            <span className="text-muted-foreground">Lifetime</span>
                            <span className={`text-right tnum font-medium ${formatPct(a?.performance?.lifetimeReturnPct).startsWith("+") ? "text-profit" : "text-loss"}`}>
                              {formatPct(a?.performance?.lifetimeReturnPct)}
                            </span>
                            <span className="text-muted-foreground">Max DD</span>
                            <span className="text-right tnum text-loss">{formatPct(a?.drawdown?.maxDrawdownPct)}</span>
                            <span className="text-muted-foreground">Win rate</span>
                            <span className="text-right tnum">
                              {a?.performance?.winRate !== null && a?.performance?.winRate !== undefined
                                ? `${a.performance.winRate.toFixed(1)}%`
                                : "-"}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-3 h-7 text-[11px]"
                            onClick={() => selectProvider(id)}
                          >
                            View analytics <ArrowUpRight className="h-3 w-3 ml-1" />
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Save name input */}
          {hasSelection && (
            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Comparison name (optional)"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="h-8 text-sm max-w-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                {user ? "Saved to your account." : "Sign in to save this comparison."}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison table */}
      {hasSelection && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-warning" />
              Side-by-side metrics
              <span className="text-[10px] text-muted-foreground font-normal ml-1">
                best value highlighted per row
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card min-w-[160px]">Metric</TableHead>
                    {selectedIds.map((id) => {
                      const a = analyticsMap[id];
                      return (
                        <TableHead key={id} className="text-right min-w-[120px]">
                          {a?.provider ? (
                            <button
                              onClick={() => selectProvider(id)}
                              className="text-right w-full hover:text-primary"
                            >
                              <div className="text-xs font-semibold truncate">{a.provider.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{a.provider.platformName}</div>
                            </button>
                          ) : (
                            <Skeleton className="h-4 w-24 ml-auto" />
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METRIC_ROWS.map((row) => {
                    const bestIdx = bestIndexFor(row);
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="sticky left-0 bg-card text-xs text-muted-foreground font-medium">
                          {row.label}
                        </TableCell>
                        {selectedIds.map((id, idx) => {
                          const a = analyticsMap[id];
                          const raw = a ? row.raw(a) : null;
                          const isBest = idx === bestIdx && raw !== null;
                          return (
                            <TableCell
                              key={id}
                              className={`text-right tnum text-sm font-mono ${isBest ? "bg-primary/15 text-primary font-semibold" : ""}`}
                            >
                              {!a ? (
                                <Skeleton className="h-4 w-12 ml-auto" />
                              ) : raw === null ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 justify-end">
                                  {row.format(raw, a)}
                                  {isBest && <Trophy className="h-3 w-3 text-warning shrink-0" />}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                  {/* Data quality row */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-card text-xs text-muted-foreground font-medium">
                      Data quality
                    </TableCell>
                    {selectedIds.map((id) => {
                      const a = analyticsMap[id];
                      return (
                        <TableCell key={id} className="text-right">
                          {a ? (
                            <DataQualityBadge quality={a?.drawdown?.dataQuality ?? "calculated"} />
                          ) : (
                            <Skeleton className="h-4 w-16 ml-auto" />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved comparisons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Saved comparisons
            {savedComparisons.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{savedComparisons.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!user ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              <Button variant="link" className="h-auto p-0" onClick={() => setAuthOpen(true)}>
                Sign in
              </Button>{" "}
              to save and reload your comparisons.
            </div>
          ) : savedComparisons.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              No saved comparisons yet. Select providers above and click <span className="font-medium text-foreground">Save comparison</span>.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
              {savedComparisons.map((c: any) => {
                let ids: string[] = [];
                try {
                  ids = typeof c.providerIds === "string" ? JSON.parse(c.providerIds) : c.providerIds ?? [];
                } catch {}
                return (
                  <button
                    key={c.id}
                    onClick={() => loadComparison(c)}
                    className="w-full text-left py-2.5 px-1 hover:bg-primary/10 hover:border-primary/30 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {ids.length} providers • updated {new Date(c.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground rotate-[-90deg]" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
