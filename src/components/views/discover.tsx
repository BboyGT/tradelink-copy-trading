"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavStore } from "@/lib/nav-store";
import { formatPct, formatNumber } from "@/lib/format";
import { DataQualityBadge, HealthBadge, DemoBadge, ProfitPill } from "@/components/badges";
import { Search, Filter, Star, ArrowUpRight, Users, Activity, TrendingDown } from "lucide-react";

async function fetchProviders(params: { search?: string; platform?: string; sortBy?: string }) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.platform) qs.set("platform", params.platform);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  const res = await fetch(`/api/providers?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchPlatforms() {
  const res = await fetch("/api/admin/integrations");
  if (!res.ok) return { platforms: [] };
  return res.json();
}

export function DiscoverView({ user, isLiveMode }: { user: any; isLiveMode?: boolean }) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [sortBy, setSortBy] = useState("return");
  const selectProvider = useNavStore((s) => s.selectProvider);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);

  const { data, isLoading } = useQuery({
    queryKey: ["providers", search, platform, sortBy],
    queryFn: () => fetchProviders({ search, platform, sortBy }),
    refetchInterval: 60000,
  });

  const { data: platformsData } = useQuery({
    queryKey: ["platforms"],
    queryFn: fetchPlatforms,
    staleTime: 5 * 60 * 1000,
  });

  const providers = data?.providers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Discover providers <DemoBadge hideIfLive={isLiveMode} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} providers across {platformsData?.platforms?.length ?? 6} platforms. Filter by performance, drawdown, win rate.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="rm-glass">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or provider ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={platform || "all"} onValueChange={(v) => setPlatform(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All platforms" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {(platformsData?.platforms ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="return">Highest return</SelectItem>
                <SelectItem value="drawdown">Lowest drawdown</SelectItem>
                <SelectItem value="winrate">Highest win rate</SelectItem>
                <SelectItem value="profitFactor">Profit factor</SelectItem>
                <SelectItem value="recent">Recently synced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Provider grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card className="rm-glass">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No providers match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map((p: any) => (
            <ProviderCard key={p.id} provider={p} user={user} onSelect={() => selectProvider(p.id)} onSignIn={() => setAuthOpen(true)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider, user, onSelect, onSignIn }: { provider: any; user: any; onSelect: () => void; onSignIn: () => void }) {
  const stats = provider.statistic;
  const [subscribed, setSubscribed] = useState(provider.subscribed ?? false);
  const [subLoading, setSubLoading] = useState(false);

  async function toggleSubscribe() {
    if (!user) { onSignIn(); return; }
    setSubLoading(true);
    try {
      const res = await fetch(`/api/providers/${provider.id}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: subscribed ? "unsubscribe" : "subscribe" }),
      });
      if (res.ok) setSubscribed(!subscribed);
    } finally {
      setSubLoading(false);
    }
  }

  return (
    <Card className="rm-glass hover:border-primary/30 hover:bg-primary/5 transition-colors">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 border border-white/10 text-sm font-mono font-medium uppercase text-primary shrink-0">
            {provider.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <button onClick={onSelect} className="text-left w-full">
              <div className="text-sm font-semibold truncate hover:text-primary">{provider.name}</div>
              <div className="text-[11px] text-muted-foreground truncate font-mono uppercase tracking-wider">
                {provider.platform?.name} • {provider.accountCurrency ?? "USD"}
              </div>
            </button>
          </div>
          <button
            onClick={toggleSubscribe}
            disabled={subLoading}
            className={`p-1.5 rounded-md transition-colors ${subscribed ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
            title={subscribed ? "Unsubscribe" : "Subscribe"}
          >
            <Star className={`h-4 w-4 ${subscribed ? "fill-current" : ""}`} />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {provider.description ?? "No description provided."}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <DataQualityBadge quality={provider.verificationLevel} />
          <HealthBadge status={provider.health} />
          {provider.activityStatus === "active" ? (
            <Badge variant="outline" className="text-[10px] bg-profit/10 text-profit border-profit/30">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Inactive</Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Stat label="Lifetime" value={formatPct(stats?.lifetimeReturnPct)} className={stats?.lifetimeReturnPct && stats.lifetimeReturnPct > 0 ? "text-profit" : "text-loss"} />
          <Stat label="Max DD" value={formatPct(stats?.maxDrawdownPct)} className="text-loss" />
          <Stat label="Win rate" value={stats?.winRate !== null && stats?.winRate !== undefined ? `${stats.winRate.toFixed(1)}%` : "-"} />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
          <Stat label="PF" value={stats?.profitFactor !== null && stats?.profitFactor !== undefined ? stats.profitFactor.toFixed(2) : "-"} />
          <Stat label="Trades" value={stats?.totalClosedTrades?.toString() ?? "-"} />
          <Stat label="Followers" value={provider.followers?.toLocaleString() ?? "-"} />
        </div>

        <Button variant="outline" size="sm" className="w-full font-mono uppercase text-[11px] tracking-wider hover:bg-primary/10 hover:border-primary/30" onClick={onSelect}>
          View analytics <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-semibold tnum font-mono ${className}`}>{value}</div>
      <div className="rm-label">{label}</div>
    </div>
  );
}
