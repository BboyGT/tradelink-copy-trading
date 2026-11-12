// TRADE LINK - Core type definitions and enums
// Used across frontend, API routes, and engine modules.

// ============ PLATFORMS & BROKERS ============

export type PlatformCode =
  | "deriv"
  | "ctrader"
  | "deriv_ctrader"
  | "ctrader_copy"
  | "mt4"
  | "mt5"
  | "fxcm"
  | "external";

export type BrokerCode =
  | "deriv"
  | "ctrader"
  | "mt4"
  | "mt5"
  | "fxcm"
  | "ftmo"
  | "fundednext"
  | "myfundedfx"
  | "the5ers"
  | "propfirm"
  | "external";

// Prop firm rule presets - each prop firm has different rules
export interface PropFirmRules {
  name: string;
  maxDailyLossPct: number;      // % of starting balance
  maxOverallLossPct: number;    // % of starting balance (max drawdown)
  profitTargetPct: number;      // % to pass the challenge
  trailingDrawdown: boolean;    // does the drawdown trail the peak?
  minTradingDays: number;       // minimum days to trade
  maxTradingDays?: number;       // max days to complete challenge
  newsTradingAllowed: boolean;
  weekendHoldingAllowed: boolean;
  eaAllowed: boolean;
  consistencyRulePct?: number;  // max % of profit from single day
  description: string;
}

export const PROP_FIRM_PRESETS: Record<string, PropFirmRules> = {
  ftmo: {
    name: "FTMO",
    maxDailyLossPct: 5,
    maxOverallLossPct: 10,
    profitTargetPct: 10,
    trailingDrawdown: false,
    minTradingDays: 4,
    maxTradingDays: 30,
    newsTradingAllowed: true,
    weekendHoldingAllowed: false,
    eaAllowed: true,
    consistencyRulePct: 40,
    description: "One of the largest prop firms. 10% profit target, 5% daily loss, 10% max drawdown. No weekend holding for swing accounts.",
  },
  fundednext: {
    name: "FundedNext",
    maxDailyLossPct: 5,
    maxOverallLossPct: 10,
    profitTargetPct: 10,
    trailingDrawdown: false,
    minTradingDays: 3,
    maxTradingDays: 30,
    newsTradingAllowed: true,
    weekendHoldingAllowed: true,
    eaAllowed: true,
    consistencyRulePct: 40,
    description: "Popular prop firm with stellar track record. 10% target, 5% daily, 10% max DD. Weekend holding allowed on stellar accounts.",
  },
  myfundedfx: {
    name: "MyFundedFX",
    maxDailyLossPct: 5,
    maxOverallLossPct: 10,
    profitTargetPct: 8,
    trailingDrawdown: false,
    minTradingDays: 0,
    maxTradingDays: 30,
    newsTradingAllowed: true,
    weekendHoldingAllowed: true,
    eaAllowed: true,
    description: "8% profit target, 5% daily loss, 10% max drawdown. No minimum trading days.",
  },
  the5ers: {
    name: "The5ers",
    maxDailyLossPct: 5,
    maxOverallLossPct: 5,
    profitTargetPct: 6,
    trailingDrawdown: true,
    minTradingDays: 0,
    newsTradingAllowed: true,
    weekendHoldingAllowed: true,
    eaAllowed: true,
    description: "Instant funding model. 6% target, 5% daily, trailing 5% max DD. Lower target but trailing drawdown makes it harder.",
  },
  propfirm: {
    name: "Custom Prop Firm",
    maxDailyLossPct: 5,
    maxOverallLossPct: 10,
    profitTargetPct: 8,
    trailingDrawdown: false,
    minTradingDays: 0,
    newsTradingAllowed: true,
    weekendHoldingAllowed: true,
    eaAllowed: true,
    description: "Generic prop firm rules. Customize the limits below.",
  },
};

export const PROP_FIRM_LIST = [
  { code: "ftmo", name: "FTMO", icon: "Award", color: "#00b8a3" },
  { code: "fundednext", name: "FundedNext", icon: "Rocket", color: "#5b2c9d" },
  { code: "myfundedfx", name: "MyFundedFX", icon: "TrendingUp", color: "#ff6b35" },
  { code: "the5ers", name: "The5ers", icon: "Shield", color: "#2196f3" },
  { code: "propfirm", name: "Custom Prop Firm", icon: "Building2", color: "#607d8b" },
] as const;

export type AuthMethod = "oauth" | "api_token" | "bridge";

// ============ INTEGRATION CAPABILITY REGISTRY (Part 2.4) ============

export interface IntegrationCapability {
  providerDiscovery: boolean;
  providerStatistics: boolean;
  historicalTrades: boolean;
  liveTradeEvents: boolean;
  openPositions: boolean;
  stopLossInfo: boolean;
  takeProfitInfo: boolean;
  partialClosures: boolean;
  tradeExecution: boolean;
  positionModification: boolean;
  positionClosure: boolean;
  accountEquity: boolean;
  accountBalance: boolean;
  streamingMode: "real_time" | "near_real_time" | "periodic" | "historical_only" | "unavailable";
  notes?: string;
}

export const PLATFORM_CAPABILITIES: Record<PlatformCode, IntegrationCapability> = {
  deriv: {
    providerDiscovery: false,
    providerStatistics: false,
    historicalTrades: false,
    liveTradeEvents: false,
    openPositions: true,
    stopLossInfo: false,
    takeProfitInfo: false,
    partialClosures: false,
    tradeExecution: true,
    positionModification: false,
    positionClosure: true,
    accountEquity: true,
    accountBalance: true,
    streamingMode: "periodic",
    notes: "OAuth, balance, and Options monitoring are implemented. Execution is limited to matched Deriv-to-Deriv standard CALL/PUT contracts with known expiry; no cross-broker FX lot mapping or partial closes.",
  },
  ctrader: {
    providerDiscovery: false,
    providerStatistics: false,
    historicalTrades: false,
    liveTradeEvents: false,
    openPositions: true,
    stopLossInfo: true,
    takeProfitInfo: true,
    partialClosures: true,
    tradeExecution: true,
    positionModification: true,
    positionClosure: true,
    accountEquity: true,
    accountBalance: true,
    streamingMode: "periodic",
    notes: "OAuth/Open API account data and market order, close, and protection operations are implemented but require broker demo validation before live use",
  },
  deriv_ctrader: {
    providerDiscovery: false,
    providerStatistics: false,
    historicalTrades: false,
    liveTradeEvents: false,
    openPositions: false,
    stopLossInfo: false,
    takeProfitInfo: false,
    partialClosures: false,
    tradeExecution: false,
    positionModification: false,
    positionClosure: false,
    accountEquity: false,
    accountBalance: false,
    streamingMode: "unavailable",
    notes: "No production connector configured",
  },
  ctrader_copy: {
    providerDiscovery: true,
    providerStatistics: true,
    historicalTrades: true,
    liveTradeEvents: true,
    openPositions: true,
    stopLossInfo: true,
    takeProfitInfo: true,
    partialClosures: true,
    tradeExecution: false,
    positionModification: false,
    positionClosure: false,
    accountEquity: true,
    accountBalance: true,
    streamingMode: "near_real_time",
    notes: "cTrader Copy - read-only monitoring",
  },
  mt4: {
    providerDiscovery: false,
    providerStatistics: true,
    historicalTrades: false,
    liveTradeEvents: true,
    openPositions: true,
    stopLossInfo: true,
    takeProfitInfo: true,
    partialClosures: true,
    tradeExecution: true,
    positionModification: true,
    positionClosure: true,
    accountEquity: true,
    accountBalance: true,
    streamingMode: "near_real_time",
    notes: "MT4 terminal bridge; snapshots and command acknowledgements poll from the user's terminal",
  },
  mt5: {
    providerDiscovery: false,
    providerStatistics: true,
    historicalTrades: false,
    liveTradeEvents: true,
    openPositions: true,
    stopLossInfo: true,
    takeProfitInfo: true,
    partialClosures: true,
    tradeExecution: true,
    positionModification: true,
    positionClosure: true,
    accountEquity: true,
    accountBalance: true,
    streamingMode: "near_real_time",
    notes: "MT5 terminal bridge; snapshots and command acknowledgements poll from the user's terminal",
  },
  fxcm: {
    providerDiscovery: false,
    providerStatistics: false,
    historicalTrades: false,
    liveTradeEvents: false,
    openPositions: false,
    stopLossInfo: false,
    takeProfitInfo: false,
    partialClosures: false,
    tradeExecution: false,
    positionModification: false,
    positionClosure: false,
    accountEquity: false,
    accountBalance: false,
    streamingMode: "unavailable",
    notes: "FXCM FCLite/API authorization is not connected to the trade engine yet",
  },
  external: {
    providerDiscovery: false,
    providerStatistics: false,
    historicalTrades: false,
    liveTradeEvents: false,
    openPositions: false,
    stopLossInfo: false,
    takeProfitInfo: false,
    partialClosures: false,
    tradeExecution: false,
    positionModification: false,
    positionClosure: false,
    accountEquity: false,
    accountBalance: false,
    streamingMode: "unavailable",
    notes: "Custom integration required",
  },
};

// ============ DATA QUALITY (Part 4.5) ============

export type DataQuality =
  | "verified"
  | "platform_reported"
  | "calculated"
  | "estimated"
  | "incomplete"
  | "unavailable"
  | "delayed";

export const DATA_QUALITY_LABELS: Record<DataQuality, string> = {
  verified: "Verified",
  platform_reported: "Platform-reported",
  calculated: "Calculated from history",
  estimated: "Estimated",
  incomplete: "Incomplete",
  unavailable: "Unavailable",
  delayed: "Delayed",
};

// ============ PROVIDER RECOMMENDATION CATEGORIES (Part 5.1) ============

export type RecommendationCategory =
  | "best_risk_adjusted"
  | "most_consistent"
  | "lowest_drawdown"
  | "highest_verified_return"
  | "best_long_term"
  | "best_recovery"
  | "high_risk"
  | "insufficient_history"
  | "deteriorating";

export const RECOMMENDATION_CATEGORIES: { value: RecommendationCategory; label: string; description: string }[] = [
  { value: "best_risk_adjusted", label: "Best overall risk-adjusted", description: "Highest combined score of return vs drawdown" },
  { value: "most_consistent", label: "Most consistent", description: "Stable month-to-month returns" },
  { value: "lowest_drawdown", label: "Lowest drawdown", description: "Smallest historical peak-to-trough" },
  { value: "highest_verified_return", label: "Highest verified returns", description: "Top returns with verified data" },
  { value: "best_long_term", label: "Best long-term", description: "Strongest multi-year track record" },
  { value: "best_recovery", label: "Best recovery", description: "Fastest drawdown recovery" },
  { value: "high_risk", label: "High-risk providers", description: "High return / high drawdown" },
  { value: "insufficient_history", label: "Insufficient history", description: "Too little data to evaluate" },
  { value: "deteriorating", label: "Deteriorating performance", description: "Recent decline in metrics" },
];

// ============ PROVIDER HEALTH (Part 14) ============

export type ProviderHealth =
  | "healthy"
  | "under_observation"
  | "deteriorating"
  | "high_risk"
  | "paused"
  | "inactive"
  | "data_unavailable";

export const PROVIDER_HEALTH_LABELS: Record<ProviderHealth, string> = {
  healthy: "Healthy",
  under_observation: "Under observation",
  deteriorating: "Deteriorating",
  high_risk: "High risk",
  paused: "Paused",
  inactive: "Inactive",
  data_unavailable: "Data unavailable",
};

// ============ TRADE EVENT TYPES ============

export type TradeEventType =
  | "open"
  | "modify"
  | "partial_close"
  | "close"
  | "cancel"
  | "reverse";

export type SourceMonitoringMethod =
  | "real_time"
  | "near_real_time"
  | "periodic"
  | "historical_only"
  | "unavailable";

export const MONITORING_METHOD_LABELS: Record<SourceMonitoringMethod, string> = {
  real_time: "Real-time",
  near_real_time: "Near real-time",
  periodic: "Periodically synchronized",
  historical_only: "Historical only",
  unavailable: "Unavailable",
};

// ============ REPLICATION (Part 9) ============

export type ExecutionMode = "auto" | "approval" | "notify_only";

export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  auto: "Fully automatic",
  approval: "Approval required",
  notify_only: "Notification only",
};

export type SizingMode =
  | "equity_ratio"
  | "fixed_multiplier"
  | "fixed_lot"
  | "risk_based";

export const SIZING_MODE_LABELS: Record<SizingMode, string> = {
  equity_ratio: "Equity ratio",
  fixed_multiplier: "Fixed multiplier",
  fixed_lot: "Fixed lot",
  risk_based: "Risk-based volume",
};

export type ReplicationStatus =
  | "active"
  | "paused"
  | "stopped"
  | "error";

export type PositionState =
  | "open"
  | "closed"
  | "partial"
  | "rejected"
  | "cancelled";

// ============ RISK (Part 12) ============

export type RiskScope = "provider" | "account" | "portfolio";

// ============ NOTIFICATIONS (Part 15) ============

export type NotificationType =
  | "trade_opened"
  | "trade_closed"
  | "trade_modified"
  | "partial_closure"
  | "replication_success"
  | "replication_failed"
  | "broker_disconnect"
  | "provider_drawdown"
  | "risk_breach"
  | "provider_status_change"
  | "reconnect"
  | "emergency_stop";

export type NotificationChannel = "in_app" | "push" | "email" | "telegram";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

// ============ TRADE DIRECTION ============

export type TradeDirection = "BUY" | "SELL";

// ============ ROUTED WEBSITE VIEWS ============

export type AppView =
  | "dashboard"
  | "discover"
  | "analytics"
  | "comparison"
  | "portfolio"
  | "live_monitor"
  | "automated_trading"
  | "trade_history"
  | "backtesting"
  | "risk_management"
  | "broker_connections"
  | "notifications"
  | "settings"
  | "admin"
  | "watchlists"
  | "instrument_mapping";

export interface NavItem {
  id: AppView;
  label: string;
  icon: string;
  description: string;
  primary?: boolean; // shown directly in top bar; others go in "More" dropdown
}

export const NAV_ITEMS: NavItem[] = [
  // Primary - shown directly in the top bar
  { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard", description: "Portfolio overview", primary: true },
  { id: "discover", label: "Discover", icon: "Compass", description: "Find signal providers", primary: true },
  { id: "live_monitor", label: "Live", icon: "Activity", description: "Real-time trade events", primary: true },
  { id: "portfolio", label: "Portfolio", icon: "Briefcase", description: "Allocations & positions", primary: true },
  { id: "automated_trading", label: "Replication", icon: "Bot", description: "Automated trading configs", primary: true },
  { id: "risk_management", label: "Risk", icon: "ShieldAlert", description: "Limits & emergency controls", primary: true },

  // Secondary - accessible via "More" dropdown
  { id: "analytics", label: "Analytics", icon: "BarChart3", description: "Provider performance & drawdown" },
  { id: "comparison", label: "Compare", icon: "GitCompare", description: "Side-by-side providers" },
  { id: "backtesting", label: "Backtest", icon: "FlaskConical", description: "Simulate providers" },
  { id: "trade_history", label: "History", icon: "History", description: "Full trade ledger" },
  { id: "broker_connections", label: "Brokers", icon: "Link2", description: "Connect destination accounts" },
  { id: "notifications", label: "Alerts", icon: "Bell", description: "Alerts & preferences" },
  { id: "watchlists", label: "Watchlists", icon: "Star", description: "Track providers without copying", primary: false },
  { id: "instrument_mapping", label: "Instruments", icon: "ArrowLeftRight", description: "Map instruments across brokers", primary: false },
  { id: "settings", label: "Settings", icon: "Settings", description: "Account & preferences" },
  { id: "admin", label: "Admin", icon: "ShieldCheck", description: "System health & integrations" },
];
