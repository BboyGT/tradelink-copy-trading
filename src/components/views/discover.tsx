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
import { DataQualityBadge, HealthBadge } from "@/components/badges";
import { Search, Star, ArrowUpRight, ExternalLink } from "lucide-react";

interface ConnectedAccount {
  id: string;
  brokerCode: string;
  accountLabel: string;
  balance: number;
  equity: number;
  currency: string;
  isDemo: boolean;
  isSelectedForCopy: boolean;
  status: string;
  authMethod?: string | null;
}

async function fetchConnectedAccounts() {
  const res = await fetch("/api/brokers");
  if (!res.ok) throw new Error("Could not load linked accounts");
  return res.json() as Promise<{ accounts: ConnectedAccount[] }>;
}

async function fetchProviders(params: { search?: string; platform?: string; sortBy?: string }) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.platform) qs.set("platform", params.platform);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  const res = await fetch(`/api/providers?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function DiscoverView({ user }: { user: any }) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [sortBy, setSortBy] = useState("return");
  const selectProvider = useNavStore((s) => s.selectProvider);
  const selectBrokerAccount = useNavStore((s) => s.selectBrokerAccount);
  const setView = useNavStore((s) => s.setView);
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["providers", search, platform, sortBy],
    queryFn: () => fetchProviders({ search, platform, sortBy }),
    refetchInterval: 60000,
  });

  const { data: brokerData, isLoading: accountsLoading } = useQuery({
    queryKey: ["brokers"],
    queryFn: fetchConnectedAccounts,
    enabled: !!user,
    staleTime: 15_000,
  });

  const providers = data?.providers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discover providers</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} published provider accounts across {data?.platforms?.length ?? 0} platforms.
          </p>
        </div>
      </div>

      {user && (
        <section className="space-y-3" aria-labelledby="connected-sources-heading">
          <div>
            <h2 id="connected-sources-heading" className="text-lg font-semibold">Copy from a connected account</h2>
            <p className="text-sm text-muted-foreground">
              If a cTrader Copy strategy is already running on one of your linked accounts, TradeLink can use that account&apos;s open positions as a source for your selected destination accounts.
            </p>
          </div>
          {accountsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
          ) : (brokerData?.accounts ?? []).filter((account) => account.status === "connected").length === 0 ? (
            <Card className="rm-glass border-dashed">
              <CardContent className="p-6 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
                <span>Link an account that receives the trades you want to mirror.</span>
                <Button variant="outline" size="sm" onClick={() => setView("broker_connections")}>Connect an account</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(brokerData?.accounts ?? []).filter((account) => account.status === "connected").map((account) => (
                <ConnectedSourceCard
                  key={account.id}
                  account={account}
                  onUseSource={() => {
                    if (!account.isSelectedForCopy) {
                      setView("broker_connections");
                      return;
                    }
                    selectBrokerAccount(account.id);
                    setView("automated_trading");
                  }}
                  onEnable={() => setView("broker_connections")}
                />
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Public strategy listings and provider statistics are not exposed by cTrader Open API. Browse cTrader Copy for strategies; TradeLink can mirror positions from an account you have connected and authorized.
          </p>
        </section>
      )}

      <Card className="rm-glass border-primary/20">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Copy a cTrader Copy strategy through TradeLink</p>
            <p className="text-xs text-muted-foreground max-w-3xl">
              cTrader does not expose its public strategy directory through Open API, so those profiles cannot be imported into this list. Browse and start copying a strategy in cTrader first, then connect the cTrader account receiving those trades here and use it as your source account. TradeLink can mirror its open-position changes to selected destination accounts while monitoring is running; unattended copying also needs a persistent scanner worker. It does not import the public provider directory or past trade history.
            </p>
          </div>
          <a
            href="https://ctrader.com/copy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-primary/10 hover:border-primary/30"
          >
            Browse cTrader Copy <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>

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
                {(data?.platforms ?? []).map((p: any) => (
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
      ) : isError ? (
        <Card className="rm-glass">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Provider data could not be loaded. <Button variant="link" onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : providers.length === 0 ? (
        <Card className="rm-glass">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No verified public provider profiles are available in the catalog yet. Sample profiles stay hidden. Connect an account that is already receiving copied trades above to mirror its live positions, or browse cTrader Copy for public strategies.
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

function ConnectedSourceCard({ account, onUseSource, onEnable }: {
  account: ConnectedAccount;
  onUseSource: () => void;
  onEnable: () => void;
}) {
  const positionsQuery = useQuery({
    queryKey: ["broker-positions", account.id],
    queryFn: async () => {
      const response = await fetch(`/api/brokers/${account.id}/positions`);
      if (!response.ok) throw new Error("Positions unavailable");
      return response.json() as Promise<{ livePositions?: Array<{ instrument?: string; symbol?: string; direction?: string; side?: string }> }>;
    },
    enabled: account.status === "connected",
    retry: false,
    staleTime: 15_000,
  });
  const positions = positionsQuery.data?.livePositions ?? [];
  const brokerName = account.brokerCode === "ctrader" ? "cTrader" : account.brokerCode.toUpperCase();

  return (
    <Card className="rm-glass">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{account.accountLabel}</div>
            <div className="text-xs text-muted-foreground">{brokerName} · {account.isDemo ? "Demo" : "Live"} · {account.currency}</div>
          </div>
          <Badge variant="outline" className="text-[10px]">Connected</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><div className="rm-label">Balance</div><div className="font-mono">{formatNumber(account.balance, 2)} {account.currency}</div></div>
          <div><div className="rm-label">Equity</div><div className="font-mono">{formatNumber(account.equity, 2)} {account.currency}</div></div>
        </div>
        <div className="border-t border-border pt-2 text-xs">
          <div className="font-medium">Open positions to mirror</div>
          {positionsQuery.isLoading ? <div className="text-muted-foreground mt-1">Checking linked account…</div> : positionsQuery.isError ? (
            <div className="text-muted-foreground mt-1">Position snapshot unavailable right now.</div>
          ) : positions.length === 0 ? (
            <div className="text-muted-foreground mt-1">No open source positions detected.</div>
          ) : (
            <div className="mt-1 text-muted-foreground">{positions.length} open · {positions.slice(0, 3).map((position) => `${position.instrument ?? position.symbol ?? "Position"} ${position.direction ?? position.side ?? ""}`).join(" · ")}</div>
          )}
        </div>
        <Button className="w-full" variant={account.isSelectedForCopy ? "outline" : "secondary"} size="sm" onClick={account.isSelectedForCopy ? onUseSource : onEnable}>
          {account.isSelectedForCopy ? "Use as replication source" : "Enable this account for copying"}
        </Button>
      </CardContent>
    </Card>
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
