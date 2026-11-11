// TRADE LINK — Provider Analytics Engine (Part 4)
// Pure functions for performance, drawdown, behaviour, and risk analytics.
// All functions are deterministic and testable.

import type { ProviderTrade } from "@prisma/client";
import type { DataQuality } from "@/lib/types";

// ============================================================
// PERFORMANCE ANALYTICS (Part 4.1)
// ============================================================

export interface PerformanceMetrics {
  totalReturnPct: number | null;
  dailyReturnPct: number | null;
  weeklyReturnPct: number | null;
  monthlyReturnPct: number | null;
  quarterlyReturnPct: number | null;
  yearlyReturnPct: number | null;
  lifetimeReturnPct: number | null;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  totalWinningTrades: number;
  totalLosingTrades: number;
  totalClosedTrades: number;
  winRate: number | null;
  lossRate: number | null;
  avgWinningTrade: number | null;
  avgLosingTrade: number | null;
  largestWinningTrade: number | null;
  largestLosingTrade: number | null;
  profitFactor: number | null;
  avgProfitPerTrade: number | null;
  expectedValuePerTrade: number | null;
  dataQuality: DataQuality;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export function computePerformance(
  trades: ProviderTrade[],
  startingBalance: number | null,
): PerformanceMetrics {
  const closed = trades
    .filter((t) => t.closeTime !== null && t.netProfit !== null)
    .sort((a, b) => (a.closeTime!.getTime() - b.closeTime!.getTime()));

  if (closed.length === 0) {
    return emptyPerformance();
  }

  const winners = closed.filter((t) => (t.netProfit ?? 0) > 0);
  const losers = closed.filter((t) => (t.netProfit ?? 0) < 0);

  const grossProfit = winners.reduce((s, t) => s + (t.netProfit ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.netProfit ?? 0), 0));
  const netProfit = grossProfit - grossLoss;

  const totalWinningTrades = winners.length;
  const totalLosingTrades = losers.length;
  const totalClosedTrades = closed.length;
  const winRate = totalClosedTrades > 0 ? totalWinningTrades / totalClosedTrades : null;
  const lossRate = totalClosedTrades > 0 ? totalLosingTrades / totalClosedTrades : null;

  const avgWinningTrade = totalWinningTrades > 0 ? grossProfit / totalWinningTrades : null;
  const avgLosingTrade = totalLosingTrades > 0 ? grossLoss / totalLosingTrades : null;
  const largestWinningTrade = winners.length > 0 ? Math.max(...winners.map((t) => t.netProfit ?? 0)) : null;
  const largestLosingTrade = losers.length > 0 ? Math.min(...losers.map((t) => t.netProfit ?? 0)) : null;

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const avgProfitPerTrade = netProfit / totalClosedTrades;

  const expectedValuePerTrade =
    winRate !== null && avgWinningTrade !== null && lossRate !== null && avgLosingTrade !== null
      ? winRate * avgWinningTrade - lossRate * avgLosingTrade
      : null;

  const periodStart = closed[0].closeTime!;
  const periodEnd = closed[closed.length - 1].closeTime!;
  const days = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));

  let totalReturnPct: number | null = null;
  let dailyReturnPct: number | null = null;
  let weeklyReturnPct: number | null = null;
  let monthlyReturnPct: number | null = null;
  let quarterlyReturnPct: number | null = null;
  let yearlyReturnPct: number | null = null;
  let lifetimeReturnPct: number | null = null;

  if (startingBalance && startingBalance > 0) {
    totalReturnPct = (netProfit / startingBalance) * 100;
    lifetimeReturnPct = totalReturnPct;
    dailyReturnPct = totalReturnPct / days;
    weeklyReturnPct = totalReturnPct / (days / 7);
    monthlyReturnPct = totalReturnPct / (days / 30);
    quarterlyReturnPct = totalReturnPct / (days / 90);
    yearlyReturnPct = totalReturnPct / (days / 365);
  }

  return {
    totalReturnPct,
    dailyReturnPct,
    weeklyReturnPct,
    monthlyReturnPct,
    quarterlyReturnPct,
    yearlyReturnPct,
    lifetimeReturnPct,
    grossProfit,
    grossLoss,
    netProfit,
    totalWinningTrades,
    totalLosingTrades,
    totalClosedTrades,
    winRate: winRate !== null ? winRate * 100 : null,
    lossRate: lossRate !== null ? lossRate * 100 : null,
    avgWinningTrade,
    avgLosingTrade,
    largestWinningTrade,
    largestLosingTrade,
    profitFactor: profitFactor === Infinity ? null : profitFactor,
    avgProfitPerTrade,
    expectedValuePerTrade,
    dataQuality: "calculated",
    periodStart,
    periodEnd,
  };
}

function emptyPerformance(): PerformanceMetrics {
  return {
    totalReturnPct: null,
    dailyReturnPct: null,
    weeklyReturnPct: null,
    monthlyReturnPct: null,
    quarterlyReturnPct: null,
    yearlyReturnPct: null,
    lifetimeReturnPct: null,
    grossProfit: 0,
    grossLoss: 0,
    netProfit: 0,
    totalWinningTrades: 0,
    totalLosingTrades: 0,
    totalClosedTrades: 0,
    winRate: null,
    lossRate: null,
    avgWinningTrade: null,
    avgLosingTrade: null,
    largestWinningTrade: null,
    largestLosingTrade: null,
    profitFactor: null,
    avgProfitPerTrade: null,
    expectedValuePerTrade: null,
    dataQuality: "incomplete",
    periodStart: null,
    periodEnd: null,
  };
}

// ============================================================
// DRAWDOWN ANALYTICS (Part 4.2)
// ============================================================

export interface DrawdownMetrics {
  maxDrawdownPct: number | null;
  currentDrawdownPct: number | null;
  balanceDrawdown: number;
  equityDrawdown: number;
  maxDrawdownMonetary: number;
  avgDrawdownPct: number | null;
  longestDrawdownDays: number | null;
  avgRecoveryDays: number | null;
  maxRecoveryDays: number | null;
  recoveryFactor: number | null;
  largestLosingStreak: number;
  drawdownSeries: { time: string; drawdownPct: number }[];
  equityCurve: { time: string; equity: number }[];
  dataQuality: DataQuality;
}

export function computeDrawdown(
  trades: ProviderTrade[],
  startingBalance: number,
): DrawdownMetrics {
  const closed = trades
    .filter((t) => t.closeTime !== null && t.netProfit !== null)
    .sort((a, b) => (a.closeTime!.getTime() - b.closeTime!.getTime()));

  if (closed.length === 0) {
    return {
      maxDrawdownPct: null,
      currentDrawdownPct: null,
      balanceDrawdown: 0,
      equityDrawdown: 0,
      maxDrawdownMonetary: 0,
      avgDrawdownPct: null,
      longestDrawdownDays: null,
      avgRecoveryDays: null,
      maxRecoveryDays: null,
      recoveryFactor: null,
      largestLosingStreak: 0,
      drawdownSeries: [],
      equityCurve: [],
      dataQuality: "incomplete",
    };
  }

  let runningBalance = startingBalance;
  const equityCurve: { time: string; equity: number }[] = [
    { time: closed[0].openTime.toISOString(), equity: startingBalance },
  ];
  for (const t of closed) {
    runningBalance += t.netProfit ?? 0;
    equityCurve.push({
      time: t.closeTime!.toISOString(),
      equity: runningBalance,
    });
  }

  let peak = startingBalance;
  let maxDrawdownMonetary = 0;
  let maxDrawdownPct = 0;
  let drawdownStart: Date | null = null;
  let longestDrawdownDays = 0;
  let totalRecoveryDays = 0;
  let recoveryCount = 0;
  const drawdownSeries: { time: string; drawdownPct: number }[] = [];

  for (const point of equityCurve) {
    if (point.equity >= peak) {
      if (drawdownStart) {
        const recoveryDays = (new Date(point.time).getTime() - drawdownStart.getTime()) / (1000 * 60 * 60 * 24);
        totalRecoveryDays += recoveryDays;
        recoveryCount += 1;
        longestDrawdownDays = Math.max(longestDrawdownDays, recoveryDays);
        drawdownStart = null;
      }
      peak = point.equity;
    } else {
      if (!drawdownStart) drawdownStart = new Date(point.time);
      const dd = peak - point.equity;
      const ddPct = (dd / peak) * 100;
      maxDrawdownMonetary = Math.max(maxDrawdownMonetary, dd);
      maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
      drawdownSeries.push({ time: point.time, drawdownPct: ddPct });
    }
  }

  const lastEquity = equityCurve[equityCurve.length - 1].equity;
  const currentDrawdownPct = lastEquity < peak ? ((peak - lastEquity) / peak) * 100 : 0;

  let largestLosingStreak = 0;
  let currentStreak = 0;
  for (const t of closed) {
    if ((t.netProfit ?? 0) < 0) {
      currentStreak += 1;
      largestLosingStreak = Math.max(largestLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const avgDrawdownPct =
    drawdownSeries.length > 0
      ? drawdownSeries.reduce((s, d) => s + d.drawdownPct, 0) / drawdownSeries.length
      : null;

  const netProfit = closed.reduce((s, t) => s + (t.netProfit ?? 0), 0);
  const recoveryFactor = maxDrawdownMonetary > 0 ? netProfit / maxDrawdownMonetary : null;

  return {
    maxDrawdownPct,
    currentDrawdownPct,
    balanceDrawdown: maxDrawdownMonetary,
    equityDrawdown: maxDrawdownMonetary,
    maxDrawdownMonetary,
    avgDrawdownPct,
    longestDrawdownDays,
    avgRecoveryDays: recoveryCount > 0 ? totalRecoveryDays / recoveryCount : null,
    maxRecoveryDays: longestDrawdownDays,
    recoveryFactor,
    largestLosingStreak,
    drawdownSeries,
    equityCurve,
    dataQuality: "calculated",
  };
}

// ============================================================
// BEHAVIOUR ANALYTICS (Part 4.3)
// ============================================================

export interface BehaviourMetrics {
  avgTradesPerDay: number;
  tradesPerWeek: number;
  avgHoldingHours: number;
  longestHoldingHours: number;
  shortestHoldingHours: number;
  avgVolume: number;
  largestVolume: number;
  maxSimultaneousPositions: number;
  buySellRatio: number;
  avgTimeBetweenTradesHours: number;
  instruments: Record<string, number>;
  sessions: Record<string, number>;
}

export function computeBehaviour(trades: ProviderTrade[]): BehaviourMetrics {
  if (trades.length === 0) {
    return {
      avgTradesPerDay: 0,
      tradesPerWeek: 0,
      avgHoldingHours: 0,
      longestHoldingHours: 0,
      shortestHoldingHours: 0,
      avgVolume: 0,
      largestVolume: 0,
      maxSimultaneousPositions: 0,
      buySellRatio: 1,
      avgTimeBetweenTradesHours: 0,
      instruments: {},
      sessions: {},
    };
  }

  const sorted = [...trades].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const first = sorted[0].openTime;
  const last = sorted[sorted.length - 1].openTime;
  const totalDays = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  const avgTradesPerDay = sorted.length / totalDays;
  const tradesPerWeek = avgTradesPerDay * 7;

  const holdingTimes = sorted
    .filter((t) => t.closeTime)
    .map((t) => (t.closeTime!.getTime() - t.openTime.getTime()) / (1000 * 60 * 60));
  const avgHoldingHours = holdingTimes.length > 0 ? holdingTimes.reduce((s, h) => s + h, 0) / holdingTimes.length : 0;
  const longestHoldingHours = holdingTimes.length > 0 ? Math.max(...holdingTimes) : 0;
  const shortestHoldingHours = holdingTimes.length > 0 ? Math.min(...holdingTimes) : 0;

  const volumes = sorted.map((t) => t.volume);
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  const largestVolume = Math.max(...volumes);

  const events: { time: number; delta: number }[] = [];
  for (const t of sorted) {
    events.push({ time: t.openTime.getTime(), delta: 1 });
    if (t.closeTime) events.push({ time: t.closeTime.getTime(), delta: -1 });
  }
  events.sort((a, b) => a.time - b.time);
  let current = 0;
  let maxSimultaneous = 0;
  for (const e of events) {
    current += e.delta;
    maxSimultaneous = Math.max(maxSimultaneous, current);
  }

  const buys = sorted.filter((t) => t.direction === "BUY").length;
  const sells = sorted.filter((t) => t.direction === "SELL").length;
  const buySellRatio = sells > 0 ? buys / sells : buys;

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].openTime.getTime() - sorted[i - 1].openTime.getTime()) / (1000 * 60 * 60));
  }
  const avgTimeBetweenTradesHours = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;

  const instruments: Record<string, number> = {};
  for (const t of sorted) {
    instruments[t.instrument] = (instruments[t.instrument] ?? 0) + 1;
  }

  const sessions: Record<string, number> = { asia: 0, london: 0, new_york: 0, off_hours: 0 };
  for (const t of sorted) {
    const h = t.openTime.getUTCHours();
    if (h >= 0 && h < 8) sessions.asia += 1;
    else if (h >= 8 && h < 13) sessions.london += 1;
    else if (h >= 13 && h < 21) sessions.new_york += 1;
    else sessions.off_hours += 1;
  }

  return {
    avgTradesPerDay,
    tradesPerWeek,
    avgHoldingHours,
    longestHoldingHours,
    shortestHoldingHours,
    avgVolume,
    largestVolume,
    maxSimultaneousPositions: maxSimultaneous,
    buySellRatio,
    avgTimeBetweenTradesHours,
    instruments,
    sessions,
  };
}

// ============================================================
// RISK ANALYTICS (Part 4.4)
// ============================================================

export interface RiskMetrics {
  avgLosingTrade: number;
  largestLosingTrade: number;
  avgRiskReward: number | null;
  riskConcentration: number;
  positionConcentration: number;
  avgLosingStreak: number;
  avgWinningStreak: number;
  instrumentExposure: Record<string, number>;
}

export function computeRiskMetrics(trades: ProviderTrade[]): RiskMetrics {
  if (trades.length === 0) {
    return {
      avgLosingTrade: 0,
      largestLosingTrade: 0,
      avgRiskReward: null,
      riskConcentration: 0,
      positionConcentration: 0,
      avgLosingStreak: 0,
      avgWinningStreak: 0,
      instrumentExposure: {},
    };
  }

  const losers = trades.filter((t) => (t.netProfit ?? 0) < 0);
  const winners = trades.filter((t) => (t.netProfit ?? 0) > 0);
  const avgLosingTrade = losers.length > 0 ? losers.reduce((s, t) => s + Math.abs(t.netProfit ?? 0), 0) / losers.length : 0;
  const largestLosingTrade = losers.length > 0 ? Math.max(...losers.map((t) => Math.abs(t.netProfit ?? 0))) : 0;

  const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + (t.netProfit ?? 0), 0) / winners.length : 0;
  const avgLoss = avgLosingTrade;
  const avgRiskReward = avgLoss > 0 ? avgWin / avgLoss : null;

  const instrumentExposure: Record<string, number> = {};
  for (const t of trades) {
    instrumentExposure[t.instrument] = (instrumentExposure[t.instrument] ?? 0) + 1;
  }
  const maxInstrumentShare = Math.max(...Object.values(instrumentExposure)) / trades.length;
  const riskConcentration = maxInstrumentShare;

  const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
  const maxVolume = Math.max(...trades.map((t) => t.volume));
  const positionConcentration = totalVolume > 0 ? maxVolume / totalVolume : 0;

  const sorted = [...trades].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const streaks = { win: [] as number[], loss: [] as number[] };
  let current = sorted[0]?.netProfit && sorted[0].netProfit > 0 ? "win" : "loss";
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i].netProfit ?? 0;
    const sign = p > 0 ? "win" : p < 0 ? "loss" : null;
    if (sign === null) continue;
    if (sign === current) {
      count += 1;
    } else {
      streaks[current as "win" | "loss"].push(count);
      current = sign;
      count = 1;
    }
  }
  streaks[current as "win" | "loss"].push(count);
  const avgWinningStreak = streaks.win.length > 0 ? streaks.win.reduce((s, n) => s + n, 0) / streaks.win.length : 0;
  const avgLosingStreak = streaks.loss.length > 0 ? streaks.loss.reduce((s, n) => s + n, 0) / streaks.loss.length : 0;

  return {
    avgLosingTrade,
    largestLosingTrade,
    avgRiskReward,
    riskConcentration,
    positionConcentration,
    avgLosingStreak,
    avgWinningStreak,
    instrumentExposure,
  };
}

// ============================================================
// MONTHLY PERFORMANCE BREAKDOWN
// ============================================================

export function computeMonthlyPerformance(trades: ProviderTrade[]): { month: string; netProfit: number; trades: number }[] {
  const byMonth: Record<string, { netProfit: number; trades: number }> = {};
  for (const t of trades) {
    if (!t.closeTime || t.netProfit === null) continue;
    const key = `${t.closeTime.getUTCFullYear()}-${String(t.closeTime.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { netProfit: 0, trades: 0 };
    byMonth[key].netProfit += t.netProfit;
    byMonth[key].trades += 1;
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}
