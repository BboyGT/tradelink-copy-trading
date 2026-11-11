"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavStore } from "@/lib/nav-store";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { DemoBadge } from "@/components/badges";
import { BackTo } from "@/components/back-to";
import type { NotificationType, NotificationSeverity } from "@/lib/types";
import {
  Bell,
  BellOff,
  BellRing,
  Lock,
  CheckCheck,
  Loader2,
  Mail,
  Send,
  Smartphone,
  MessageCircle,
  CircleDot,
  AlertTriangle,
  Activity,
  ShieldAlert,
  Power,
  CircleCheck,
  XCircle,
  Info,
} from "lucide-react";

const FILTER_TABS: { value: string; label: string; type?: NotificationType }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "trade_opened", label: "Trade opened", type: "trade_opened" },
  { value: "trade_closed", label: "Trade closed", type: "trade_closed" },
  { value: "replication_success", label: "Replication OK", type: "replication_success" },
  { value: "replication_failed", label: "Replication failed", type: "replication_failed" },
  { value: "broker_disconnect", label: "Broker disconnect", type: "broker_disconnect" },
  { value: "risk_breach", label: "Risk breach", type: "risk_breach" },
  { value: "emergency_stop", label: "Emergency stop", type: "emergency_stop" },
];

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  info: "bg-info",
  success: "bg-profit",
  warning: "bg-warning",
  error: "bg-loss",
};

const SEVERITY_BORDER: Record<NotificationSeverity, string> = {
  info: "border-l-[var(--info)]",
  success: "border-l-[var(--profit)]",
  warning: "border-l-[var(--warning)]",
  error: "border-l-[var(--loss)]",
};

const SEVERITY_ICON: Record<NotificationSeverity, any> = {
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  error: XCircle,
};

const SEVERITY_TEXT: Record<NotificationSeverity, string> = {
  info: "text-info",
  success: "text-profit",
  warning: "text-warning",
  error: "text-loss",
};

const TYPE_LABELS: Record<string, string> = {
  trade_opened: "Trade opened",
  trade_closed: "Trade closed",
  trade_modified: "Trade modified",
  partial_closure: "Partial closure",
  replication_success: "Replication success",
  replication_failed: "Replication failed",
  broker_disconnect: "Broker disconnect",
  provider_drawdown: "Provider drawdown",
  risk_breach: "Risk breach",
  provider_status_change: "Provider status change",
  reconnect: "Reconnect",
  emergency_stop: "Emergency stop",
};

const TYPE_ICONS: Record<string, any> = {
  trade_opened: Activity,
  trade_closed: Activity,
  trade_modified: Activity,
  partial_closure: Activity,
  replication_success: CircleCheck,
  replication_failed: XCircle,
  broker_disconnect: BellOff,
  provider_drawdown: AlertTriangle,
  risk_breach: ShieldAlert,
  provider_status_change: Activity,
  reconnect: Power,
  emergency_stop: Power,
};

async function fetchNotifications(limit = 100) {
  const res = await fetch(`/api/notifications/list?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json() as Promise<{ notifications: any[]; unreadCount: number }>;
}

export function NotificationsView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [markingAll, setMarkingAll] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications", 100],
    queryFn: () => fetchNotifications(100),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const readMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", 100] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(
        unread.map((n) =>
          fetch(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => null),
        ),
      );
      await refetch();
      qc.invalidateQueries({ queryKey: ["notifications", 100] });
      toast({ title: "All marked as read", description: `${unread.length} notification${unread.length === 1 ? "" : "s"} cleared.` });
    } finally {
      setMarkingAll(false);
    }
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Lock className="h-6 w-6 mx-auto mb-3 text-warning" />
          <h2 className="text-lg font-semibold">Sign in required</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Sign in to view your notification feed and per-account alert preferences.
          </p>
          <Button onClick={() => setAuthOpen(true)}>Sign in to continue</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <BackTo view="dashboard" label="Back to dashboard" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Notifications <DemoBadge />
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time alerts for trade events, replication outcomes, broker disconnects and risk breaches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30">
              {unreadCount} unread
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
          >
            {markingAll ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            )}
            Mark all as read
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <ScrollArea className="w-full">
          <TabsList className="h-auto w-max grid grid-flow-col auto-cols-max p-1 gap-0.5">
            {FILTER_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
                {t.value === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-warning text-[9px] text-warning-foreground px-1">
                    {unreadCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <TabsContent value={filter} className="mt-3 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                <BellOff className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
                No notifications in this view.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => readMutation.mutate(id)}
                  markingRead={readMutation.isPending && readMutation.variables === n.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Example alert templates (Part 15) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="h-4 w-4 text-info" /> Example alert formats
          </CardTitle>
          <CardDescription className="text-xs">
            What trade-opened and trade-closed alerts look like in the notification feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ExampleAlert
            tone="info"
            title="Trade opened"
            source="Deriv-Account01"
            timestamp="2:14:33 PM"
            lines={[
              "Provider: AlphaFX Trader",
              "Direction: BUY",
              "Instrument: EURUSD",
              "Volume: 0.50 lots",
              "Entry price: 1.08542",
              "Stop loss: 1.08300",
              "Take profit: 1.09200",
              "Detection latency: 320 ms",
              "Replication status: pending",
            ]}
          />
          <ExampleAlert
            tone="success"
            title="Trade closed"
            source="Deriv-Account01"
            timestamp="6:26:51 PM"
            lines={[
              "Provider: AlphaFX Trader",
              "Instrument: EURUSD",
              "Direction: BUY",
              "Volume: 0.50 lots",
              "Entry: 1.08542 → Exit: 1.09210",
              "Gross P/L: +$33.50",
              "Net P/L (after swap/commission): +$31.20",
              "Holding time: 4h 12m",
              "Replication status: closed at destination",
            ]}
          />
        </CardContent>
      </Card>

      {/* Preferences (per provider/account) — read-only, "Coming soon" */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notification preferences
          </CardTitle>
          <CardDescription className="text-xs">
            Configure delivery channels per provider and per account. Editing is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div>
              <strong className="text-warning">Coming soon:</strong> Per-provider and per-account
              channel overrides, quiet hours, and severity thresholds. Switches below are read-only previews.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PreferenceRow
              icon={Bell}
              title="In-app"
              description="Show alerts in the topbar bell and this view."
              defaultChecked
              disabled
            />
            <PreferenceRow
              icon={Smartphone}
              title="Push"
              description="Browser / mobile push for severity ≥ warning."
              defaultChecked
              disabled
            />
            <PreferenceRow
              icon={Mail}
              title="Email"
              description="Daily digest plus risk breaches only."
              defaultChecked={false}
              disabled
            />
            <PreferenceRow
              icon={MessageCircle}
              title="Telegram"
              description="Real-time delivery to a connected bot."
              defaultChecked={false}
              disabled
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
  markingRead,
}: {
  notification: any;
  onMarkRead: (id: string) => void;
  markingRead: boolean;
}) {
  const severity = (notification.severity ?? "info") as NotificationSeverity;
  const TypeIcon = TYPE_ICONS[notification.type] ?? Bell;
  const SevIcon = SEVERITY_ICON[severity];
  const payload = safeParsePayload(notification.payload);
  const isPulseSeverity = severity === "warning" || severity === "error";

  return (
    <Card
      className={`rm-glass border-l-4 ${SEVERITY_BORDER[severity]} ${notification.read ? "opacity-70" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Severity dot + type icon */}
          <div className="relative shrink-0 mt-0.5">
            <span
              className={`${isPulseSeverity ? "rm-pulse-dot" : "h-2.5 w-2.5 rounded-full block"} ${SEVERITY_DOT[severity]}`}
              aria-label={`${severity} severity`}
            />
            {!notification.read && !isPulseSeverity && (
              <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-card" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <TypeIcon className={`h-3.5 w-3.5 ${SEVERITY_TEXT[severity]}`} />
                <span className="text-sm font-semibold font-mono">{notification.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {TYPE_LABELS[notification.type] ?? notification.type}
                </Badge>
                <SevIcon className={`h-3.5 w-3.5 ${SEVERITY_TEXT[severity]}`} />
              </div>
              <div className="text-[11px] text-muted-foreground tnum shrink-0">
                {formatDateTime(notification.createdAt)}
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">{notification.body}</p>

            {payload && Object.keys(payload).length > 0 && (
              <div className="mt-1 rounded-md border border-white/5 bg-black/40 p-2 text-[11px] text-muted-foreground">
                <span className="font-medium">Payload:</span>{" "}
                <code className="font-mono text-[10px] break-all">
                  {JSON.stringify(payload)}
                </code>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!notification.read && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onMarkRead(notification.id)}
                  disabled={markingRead}
                >
                  {markingRead ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3 w-3 mr-1" />
                  )}
                  Mark as read
                </Button>
              )}
              {notification.read && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <CircleCheck className="h-3 w-3" /> Read
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExampleAlert({
  tone,
  title,
  source,
  timestamp,
  lines,
}: {
  tone: NotificationSeverity;
  title: string;
  source: string;
  timestamp: string;
  lines: string[];
}) {
  const SevIcon = SEVERITY_ICON[tone];
  return (
    <div className="rounded-md border border-white/5 bg-black/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full block ${SEVERITY_DOT[tone]}`} />
          <SevIcon className={`h-3.5 w-3.5 ${SEVERITY_TEXT[tone]}`} />
          <span className="text-sm font-semibold font-mono">{title}</span>
        </div>
        <span className="text-[11px] text-muted-foreground tnum">{timestamp}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Source: <span className="text-foreground font-medium">{source}</span>
      </div>
      <Separator />
      <div className="space-y-0.5">
        {lines.map((l, i) => (
          <div key={i} className="text-[11px] text-muted-foreground font-mono leading-relaxed">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreferenceRow({
  icon: Icon,
  title,
  description,
  defaultChecked,
  disabled,
}: {
  icon: any;
  title: string;
  description: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <Label className="flex items-start justify-between gap-3 p-3 rounded-md border border-white/5 bg-black/40 hover:bg-primary/5 hover:border-primary/30 transition-colors cursor-not-allowed">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-[11px] text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch defaultChecked={defaultChecked} disabled={disabled} />
    </Label>
  );
}

function safeParsePayload(raw: any): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, any>;
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return null;
  }
}
