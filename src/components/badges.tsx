"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DataQuality, ProviderHealth } from "@/lib/types";
import { DATA_QUALITY_LABELS, PROVIDER_HEALTH_LABELS } from "@/lib/types";

// Fetch user's account status to determine if we should show DEMO badge
async function fetchHasLiveAccount(): Promise<boolean> {
  const res = await fetch("/api/me");
  if (!res.ok) return false;
  const data = await res.json();
  const accounts = data?.brokerAccounts ?? [];
  return accounts.some((a: any) => !a.isDemo && a.status === "connected");
}

/**
 * DemoBadge - No longer renders anything.
 * All demo data has been removed. This component is kept for compatibility
 * but always returns null. When you connect a live account, "● LIVE" shows
 * in the footer instead.
 */
export function DemoBadge({ hideIfLive }: { hideIfLive?: boolean }) {
  return null;
}

export function DataQualityBadge({ quality }: { quality: DataQuality | string }) {
  const q = quality as DataQuality;
  const variants: Record<DataQuality, string> = {
    verified: "bg-profit/15 text-profit border-profit/30",
    platform_reported: "bg-info/15 text-info border-info/30",
    calculated: "bg-warning/15 text-warning border-warning/30",
    estimated: "bg-warning/15 text-warning border-warning/30",
    incomplete: "bg-muted text-muted-foreground border-border",
    unavailable: "bg-loss/15 text-loss border-loss/30",
    delayed: "bg-warning/15 text-warning border-warning/30",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", variants[q])}>
      {DATA_QUALITY_LABELS[q] ?? quality}
    </Badge>
  );
}

export function HealthBadge({ status }: { status: ProviderHealth | string }) {
  const h = status as ProviderHealth;
  const variants: Record<ProviderHealth, string> = {
    healthy: "bg-profit/15 text-profit border-profit/30",
    under_observation: "bg-info/15 text-info border-info/30",
    deteriorating: "bg-warning/15 text-warning border-warning/30",
    high_risk: "bg-loss/15 text-loss border-loss/30",
    paused: "bg-muted text-muted-foreground border-border",
    inactive: "bg-muted text-muted-foreground border-border",
    data_unavailable: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium capitalize", variants[h])}>
      {PROVIDER_HEALTH_LABELS[h] ?? status}
    </Badge>
  );
}

export function ProfitPill({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const cls = value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-muted-foreground";
  const sign = value > 0 ? "+" : "";
  return <span className={cn("tnum font-medium", cls)}>{sign}{value.toFixed(2)}{suffix}</span>;
}
