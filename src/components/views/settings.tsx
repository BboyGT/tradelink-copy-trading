"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavStore } from "@/lib/nav-store";
import { DemoBadge } from "@/components/badges";
import { signOut } from "next-auth/react";
import { User, Bell, Shield, Globe, LogOut, AlertTriangle, Loader2 } from "lucide-react";

// Mirrors DEFAULT_SETTINGS in /api/settings/route.ts so the form has consistent
// shapes before the UserSettings row exists or while it's loading.
const DEFAULT_SETTINGS = {
  notifInApp: true,
  notifPush: false,
  notifEmail: true,
  notifTelegram: false,
  reportingCurrency: "USD",
  defaultSizingMode: "equity_ratio",
  defaultExecutionMode: "approval",
  defaultRiskReferenceBase: "equity",
  telegramChatId: null as string | null,
};

type Settings = typeof DEFAULT_SETTINGS;

// PUT accepts partial updates; we additionally allow `name` (the Account tab
// saves the profile name through the same endpoint).
type SettingsPayload = Partial<Settings> & { name?: string };

async function fetchSettings(): Promise<{ settings: Settings }> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

async function putSettings(payload: SettingsPayload): Promise<{ settings: Settings }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to save settings");
  }
  return res.json();
}

// Notification channel UI key -> UserSettings field name
const CHANNEL_FIELD = {
  in_app: "notifInApp",
  push: "notifPush",
  email: "notifEmail",
  telegram: "notifTelegram",
} as const;

type ChannelKey = keyof typeof CHANNEL_FIELD;

const CHANNELS: { key: ChannelKey; label: string; desc: string }[] = [
  { key: "in_app", label: "In-app notifications", desc: "Always-on; appears in the bell icon" },
  { key: "push", label: "Push notifications", desc: "Browser/mobile push (requires permission)" },
  { key: "email", label: "Email", desc: "Sent to your registered email" },
  { key: "telegram", label: "Telegram", desc: "Requires Telegram bot authorization" },
];

export function SettingsView({ user }: { user: any }) {
  const setAuthOpen = useNavStore((s) => s.setAuthOpen);
  const { toast } = useToast();
  const qc = useQueryClient();

  // 1) Fetch settings on mount when the user is logged in
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    enabled: !!user,
  });

  // 2) Initialize form state from fetched settings (or defaults if null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [togglingKey, setTogglingKey] = useState<ChannelKey | null>(null);

  // Sync fetched settings into local form state whenever the cache updates
  useEffect(() => {
    if (data?.settings) setSettings(data.settings);
  }, [data]);

  // Sync name from the user prop
  useEffect(() => {
    if (typeof user?.name === "string") setName(user.name);
  }, [user?.name]);

  // Surface fetch errors as toasts
  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Failed to load settings",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  if (!user) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Card className="rm-glass">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Sign in to manage your settings.{" "}
            <Button variant="link" className="px-1" onClick={() => setAuthOpen(true)}>Sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 4) Notification channel switches save immediately on toggle
  async function toggleChannel(key: ChannelKey, value: boolean) {
    const field = CHANNEL_FIELD[key];
    // Optimistic local update for immediate feedback
    setSettings((prev) => ({ ...prev, [field]: value }));
    setTogglingKey(key);
    try {
      await putSettings({ [field]: value });
      toast({
        title: "Saved",
        description: `${CHANNELS.find((c) => c.key === key)?.label} ${value ? "enabled" : "disabled"}.`,
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast({
        title: "Failed to save",
        description: e?.message ?? "Could not update channel.",
        variant: "destructive",
      });
      // Roll back to whatever the server has
      await refetch();
    } finally {
      setTogglingKey(null);
    }
  }

  // 5) Account tab - name field saves via PUT
  async function saveAccount() {
    setSavingName(true);
    try {
      await putSettings({ name });
      toast({ title: "Saved", description: "Profile updated." });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e: any) {
      toast({
        title: "Failed to save",
        description: e?.message ?? "Could not update profile.",
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  }

  // 6) Preferences tab - currency / sizing mode / execution mode save via PUT
  async function savePreferences() {
    setSavingPrefs(true);
    try {
      await putSettings({
        reportingCurrency: settings.reportingCurrency,
        defaultSizingMode: settings.defaultSizingMode,
        defaultExecutionMode: settings.defaultExecutionMode,
      });
      toast({ title: "Saved", description: "Preferences updated." });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast({
        title: "Failed to save",
        description: e?.message ?? "Could not update preferences.",
        variant: "destructive",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          Settings <DemoBadge />
        </h1>
        <p className="text-sm text-muted-foreground">Manage your account, notification preferences, and security.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
          <TabsTrigger value="account"><User className="h-3.5 w-3.5 mr-1.5" /> Account</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-3.5 w-3.5 mr-1.5" /> Security</TabsTrigger>
          <TabsTrigger value="preferences"><Globe className="h-3.5 w-3.5 mr-1.5" /> Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-3">
          <Card className="rm-glass">
            <CardHeader><CardTitle className="text-base">Account information</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <Skeleton className="h-9 w-28" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input defaultValue={user.email} disabled />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Role</Label>
                      <div>
                        <Badge variant="outline" className={user.role === "admin" ? "bg-primary/15 text-primary border-primary/30" : "bg-black/40 text-muted-foreground border-white/5"}>
                          {user.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button onClick={saveAccount} disabled={savingName}>
                    {savingName ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                    Save changes
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-3">
          <Card className="rm-glass">
            <CardHeader>
              <CardTitle className="text-base">Notification channels</CardTitle>
              <CardDescription>Choose how to receive alerts. Changes save automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                      <Skeleton className="h-5 w-9 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                CHANNELS.map((c) => {
                  const field = CHANNEL_FIELD[c.key];
                  const checked = settings[field];
                  const isToggling = togglingKey === c.key;
                  return (
                    <div key={c.key} className="flex items-center justify-between py-2">
                      <div>
                        <div className="text-sm font-medium">{c.label}</div>
                        <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                      </div>
                      <Switch
                        checked={checked}
                        disabled={isToggling}
                        onCheckedChange={(v) => toggleChannel(c.key, v)}
                      />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Per-provider preferences - placeholder until the provider picker UI lands. */}
          <Card className="rm-glass mt-3">
            <CardHeader>
              <CardTitle className="text-base">Per-provider preferences</CardTitle>
              <CardDescription>Configure which events trigger alerts per provider or per account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <strong className="text-warning">Coming soon:</strong> The backend already supports per-provider and
                  per-account overrides at{" "}
                  <code className="font-mono text-[10px]">/api/notification-preferences</code>, but the picker UI for
                  selecting providers is not wired up yet.
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Visit each provider&apos;s analytics page to configure provider-specific notification preferences.
                Visit each broker account page to configure account-specific preferences.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-3">
          <Card className="rm-glass">
            <CardHeader><CardTitle className="text-base">Security</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-md border border-white/5 bg-black/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Password</div>
                    <div className="text-[11px] text-muted-foreground">Last changed: unknown</div>
                  </div>
                  <Button variant="outline" size="sm">Change password</Button>
                </div>
              </div>
              <div className="p-3 rounded-md border border-white/5 bg-black/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Two-factor authentication</div>
                    <div className="text-[11px] text-muted-foreground">Recommended for accounts with live broker connections</div>
                  </div>
                  <Switch />
                </div>
              </div>
              <div className="p-3 rounded-md border border-white/5 bg-black/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Active sessions</div>
                    <div className="text-[11px] text-muted-foreground">Sign out of other devices</div>
                  </div>
                  <Button variant="outline" size="sm">Manage sessions</Button>
                </div>
              </div>
              <div className="p-3 rounded-md rm-glass-gold">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-warning flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Sign out
                    </div>
                    <div className="text-[11px] text-muted-foreground">End your current session</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
                    <LogOut className="h-3.5 w-3.5 mr-1" /> Sign out
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-3">
          <Card className="rm-glass">
            <CardHeader><CardTitle className="text-base">Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-9 w-full" />
                  <Separator />
                  <Skeleton className="h-9 w-full" />
                  <Separator />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-28" />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Reporting currency</Label>
                    <select
                      value={settings.reportingCurrency}
                      onChange={(e) => setSettings((prev) => ({ ...prev, reportingCurrency: e.target.value }))}
                      className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono uppercase tracking-wider text-white focus-visible:border-primary/40 focus-visible:ring-primary/20 focus-visible:ring-[3px] outline-none"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - Pound Sterling</option>
                      <option value="JPY">JPY - Japanese Yen</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground">Monetary performance is converted using recorded exchange-rate data; original amounts are always retained.</p>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <Label className="text-xs">Default sizing mode for new replications</Label>
                    <select
                      value={settings.defaultSizingMode}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultSizingMode: e.target.value }))}
                      className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono uppercase tracking-wider text-white focus-visible:border-primary/40 focus-visible:ring-primary/20 focus-visible:ring-[3px] outline-none"
                    >
                      <option value="equity_ratio">Equity ratio</option>
                      <option value="fixed_multiplier">Fixed multiplier</option>
                      <option value="fixed_lot">Fixed lot</option>
                      <option value="risk_based">Risk-based</option>
                    </select>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <Label className="text-xs">Default execution mode</Label>
                    <select
                      value={settings.defaultExecutionMode}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultExecutionMode: e.target.value }))}
                      className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono uppercase tracking-wider text-white focus-visible:border-primary/40 focus-visible:ring-primary/20 focus-visible:ring-[3px] outline-none"
                    >
                      <option value="approval">Approval required (recommended)</option>
                      <option value="auto">Fully automatic</option>
                      <option value="notify_only">Notification only</option>
                    </select>
                  </div>
                  <Button onClick={savePreferences} disabled={savingPrefs}>
                    {savingPrefs ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                    Save preferences
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
