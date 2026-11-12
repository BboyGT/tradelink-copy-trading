"use client";

import { format } from "date-fns";

export function formatCurrency(value: number | null | undefined, currency = "USD", decimals = 2): string {
  if (value === null || value === undefined) return "-";
  const sign = value < 0 ? "-" : "";
  const num = Math.abs(value);
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  const sym = symbols[currency] ?? "";
  return `${sign}${sym}${num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MMM d, yyyy HH:mm");
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
