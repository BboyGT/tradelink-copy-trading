"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavStore } from "@/lib/nav-store";
import { useTradeEvents, type TradeEvent } from "@/hooks/use-trade-events";
import { useAccountScanner, type ScanEvent } from "@/hooks/use-account-scanner";
import { DemoBadge } from "@/components/badges";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Clock,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Server,
  Square,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

async function fetchReplication() {
  const res = await fetch("/api/replication");
  if (!res.ok) throw new Error("Failed to load replication configs");
  return res.json() as Promise<{ configs: any[] }>;
}

type EventFilter = "all" | "open" | "modify" | "close";

const TYPE_STYLES: Record<TradeEvent["type"], string> = {
  open: "bg-info/15 text-info border-info/30",
  modify: "bg-warning/15 text-warning border-warning/30",
  close: "bg-loss/15 text-loss border-loss/30",
  partial_close: "bg-warning/15 text-warning border-warning/30",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-profit/15 text-profit border-profit/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  stopped: "bg-loss/15 text-loss border-loss/30",
  error: "bg-loss/15 text-loss border-loss/30",
};

export function LiveMonitorView({ user, isLiveMode }: { user: any; isLiveMode?: boolean }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);

  const { connected, events: wsEvents } = useTradeEvents(user?.id, isLiveMode);
  const { events: scanEvents, scanning, lastScanAt, totalMirrored, accountsScanned, scan } = useAccountScanner(user?.id);
  const [filter, setFilter] = useState<EventFilter>("all");
  const feedRef = useRef<HTMLDivElement | null>(null);

  const { data: replicationData, isLoading: replicationLoading } = useQuery({
    queryKey: ["replication"],
    queryFn: fetchReplication,
    enabled: !!user,
    refetchInterval: 15000,
  });

  const configs = replicationData?.configs ?? [];

  // Merge WS demo events + real scan events into a unified feed
  const allEvents = useMemo(() => {
    const wsFormatted: any[] = wsEvents.map(e => ({
      ...e,
      source: "live",
      sortTime: new Date(e.timestamp).getTime(),
    }));
    const scanFormatted: any[] = scanEvents.map(e => ({
      ...e,
      source: "live",
      sortTime: new Date(e.detectedAt).getTime(),
      eventId: `scan-${e.externalPositionId}-${e.detectedAt}`,
    }));
    return [...wsFormatted, ...scanFormatted].sort((a, b) => b.sortTime - a.sortTime);
  }, [wsEvents, scanEvents]);

  // Filtered events (max 50 displayed)
  const visibleEvents = useMemo(() => {
    const filtered =
      filter === "all" ? allEvents : allEvents.filter((e) => e.type === filter || (filter === "close" && e.type === "partial_close"));
    return filtered.slice(0, 50);
  }, [allEvents, filter]);

  // Auto-scroll feed to top when a new event arrives
  const latestEventId = allEvents[0]?.eventId;
  useEffect(() => {
    if (feedRef.current && latestEventId) {
      feedRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [latestEventId]);

  const lastEventTime = allEvents[0]?.timestamp ?? allEvents[0]?.detectedAt;
  const eventCount = allEvents.length;
  const liveEventCount = scanEvents.length;

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          Live Trade Monitor <DemoBadge hideIfLive={isLiveMode} />
        </h1>
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Sign in required</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                The live trade monitor streams real-time source events from your subscribed
                providers via WebSocket. Sign in to begin receiving trade events.
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

  const activeConfigs = configs.filter((c) => c.status === "active").length;
  const pausedConfigs = configs.filter((c) => c.status === "paused").length;
  const stoppedConfigs = configs.filter((c) => c.status === "stopped").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Live Trade Monitor <DemoBadge hideIfLive={isLiveMode} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time source trade events streamed via WebSocket, with destination replication status.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setView("automated_trading")}>
          <Bot className="h-4 w-4 mr-1.5" /> Configure replication
        </Button>
      </div>

      {/* Top status bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatusCell
              label="WebSocket"
              value={connected ? "Real-time" : "Reconnecting"}
              pulse={connected}
              icon={connected ? Wifi : WifiOff}
              accent={connected ? "text-profit" : "text-loss"}
              dotClass={connected ? "bg-profit" : "bg-loss"}
            />
            <StatusCell
              label="Account scanner"
              value={scanning ? "Scanning…" : (accountsScanned > 0 ? `${accountsScanned} accounts` : "Idle")}
              pulse={scanning}
              icon={RefreshCw}
              accent={accountsScanned > 0 ? "text-profit" : "text-muted-foreground"}
              dotClass={accountsScanned > 0 ? "bg-profit" : "bg-muted-foreground"}
            />
            <StatusCell
              label="Events received"
              value={eventCount.toString()}
              icon={Radio}
              accent="text-info"
            />
            <StatusCell
              label="Last event"
              value={lastEventTime ? formatDateTime(lastEventTime) : "-"}
              icon={Clock}
              accent="text-muted-foreground"
            />
            <StatusCell
              label="Mirrored"
              value={totalMirrored > 0 ? `${totalMirrored} trades` : "-"}
              icon={Zap}
              accent={totalMirrored > 0 ? "text-profit" : "text-muted-foreground"}
              dotClass={totalMirrored > 0 ? "bg-profit" : undefined}
              pulse={totalMirrored > 0}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live event feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2 font-mono uppercase">
                <Activity className="h-4 w-4 text-primary" /> Event feed
              </CardTitle>
              <CardDescription>
                {isLiveMode
                  ? "Monitoring your connected broker accounts for real trade events. Newest first - max 50 shown."
                  : "Events from your connected accounts. Newest first - max 50 shown."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="font-mono uppercase text-[10px] tracking-wider"
                onClick={() => scan()}
                disabled={scanning || !user}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${scanning ? "animate-spin" : ""}`} />
                Scan now
              </Button>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as EventFilter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="modify">Modify</TabsTrigger>
                <TabsTrigger value="close">Close</TabsTrigger>
              </TabsList>
            </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={feedRef}
              className="max-h-[640px] overflow-y-auto rounded-md border border-border/60 bg-background/30 pr-1"
            >
              {visibleEvents.length === 0 ? (
                <EmptyFeed connected={connected} isLiveMode={isLiveMode} />
              ) : (
                <div className="divide-y divide-border/60">
                  {visibleEvents.map((e) => (
                    <EventRow key={e.eventId} event={e} />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Replication status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2 font-mono uppercase">
                  <Server className="h-4 w-4 text-info" /> Replication status
                </CardTitle>
                <CardDescription>
                  Destination replication configs and runtime state.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <MiniStat label="Active" value={activeConfigs} accent="text-primary" />
              <MiniStat label="Paused" value={pausedConfigs} accent="text-warning" />
              <MiniStat label="Stopped" value={stoppedConfigs} accent="text-loss" />
            </div>

            {replicationLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : configs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No replication configs yet. Set up your first to begin copying trades.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto -mr-1 pr-1 space-y-2">
                {configs.map((c: any) => (
                  <ReplicationConfigRow key={c.id} config={c} />
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => setView("automated_trading")}
            >
              Configure replication <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCell({
  label,
  value,
  icon: Icon,
  accent,
  dotClass,
  pulse,
}: {
  label: string;
  value: string;
  icon: any;
  accent: string;
  dotClass?: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {dotClass ? (
        <span
          className={`relative flex h-2.5 w-2.5 ${pulse ? "animate-pulse" : ""}`}
        >
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
        </span>
      ) : (
        <Icon className={`h-4 w-4 ${accent}`} />
      )}
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-sm font-medium truncate ${accent}`}>{value}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-border/60 p-2 text-center">
      <div className={`text-lg font-semibold tnum ${accent}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function EventRow({ event }: { event: TradeEvent }) {
  const isBuy = event.direction === "BUY";
  const directionClass = isBuy
    ? "bg-profit/15 text-profit border-profit/30"
    : "bg-loss/15 text-loss border-loss/30";

  return (
    <div className="p-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] font-medium ${TYPE_STYLES[event.type]}`}>
              {event.type.toUpperCase()}
            </Badge>
            <Badge variant="outline" className={`text-[10px] font-medium ${directionClass}`}>
              {event.direction}
            </Badge>
            <span className="text-sm font-medium truncate">{event.instrument}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 truncate">
            {event.providerName}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-medium tnum">{formatNumber(event.volume, 2)} {event.brokerCode === "deriv" ? "stake" : "lots"}</div>
          <div className="text-[11px] text-muted-foreground tnum">
            @ {formatNumber(event.entryPrice, event.entryPrice > 1000 ? 2 : 5)}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Field
          label="Stop loss"
          value={event.stopLoss != null ? formatNumber(event.stopLoss, event.stopLoss > 1000 ? 2 : 5) : "-"}
        />
        <Field
          label="Take profit"
          value={event.takeProfit != null ? formatNumber(event.takeProfit, event.takeProfit > 1000 ? 2 : 5) : "-"}
        />
        <Field
          label="Detection"
          value={`${event.detectionLatencyMs}ms`}
        />
        <Field label="Received" value={formatDateTime(event.timestamp)} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-[11px] tnum truncate">{value}</div>
    </div>
  );
}

function ReplicationConfigRow({ config }: { config: any }) {
  const status = (config.status ?? "paused") as string;
  const providerName = config.provider?.name ?? "Unknown provider";
  const accountLabel = config.brokerAccount?.accountLabel ?? "Account";
  const brokerCode = config.brokerAccount?.brokerCode ?? "";

  const StatusIcon =
    status === "active" ? Play : status === "paused" ? Pause : Square;

  return (
    <div className="rounded-md border border-border/60 p-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{providerName}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {accountLabel} {brokerCode ? `· ${brokerCode.toUpperCase()}` : ""}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_STYLES[status] ?? ""}`}>
                <StatusIcon className="h-3 w-3" /> {status}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>Replication status</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
        <span>Mode: <span className="text-foreground capitalize">{config.executionMode}</span></span>
        <span>Sizing: <span className="text-foreground capitalize">{config.sizingMode?.replace("_", " ")}</span></span>
        <span className="text-right">
          Open: <span className="text-foreground tnum">{config.sourcePositions?.length ?? 0}</span>
        </span>
      </div>
    </div>
  );
}

function EmptyFeed({ connected, isLiveMode }: { connected: boolean; isLiveMode?: boolean }) {
  return (
    <div className="py-16 text-center text-sm text-muted-foreground space-y-2">
      <Activity className={`h-8 w-8 mx-auto ${connected ? "text-profit animate-pulse" : "text-muted-foreground/40"}`} />
      <div>{connected ? "Waiting for first event…" : (isLiveMode ? "Scanning your accounts for trades…" : "Reconnecting to event source…")}</div>
      <div className="text-[11px] text-muted-foreground">
        {isLiveMode
          ? "Connect a broker and set up replication to start monitoring live trades from your copy accounts."
          : "Connect a broker and set up replication to start monitoring live trades."}
      </div>
    </div>
  );
}
