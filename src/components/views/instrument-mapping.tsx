"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
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
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import { DemoBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import {
  ArrowLeftRight,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Search,
} from "lucide-react";

// ---------- broker options ----------

const BROKER_OPTIONS: { code: string; name: string }[] = [
  { code: "deriv", name: "Deriv" },
  { code: "ctrader", name: "cTrader" },
  { code: "mt4", name: "MT4" },
  { code: "mt5", name: "MT5" },
  { code: "external", name: "External" },
];

function brokerLabel(code: string): string {
  return BROKER_OPTIONS.find((b) => b.code === code)?.name ?? code.toUpperCase();
}

function assetClassLabel(ac: string): string {
  const labels: Record<string, string> = {
    forex: "Forex",
    metal: "Metal",
    index: "Index",
    crypto: "Crypto",
    synthetic: "Synthetic",
    stock: "Stock",
  };
  return labels[ac] ?? ac;
}

// ---------- fetchers ----------

async function fetchSpecs(broker?: string) {
  const qs = new URLSearchParams();
  if (broker) qs.set("broker", broker);
  const res = await fetch(`/api/instruments/list?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed to load instrument specs");
  return res.json() as Promise<{
    specs: Array<{
      id: string;
      brokerCode: string;
      symbol: string;
      assetClass: string;
      contractSize: number;
      tickSize: number;
      tickValue: number;
      minVolume: number;
      maxVolume: number;
      volumeStep: number;
    }>;
  }>;
}

async function fetchMappings() {
  const res = await fetch("/api/instruments/map");
  if (!res.ok) {
    if (res.status === 401) {
      const e = new Error("UNAUTHORIZED") as Error & { code?: number };
      e.code = 401;
      throw e;
    }
    throw new Error("Failed to load instrument mappings");
  }
  return res.json() as Promise<{
    mappings: Array<{
      id: string;
      sourceBroker: string;
      sourceSymbol: string;
      destBroker: string;
      destSymbol: string;
      equivalenceConfidence: number;
      approved: boolean;
      createdAt?: string;
    }>;
  }>;
}

async function createMapping(payload: {
  sourceBroker: string;
  sourceSymbol: string;
  destBroker: string;
  destSymbol: string;
  equivalenceConfidence: number;
  approved: boolean;
}) {
  const res = await fetch("/api/instruments/map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const e = new Error("UNAUTHORIZED") as Error & { code?: number };
      e.code = 401;
      throw e;
    }
    throw new Error(err?.error ?? "Failed to create mapping");
  }
  return res.json();
}

// ---------- main view ----------

export function InstrumentMappingView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Specs filter
  const [brokerFilter, setBrokerFilter] = useState<string>("all");
  const [symbolSearch, setSymbolSearch] = useState<string>("");

  // Create mapping dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceBroker, setSourceBroker] = useState<string>("deriv");
  const [sourceSymbol, setSourceSymbol] = useState("");
  const [destBroker, setDestBroker] = useState<string>("ctrader");
  const [destSymbol, setDestSymbol] = useState("");
  const [confidence, setConfidence] = useState<number>(80);
  const [approved, setApproved] = useState<boolean>(false);

  const { data: specsData, isLoading: specsLoading, refetch: refetchSpecs } = useQuery({
    queryKey: ["instrument-specs", brokerFilter],
    queryFn: () => fetchSpecs(brokerFilter === "all" ? undefined : brokerFilter),
    staleTime: 60 * 1000,
  });

  const { data: mappingsData, isLoading: mappingsLoading, error: mappingsErr, refetch: refetchMappings } = useQuery({
    queryKey: ["instrument-mappings"],
    queryFn: fetchMappings,
    enabled: !!user,
    refetchInterval: 60000,
  });

  const createMut = useMutation({
    mutationFn: createMapping,
    onSuccess: () => {
      toast({
        title: "Mapping created",
        description: `${sourceSymbol.toUpperCase()} → ${destSymbol.toUpperCase()} (${confidence}% confidence)`,
      });
      qc.invalidateQueries({ queryKey: ["instrument-mappings"] });
      // Reset form
      setSourceSymbol("");
      setDestSymbol("");
      setConfidence(80);
      setApproved(false);
      setCreateOpen(false);
    },
    onError: (e: any) => {
      if (e?.code === 401 || e?.message === "UNAUTHORIZED") {
        setAuthOpen(true);
        setCreateOpen(false);
        return;
      }
      toast({
        title: "Create failed",
        description: e?.message ?? "Could not create mapping.",
        variant: "destructive",
      });
    },
  });

  function openCreate() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setCreateOpen(true);
  }

  function submitCreate() {
    if (!sourceSymbol.trim() || !destSymbol.trim()) {
      toast({ title: "Symbols required", description: "Both source and destination symbols must be provided." });
      return;
    }
    if (sourceBroker === destBroker && sourceSymbol.trim().toUpperCase() === destSymbol.trim().toUpperCase()) {
      toast({ title: "Invalid mapping", description: "Source and destination must differ." });
      return;
    }
    createMut.mutate({
      sourceBroker,
      sourceSymbol: sourceSymbol.trim().toUpperCase(),
      destBroker,
      destSymbol: destSymbol.trim().toUpperCase(),
      equivalenceConfidence: confidence / 100,
      approved,
    });
  }

  const specs = specsData?.specs ?? [];
  const filteredSpecs = symbolSearch.trim()
    ? specs.filter((s) => s.symbol.toLowerCase().includes(symbolSearch.trim().toLowerCase()))
    : specs;

  const mappings = mappingsData?.mappings ?? [];

  // Sign-in gate for mappings (specs are public, mappings require auth)
  return (
    <div className="space-y-4">
      <BackTo view="dashboard" label="Back to dashboard" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Instrument Mapping <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Map instruments across brokers so trade replication routes to the correct destination symbol.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Create mapping
        </Button>
      </div>

      {/* Instrument specifications */}
      <Card className="rm-glass">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Instrument specifications
              </CardTitle>
              <CardDescription className="text-xs">
                Contract metadata for every supported symbol, per broker.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search symbol…"
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="pl-8 h-8 w-40 text-sm font-mono"
                />
              </div>
              <Select value={brokerFilter} onValueChange={setBrokerFilter}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder="All brokers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brokers</SelectItem>
                  {BROKER_OPTIONS.map((b) => (
                    <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {specsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : filteredSpecs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No instrument specifications found {brokerFilter !== "all" ? `for ${brokerLabel(brokerFilter)}` : ""}.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2 max-h-[28rem] overflow-y-auto rm-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Broker</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Symbol</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground">Asset class</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Contract size</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Tick size</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Tick value</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Min vol</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Max vol</TableHead>
                    <TableHead className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground text-right">Vol step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSpecs.map((s) => (
                    <TableRow key={s.id} className="hover:bg-primary/5">
                      <TableCell className="font-mono uppercase text-xs tracking-wider">{brokerLabel(s.brokerCode)}</TableCell>
                      <TableCell className="font-mono text-xs font-medium">{s.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">{assetClassLabel(s.assetClass)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tnum font-mono text-xs">{formatNumber(s.contractSize)}</TableCell>
                      <TableCell className="text-right tnum font-mono text-xs">{formatNumber(s.tickSize)}</TableCell>
                      <TableCell className="text-right tnum font-mono text-xs">{formatNumber(s.tickValue)}</TableCell>
                      <TableCell className="text-right tnum font-mono text-xs">{formatNumber(s.minVolume)}</TableCell>
                      <TableCell className="text-right tnum font-mono text-xs">{formatNumber(s.maxVolume)}</TableCell>
                      <TableCell className="text-right tnum font-mono text-xs">{formatNumber(s.volumeStep)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            <span>{filteredSpecs.length} spec{filteredSpecs.length === 1 ? "" : "s"}</span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] font-mono uppercase tracking-wider" onClick={() => refetchSpecs()}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mappings */}
      <Card className="rm-glass">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base">Mappings</CardTitle>
              <CardDescription className="text-xs">
                Cross-broker symbol equivalences used by the replication engine.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] font-mono uppercase tracking-wider" onClick={() => refetchMappings()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!user ? (
            <div className="py-8 text-center space-y-3">
              <ArrowLeftRight className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Sign in to view and create instrument mappings.</p>
              <Button size="sm" onClick={() => setAuthOpen(true)}>Sign in</Button>
            </div>
          ) : mappingsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : mappingsErr ? (
            <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
              <AlertTriangle className="h-6 w-6 text-warning mx-auto" />
              <div>Failed to load mappings.</div>
              <Button variant="outline" size="sm" onClick={() => refetchMappings()}>Retry</Button>
            </div>
          ) : mappings.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-2">
              <ArrowLeftRight className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No instrument mappings yet</p>
              <p className="text-xs text-muted-foreground">Create a mapping to translate trades across brokers.</p>
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create mapping
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {mappings.map((m) => (
                <MappingRow key={m.id} mapping={m} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create mapping dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-wider text-base">
              Create mapping
            </DialogTitle>
            <DialogDescription>
              Define an equivalence between a source and destination instrument so replication can route trades correctly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Source */}
            <div className="space-y-2">
              <Label className="rm-label">Source</Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={sourceBroker} onValueChange={setSourceBroker}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="Broker" />
                  </SelectTrigger>
                  <SelectContent>
                    {BROKER_OPTIONS.map((b) => (
                      <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Symbol (e.g. R_100)"
                  value={sourceSymbol}
                  onChange={(e) => setSourceSymbol(e.target.value)}
                  className="col-span-2 font-mono uppercase"
                  maxLength={32}
                />
              </div>
            </div>

            {/* Visual arrow */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <Separator className="w-12" />
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                <Separator className="w-12" />
              </div>
            </div>

            {/* Destination */}
            <div className="space-y-2">
              <Label className="rm-label">Destination</Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={destBroker} onValueChange={setDestBroker}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="Broker" />
                  </SelectTrigger>
                  <SelectContent>
                    {BROKER_OPTIONS.map((b) => (
                      <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Symbol (e.g. VOL100)"
                  value={destSymbol}
                  onChange={(e) => setDestSymbol(e.target.value)}
                  className="col-span-2 font-mono uppercase"
                  maxLength={32}
                />
              </div>
            </div>

            {/* Confidence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="rm-label">Equivalence confidence</Label>
                <span className="text-xs font-mono tnum text-primary">{confidence}%</span>
              </div>
              <Slider
                value={[confidence]}
                onValueChange={(v) => setConfidence(v[0])}
                min={0}
                max={100}
                step={5}
              />
              <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <span>Uncertain</span>
                <span>Exact match</span>
              </div>
            </div>

            {/* Approved */}
            <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border bg-black/30 p-3 hover:border-primary/30 transition-colors">
              <Checkbox
                checked={approved}
                onCheckedChange={(v) => setApproved(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-medium">Approve mapping</div>
                <div className="text-[10px] text-muted-foreground">
                  Approved mappings are immediately eligible for live replication. Unapproved mappings are queued for review.
                </div>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMut.isPending || !sourceSymbol.trim() || !destSymbol.trim()}>
              {createMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Create mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- mapping row ----------

interface Mapping {
  id: string;
  sourceBroker: string;
  sourceSymbol: string;
  destBroker: string;
  destSymbol: string;
  equivalenceConfidence: number;
  approved: boolean;
  createdAt?: string;
}

function MappingRow({ mapping }: { mapping: Mapping }) {
  const confidencePct = Math.round((mapping.equivalenceConfidence ?? 0) * 100);

  return (
    <div className="rounded-lg border border-border bg-black/30 p-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
      {/* Source → Destination */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {brokerLabel(mapping.sourceBroker)}
          </span>
          <span className="font-mono text-sm font-medium truncate">{mapping.sourceSymbol}</span>
        </div>
        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {brokerLabel(mapping.destBroker)}
          </span>
          <span className="font-mono text-sm font-medium truncate">{mapping.destSymbol}</span>
        </div>
      </div>

      {/* Confidence */}
      <div className="flex flex-col items-start md:items-end shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Confidence</span>
        <span className={`font-mono text-sm font-medium tnum ${confidencePct >= 80 ? "text-profit" : confidencePct >= 50 ? "text-warning" : "text-loss"}`}>
          {confidencePct}%
        </span>
      </div>

      <Separator orientation="vertical" className="hidden md:block h-10" />

      {/* Approved badge */}
      <div className="shrink-0">
        {mapping.approved ? (
          <Badge variant="outline" className="text-[10px] bg-profit/15 text-profit border-profit/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30 gap-1">
            <AlertTriangle className="h-3 w-3" /> Unapproved
          </Badge>
        )}
      </div>
    </div>
  );
}
