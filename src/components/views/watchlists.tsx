"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { formatPct } from "@/lib/format";
import { DemoBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import {
  Star,
  Plus,
  ArrowUpRight,
  Users,
  TrendingDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ---------- fetchers ----------

async function fetchWatchlists() {
  const res = await fetch("/api/watchlists/list");
  if (!res.ok) {
    if (res.status === 401) {
      const err = new Error("UNAUTHORIZED") as Error & { code?: number };
      err.code = 401;
      throw err;
    }
    throw new Error("Failed to load watchlists");
  }
  return res.json() as Promise<{
    watchlists: Array<{
      id: string;
      name: string;
      description?: string | null;
      entries: Array<{
        id: string;
        provider: {
          id: string;
          name: string;
          platform?: { id: string; name: string } | null;
          accountCurrency?: string | null;
          statistic?: {
            lifetimeReturnPct?: number | null;
            maxDrawdownPct?: number | null;
            winRate?: number | null;
          } | null;
        };
      }>;
    }>;
  }>;
}

async function createWatchlist(payload: { name: string; description?: string }) {
  const res = await fetch("/api/watchlists/list", {
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
    throw new Error(err?.error ?? "Failed to create watchlist");
  }
  return res.json();
}

// ---------- helpers ----------

function pctClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-muted-foreground";
  if (v > 0) return "text-profit";
  if (v < 0) return "text-loss";
  return "text-muted-foreground";
}

// ---------- main view ----------

export function WatchlistsView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["watchlists"],
    queryFn: fetchWatchlists,
    enabled: !!user,
    refetchInterval: 60000,
  });

  const createMut = useMutation({
    mutationFn: createWatchlist,
    onSuccess: () => {
      toast({ title: "Watchlist created", description: `Saved "${name.trim()}".` });
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      setName("");
      setDescription("");
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
        description: e?.message ?? "Could not create watchlist.",
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
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give your watchlist a name." });
      return;
    }
    createMut.mutate({ name: name.trim(), description: description.trim() || undefined });
  }

  // Sign-in CTA when no user
  if (!user) {
    return (
      <div className="space-y-4">
        <BackTo view="dashboard" label="Back to dashboard" />
        <Card className="rm-glass">
          <CardContent className="p-12 text-center space-y-3">
            <Star className="h-10 w-10 text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Sign in to manage watchlists</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Save providers without copying them. Get alerts when their performance or risk profile changes.
            </p>
            <Button size="sm" onClick={() => setAuthOpen(true)}>Sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const watchlists = data?.watchlists ?? [];

  return (
    <div className="space-y-4">
      <BackTo view="dashboard" label="Back to dashboard" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Watchlists <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Save providers without copying them. Get alerts when their performance or risk profile changes.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New watchlist
        </Button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="rm-glass">
          <CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
            <AlertTriangle className="h-6 w-6 text-warning mx-auto" />
            <div>Failed to load watchlists.</div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : watchlists.length === 0 ? (
        <Card className="rm-glass">
          <CardContent className="p-12 text-center space-y-3">
            <Star className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">No watchlists yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Save providers without copying them. Get alerts when their performance or risk profile changes.
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first watchlist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {watchlists.map((w) => (
            <WatchlistCard key={w.id} watchlist={w} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-wider text-base">
              New watchlist
            </DialogTitle>
            <DialogDescription>
              Group providers to monitor without copying. Add providers from Discover.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="rm-label">Name</Label>
              <Input
                placeholder="e.g. High-risk scalpers"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label className="rm-label">Description</Label>
              <Textarea
                placeholder="Optional notes about what you're tracking…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={400}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Create watchlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- watchlist card ----------

interface WatchlistEntry {
  id: string;
  provider: {
    id: string;
    name: string;
    platform?: { id: string; name: string } | null;
    accountCurrency?: string | null;
    statistic?: {
      lifetimeReturnPct?: number | null;
      maxDrawdownPct?: number | null;
      winRate?: number | null;
    } | null;
  };
}

interface Watchlist {
  id: string;
  name: string;
  description?: string | null;
  entries: WatchlistEntry[];
}

function WatchlistCard({ watchlist }: { watchlist: Watchlist }) {
  const selectProvider = useNavStore((s) => s.selectProvider);
  const setView = useNavStore((s) => s.setView);

  const entryCount = watchlist.entries.length;

  return (
    <Card className="rm-glass">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">{watchlist.name}</span>
            </CardTitle>
            {watchlist.description ? (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {watchlist.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
              <Users className="h-3 w-3 mr-1" />
              {entryCount} {entryCount === 1 ? "provider" : "providers"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {entryCount === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Star className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No providers in this watchlist yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Add providers from Discover.
            </p>
            <Button variant="outline" size="sm" onClick={() => setView("discover")}>
              <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Browse providers
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {watchlist.entries.map((entry) => (
              <ProviderMiniCard
                key={entry.id}
                entry={entry}
                onViewAnalytics={() => selectProvider(entry.provider.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- provider mini-card ----------

function ProviderMiniCard({
  entry,
  onViewAnalytics,
}: {
  entry: WatchlistEntry;
  onViewAnalytics: () => void;
}) {
  const provider = entry.provider;
  const stats = provider.statistic;
  const platformName = provider.platform?.name ?? "Unknown";

  return (
    <div className="rounded-lg border border-border bg-black/30 hover:border-primary/30 hover:bg-primary/5 transition-colors p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 border border-white/10 text-primary text-[10px] font-mono uppercase shrink-0">
          {provider.name?.[0] ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <button onClick={onViewAnalytics} className="block text-left w-full">
            <div className="text-sm font-semibold truncate hover:text-primary">{provider.name}</div>
            <div className="text-[10px] text-muted-foreground truncate font-mono uppercase tracking-wider">
              {platformName} • {provider.accountCurrency ?? "USD"}
            </div>
          </button>
        </div>
      </div>

      <Separator />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStat
          label="Lifetime"
          value={formatPct(stats?.lifetimeReturnPct)}
          className={pctClass(stats?.lifetimeReturnPct)}
        />
        <MiniStat
          label="Max DD"
          value={formatPct(stats?.maxDrawdownPct)}
          className="text-loss"
          icon={<TrendingDown className="h-2.5 w-2.5 inline mr-0.5" />}
        />
        <MiniStat
          label="Win rate"
          value={
            stats?.winRate !== null && stats?.winRate !== undefined
              ? `${stats.winRate.toFixed(1)}%`
              : "—"
          }
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-[11px] font-mono uppercase tracking-wider hover:bg-primary/10 hover:border-primary/30"
        onClick={onViewAnalytics}
      >
        View analytics <ArrowUpRight className="h-3 w-3 ml-1.5" />
      </Button>
    </div>
  );
}

function MiniStat({
  label,
  value,
  className = "",
  icon,
}: {
  label: string;
  value: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <div className={`text-xs font-semibold tnum font-mono ${className}`}>{icon}{value}</div>
      <div className="rm-label mt-0.5">{label}</div>
    </div>
  );
}
