import type { AppView } from "@/lib/types";

const APP_VIEWS: AppView[] = [
  "dashboard", "discover", "analytics", "comparison", "portfolio", "live_monitor",
  "automated_trading", "trade_history", "backtesting", "risk_management",
  "broker_connections", "notifications", "settings", "admin", "watchlists", "instrument_mapping",
];

export function viewToPath(view: AppView): string {
  return view === "dashboard" ? "/" : `/${view.replaceAll("_", "-")}`;
}

export function viewFromPath(pathname: string): AppView | null {
  const slug = pathname.replace(/^\/+|\/+$/g, "").replaceAll("-", "_");
  if (!slug) return "dashboard";
  return APP_VIEWS.includes(slug as AppView) ? slug as AppView : null;
}
