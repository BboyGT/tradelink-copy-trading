"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useNavStore } from "@/lib/nav-store";
import { DemoBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  History,
  Loader2,
  TrendingDown,
  XCircle,
} from "lucide-react";

interface HistoryResponse {
  positions: any[];
  reconciliation: { positionId: string; issues: string[]; healthy: boolean }[];
  total: number;
  offset: number;
  limit: number;
}

async function fetchHistory(offset: number, limit: number): Promise<HistoryResponse> {
  const res = await fetch(`/api/history/list?offset=${offset}&limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load trade history");
  return res.json();
}

type StatusFilter = "all" | "open" | "closed" | "rejected";

const PAGE_SIZE = 100;

const STATE_BADGE_STYLES: Record<string, string> = {
  open: "bg-info/15 text-info border-info/30",
  closed: "bg-profit/15 text-profit border-profit/30",
  rejected: "bg-loss/15 text-loss border-loss/30",
  partial: "bg-warning/15 text-warning border-warning/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function TradeHistoryView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const {
    data: pageData,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["history", "infinite"],
    queryFn: ({ pageParam = 0 }) => fetchHistory(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: !!user,
  });

  // Flatten paginated results into a single list of positions
  const positions = useMemo(() => {
    if (!pageData) return [];
    return pageData.pages.flatMap((page) => page.positions);
  }, [pageData]);

  // Merge reconciliation entries across pages (latest page also carries `total`)
  const reconciliation = useMemo(() => {
    if (!pageData) return [];
    return pageData.pages.flatMap((page) => page.reconciliation);
  }, [pageData]);
  const total = pageData?.pages[pageData.pages.length - 1]?.total ?? 0;
  const hasMore = hasNextPage;

  // Status counts (computed from loaded positions)
  const counts = useMemo(() => {
    const open = positions.filter((p) => p.state === "open").length;
    const closed = positions.filter((p) => p.state === "closed").length;
    const rejected = positions.filter((p) => p.state === "rejected").length;
    const issueCount = reconciliation.filter((r) => r.issues.length > 0).length;
    return { open, closed, rejected, issueCount };
  }, [positions, reconciliation]);

  // Filtered positions for the table
  const filteredPositions = useMemo(() => {
    if (statusFilter === "all") return positions;
    return positions.filter((p) => p.state === statusFilter);
  }, [positions, statusFilter]);

  // Reconciliation issues (positions with issues.length > 0)
  const issuesWithPositions = useMemo(() => {
    return reconciliation
      .filter((r) => r.issues.length > 0)
      .map((r) => {
        const pos = positions.find((p) => p.id === r.positionId);
        return { ...r, position: pos };
      })
      .filter((r) => r.position);
  }, [reconciliation, positions]);

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          Trade History <DemoBadge />
        </h1>
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-info/15 text-info">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Sign in required</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                View your complete trade ledger with source-vs-destination reconciliation.
                Sign in to access trade history.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button onClick={() => setAuthOpen(true)}>Sign in to continue</Button>
              <Button variant="outline" onClick={() => setView("discover")}>
                Browse providers
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleLoadMore() {
    void fetchNextPage();
  }

  function handleExportCsv() {
    const csv = buildCsv(filteredPositions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `trade-history-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <BackTo view="portfolio" label="Back to portfolio" />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Trade History <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete destination trade ledger with source reconciliation. {total} total positions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredPositions.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Reconciliation summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          label="Total positions"
          value={total}
          icon={History}
          accent="text-info"
        />
        <SummaryCard
          label="Open"
          value={counts.open}
          icon={Activity}
          accent="text-info"
        />
        <SummaryCard
          label="Closed"
          value={counts.closed}
          icon={CheckCircle2}
          accent="text-profit"
        />
        <SummaryCard
          label="Rejected"
          value={counts.rejected}
          icon={XCircle}
          accent="text-loss"
        />
        <SummaryCard
          label="Reconciliation issues"
          value={counts.issueCount}
          icon={AlertTriangle}
          accent={counts.issueCount > 0 ? "text-warning" : "text-muted-foreground"}
        />
      </div>

      {/* Reconciliation issues table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base uppercase flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Reconciliation issues
          </CardTitle>
          <CardDescription>
            Positions where source and destination states diverge. {issuesWithPositions.length} issue(s) detected in loaded page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {issuesWithPositions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-6 w-6 mx-auto text-profit mb-2" />
              No reconciliation issues. Source and destination states are consistent.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position ID</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Source state</TableHead>
                    <TableHead>Dest state</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issuesWithPositions.map((r) => {
                    const p = r.position!;
                    return (
                      <TableRow key={r.positionId}>
                        <TableCell className="font-mono text-[11px]">{r.positionId.slice(-8)}</TableCell>
                        <TableCell className="text-sm">{p.instrument}</TableCell>
                        <TableCell>
                          <DirectionBadge direction={p.direction} />
                        </TableCell>
                        <TableCell>
                          <StateBadge state={p.sourcePosition?.state ?? "missing"} />
                        </TableCell>
                        <TableCell>
                          <StateBadge state={p.state} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.issues.map((issue, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-[10px] bg-warning/15 text-warning border-warning/30"
                              >
                                {issue}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full trade history table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base uppercase flex items-center gap-2">
                <History className="h-4 w-4 text-info" /> Trade ledger
              </CardTitle>
              <CardDescription>
                Destination positions with source-vs-dest comparison. Showing {filteredPositions.length} of {positions.length} loaded.
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredPositions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No trades match the current filter.
            </div>
          ) : (
            <div className="max-h-[640px] overflow-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Broker account</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead className="text-right">Src vol</TableHead>
                    <TableHead className="text-right">Dest vol</TableHead>
                    <TableHead className="text-right">Src entry</TableHead>
                    <TableHead className="text-right">Dest entry</TableHead>
                    <TableHead className="text-right">Src exit</TableHead>
                    <TableHead className="text-right">Dest exit</TableHead>
                    <TableHead className="text-right">Src P/L</TableHead>
                    <TableHead className="text-right">Dest P/L</TableHead>
                    <TableHead className="text-right">Slippage</TableHead>
                    <TableHead className="text-right">Exec delay</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Open time</TableHead>
                    <TableHead>Close time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPositions.map((p) => (
                    <LedgerRow key={p.id} position={p} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground tnum">
              {positions.length} / {total} loaded
            </span>
            {hasMore ? (
              <Button size="sm" variant="outline" onClick={handleLoadMore} disabled={isFetchingNextPage || isFetching}>
                {(isFetchingNextPage || isFetching) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Loading…
                  </>
                ) : (
                  <>Load more</>
                )}
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">All loaded</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: any;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className={`text-lg font-semibold tnum font-mono ${accent}`}>{value}</div>
        <div className="rm-label mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isBuy = direction === "BUY";
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-medium ${
        isBuy ? "bg-profit/15 text-profit border-profit/30" : "bg-loss/15 text-loss border-loss/30"
      }`}
    >
      {direction}
    </Badge>
  );
}

function StateBadge({ state }: { state: string }) {
  const cls = STATE_BADGE_STYLES[state] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${cls}`}>
      {state}
    </Badge>
  );
}

function LedgerRow({ position: p }: { position: any }) {
  const src = p.sourcePosition;
  const providerName = src?.replicationConfig?.provider?.name ?? "-";
  const accountLabel = p.brokerAccount?.accountLabel ?? "-";
  const brokerCode = p.brokerAccount?.brokerCode ?? "";
  const srcPl = src?.netProfit ?? null;
  const destPl = p.netProfit ?? null;

  return (
    <TableRow>
      <TableCell className="text-xs">{providerName}</TableCell>
      <TableCell className="text-xs">
        <div className="flex flex-col">
          <span>{accountLabel}</span>
          {brokerCode && <span className="text-[10px] text-muted-foreground uppercase">{brokerCode}</span>}
        </div>
      </TableCell>
      <TableCell className="text-xs font-medium">{p.instrument}</TableCell>
      <TableCell><DirectionBadge direction={p.direction} /></TableCell>
      <NumCell value={src?.volume} decimals={2} />
      <NumCell value={p.volume} decimals={2} />
      <NumCell value={src?.entryPrice} decimals={src?.entryPrice > 1000 ? 2 : 5} />
      <NumCell value={p.entryPrice} decimals={p.entryPrice > 1000 ? 2 : 5} />
      <NumCell value={src?.exitPrice} decimals={src?.exitPrice > 1000 ? 2 : 5} />
      <NumCell value={p.exitPrice} decimals={p.exitPrice > 1000 ? 2 : 5} />
      <PlCell value={srcPl} />
      <PlCell value={destPl} />
      <NumCell value={p.slippagePips} decimals={2} suffix=" pips" />
      <NumCell value={p.executionDelayMs} decimals={0} suffix=" ms" />
      <TableCell><StateBadge state={p.state} /></TableCell>
      <TableCell className="text-[11px] text-muted-foreground tnum">{formatDateTime(p.openTime)}</TableCell>
      <TableCell className="text-[11px] text-muted-foreground tnum">{formatDateTime(p.closeTime)}</TableCell>
    </TableRow>
  );
}

function NumCell({
  value,
  decimals = 2,
  suffix = "",
}: {
  value: number | null | undefined;
  decimals?: number;
  suffix?: string;
}) {
  if (value === null || value === undefined) {
    return <TableCell className="text-right text-muted-foreground">-</TableCell>;
  }
  return (
    <TableCell className="text-right tnum text-xs">
      {formatNumber(value, decimals)}{suffix}
    </TableCell>
  );
}

function PlCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <TableCell className="text-right text-muted-foreground">-</TableCell>;
  }
  const cls = value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-muted-foreground";
  return (
    <TableCell className={`text-right tnum text-xs font-medium ${cls}`}>
      {formatCurrency(value)}
    </TableCell>
  );
}

// Inline CSV generator. Escapes quotes/commas/newlines per RFC 4180.
function csvEscape(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(positions: any[]): string {
  const headers = [
    "Position ID",
    "Provider",
    "Broker account",
    "Broker code",
    "Instrument",
    "Direction",
    "Source volume",
    "Destination volume",
    "Source entry",
    "Destination entry",
    "Source exit",
    "Destination exit",
    "Source P/L",
    "Destination P/L",
    "Slippage (pips)",
    "Execution delay (ms)",
    "State",
    "Open time",
    "Close time",
  ];

  const rows = positions.map((p) => {
    const src = p.sourcePosition;
    return [
      p.id,
      src?.replicationConfig?.provider?.name ?? "",
      p.brokerAccount?.accountLabel ?? "",
      p.brokerAccount?.brokerCode ?? "",
      p.instrument,
      p.direction,
      src?.volume ?? "",
      p.volume,
      src?.entryPrice ?? "",
      p.entryPrice,
      src?.exitPrice ?? "",
      p.exitPrice ?? "",
      src?.netProfit ?? "",
      p.netProfit ?? "",
      p.slippagePips ?? "",
      p.executionDelayMs ?? "",
      p.state,
      p.openTime ? formatDateTime(p.openTime) : "",
      p.closeTime ? formatDateTime(p.closeTime) : "",
    ].map(csvEscape);
  });

  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.join(","))].join("\n");
}
