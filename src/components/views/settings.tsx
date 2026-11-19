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
import { User, Bell, Shield, Globe, LogOut, Loader2, LockKeyhole, Clock3, AlertTriangle } from "lucide-react";

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
type SettingsResponse = {
  settings: Settings;
  profile?: { name: string | null; email: string; createdAt: string; hasPassword: boolean } | null;
};

async function fetchSettings(): Promise<SettingsResponse> {
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

const CHANNELS: { key: ChannelKey; label: string; desc: string; available: boolean }[] = [
  { key: "in_app", label: "In-app notifications", desc: "Alerts appear in the notification bell.", available: true },
  { key: "push", label: "Push notifications", desc: "Browser push delivery is not configured yet.", available: false },
  { key: "email", label: "Email notifications", desc: "Email delivery is not configured yet.", available: false },
  { key: "telegram", label: "Telegram notifications", desc: "Telegram bot delivery is not configured yet.", available: false },
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
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Sync fetched settings into local form state whenever the cache updates
  useEffect(() => {
    // These are editable controls; copy server-loaded preferences into their form state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.settings) setSettings(data.settings);
  }, [data]);

  // Sync name from the user prop
  useEffect(() => {
    const profileName = data?.profile?.name;
    // Sync server-loaded profile name into the editable account field.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof profileName === "string") setName(profileName);
    else if (typeof user?.name === "string") setName(user.name);
  }, [user?.name, data?.profile?.name]);

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
        defaultRiskReferenceBase: settings.defaultRiskReferenceBase,
        telegramChatId: settings.telegramChatId,
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

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Re-enter the new password and confirmation.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Password could not be updated.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordFormOpen(false);
      toast({ title: "Password changed", description: "Your password has been updated." });
    } catch (error) {
      toast({ title: "Could not change password", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingPassword(false);
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
      {isError && (
        <Card className="rm-glass border-destructive/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">Settings could not be loaded. Your unsaved form values may not reflect the saved preferences.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

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
                    {data?.profile?.createdAt && <div className="space-y-1">
                      <Label className="text-xs">Member since</Label>
                      <div className="text-sm text-muted-foreground">{new Date(data.profile.createdAt).toLocaleDateString()}</div>
                    </div>}
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
                      <div className="pr-4">
                        <div className="text-sm font-medium">{c.label}</div>
                        <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                      </div>
                      {c.available ? (
                        <Switch checked={checked} disabled={isToggling} onCheckedChange={(v) => toggleChannel(c.key, v)} />
                      ) : <Badge variant="outline" className="shrink-0 text-[10px]">Not configured</Badge>}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-3">
          <Card className="rm-glass">
            <CardHeader><CardTitle className="text-base">Security</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-md border border-white/5 bg-black/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Password</div>
                    <div className="text-[11px] text-muted-foreground">Use your current password to verify changes. New passwords must be at least 12 characters.</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setPasswordFormOpen((open) => !open)} disabled={!data?.profile?.hasPassword}>
                    <LockKeyhole className="h-3.5 w-3.5 mr-1.5" /> Change password
                  </Button>
                </div>
                {!data?.profile?.hasPassword && <p className="text-[11px] text-muted-foreground">This account does not currently use password sign-in.</p>}
                {passwordFormOpen && (
                  <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button onClick={changePassword} disabled={savingPassword || !currentPassword || newPassword.length < 12 || !confirmPassword}>
                        {savingPassword ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Update password
                      </Button>
                      <Button variant="ghost" onClick={() => { setPasswordFormOpen(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 rounded-md border border-white/5 bg-black/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Sign-in session</div>
                    <div className="text-[11px] text-muted-foreground">Sessions expire after 12 hours. Password changes do not revoke existing sessions yet. Two-factor authentication and remote session management are not available.</div>
                  </div>
                  <Badge variant="outline" className="shrink-0">12 hours</Badge>
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
                    <p className="text-[10px] text-muted-foreground">This default applies to new replication configurations only. New configurations start paused; automatic execution still requires explicit authorization and activation.</p>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <Label className="text-xs">Default risk reference</Label>
                    <select
                      value={settings.defaultRiskReferenceBase}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultRiskReferenceBase: e.target.value }))}
                      className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono uppercase tracking-wider text-white focus-visible:border-primary/40 focus-visible:ring-primary/20 focus-visible:ring-[3px] outline-none"
                    >
                      <option value="equity">Equity</option>
                      <option value="balance">Balance</option>
                      <option value="fixed_capital">Fixed capital</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground">Used by new risk-based replication configurations.</p>
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
