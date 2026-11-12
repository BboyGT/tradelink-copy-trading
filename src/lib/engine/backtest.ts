// TRADE LINK - Backtesting / Simulation Engine (Part 6)
// Simulates a provider's historical trades against a destination account config.
// IMPORTANT: never label results as actual - these are always hypothetical.

import type { ProviderTrade } from "@prisma/client";
import { computeSizing } from "@/lib/engine/sizing";
import type { SizingMode } from "@/lib/types";

/**
 * Tick value lookup used by the backtest simulator.
 *
 * Backtests don't have a live broker connector, so we approximate tick value
 * per instrument class. In production this would come from the destination
 * broker's instrument spec (Part 2.4).
 */
export function getTickValue(instrument: string): number {
  const sym = instrument.toUpperCase();
  // Metals / major FX - 1 pip == 1 unit of account per lot
  if (sym === "XAUUSD" || sym === "GOLD" || sym === "EURUSD" || sym === "GBPUSD") {
    return 1;
  }
  // Crypto - smaller tick value (price quoted to 2 decimals)
  if (sym === "BTCUSD" || sym === "ETHUSD") {
    return 0.01;
  }
  // Deriv synthetic indices - 0.1 per tick per lot
  if (sym.startsWith("VOLATILITY") || sym.startsWith("BOOM") || sym.startsWith("CRASH")) {
    return 0.1;
  }
  // Sensible default for unknown instruments
  return 1;
}

export interface SimulationConfig {
  startingBalance: number;
  startingEquity?: number;
  destinationCurrency?: string;
  sizingMode: SizingMode;
  equityMultiplier?: number;
  fixedLotSize?: number;
  riskPerTradePct?: number;
  maxLotSize?: number;
  minLotSize?: number;
  // Trading costs
  estimatedSpreadPips?: number;
  commissionPerLot?: number;
  swapPerLotPerDay?: number;
  slippagePips?: number;
  // Risk limits
  maxDrawdownPct?: number;
  maxLossPerTrade?: number;
}

export interface SimulationResult {
  finalBalance: number;
  finalEquity: number;
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  totalTrades: number;
  executedTrades: number;
  missedTrades: number;
  winRate: number;
  profitFactor: number | null;
  maxDrawdownPct: number;
  recoveryFactor: number | null;
  largestLoss: number;
  losingStreaks: { max: number; avg: number };
  monthlyPerformance: { month: string; netProfit: number; trades: number }[];
  equityCurve: { time: string; equity: number }[];
  warnings: string[];
  isHypothetical: true; // ALWAYS true
}

export function runSimulation(
  sourceTrades: ProviderTrade[],
  sourceEquity: number,
  config: SimulationConfig,
): SimulationResult {
  const warnings: string[] = [];
  let balance = config.startingBalance;
  let equity = config.startingEquity ?? config.startingBalance;
  const startingBalance = config.startingBalance;
  const equityCurve: { time: string; equity: number }[] = [
    { time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), equity: balance },
  ];

  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let executed = 0;
  let missed = 0;
  let largestLoss = 0;
  let maxDrawdown = 0;
  let peak = balance;
  const streaks: number[] = [];
  let currentStreak = 0;
  const monthly: Record<string, { netProfit: number; trades: number }> = {};

  const sorted = [...sourceTrades]
    .filter((t) => t.closeTime !== null)
    .sort((a, b) => a.closeTime!.getTime() - b.closeTime!.getTime());

  for (const t of sorted) {
    // Compute destination volume
    const sizing = computeSizing({
      mode: config.sizingMode,
      sourceEquity,
      destinationEquity: equity,
      equityMultiplier: config.equityMultiplier ?? 1,
      referenceBase: "equity",
      sourceVolume: t.volume,
      fixedLotSize: config.fixedLotSize,
      riskPerTradePct: config.riskPerTradePct,
      stopLossDistance: t.stopLoss !== null ? Math.abs(t.entryPrice - t.stopLoss) : undefined,
      tickValue: getTickValue(t.instrument),
      minVolume: config.minLotSize ?? 0.01,
      maxVolume: config.maxLotSize ?? 100,
      volumeStep: 0.01,
      rounding: "down", // never larger than intended (Part 8.3)
    });

    if (sizing.finalVolume <= 0) {
      missed += 1;
      continue;
    }

    // Check max loss per trade
    if (config.maxLossPerTrade && sizing.finalVolume * (t.netProfit ?? 0) / t.volume < -config.maxLossPerTrade) {
      missed += 1;
      continue;
    }

    // Apply proportionate P/L (with costs)
    const volumeRatio = sizing.finalVolume / t.volume;
    const baseProfit = (t.netProfit ?? 0) * volumeRatio;
    const spreadCost = (config.estimatedSpreadPips ?? 0) * sizing.finalVolume * 10;
    const commissionCost = (config.commissionPerLot ?? 0) * sizing.finalVolume;
    const slippageCost = (config.slippagePips ?? 0) * sizing.finalVolume * 10;
    const swapCost = config.swapPerLotPerDay && t.closeTime
      ? config.swapPerLotPerDay * sizing.finalVolume *
        ((t.closeTime.getTime() - t.openTime.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const netProfitForTrade = baseProfit - spreadCost - commissionCost - slippageCost - swapCost;
    balance += netProfitForTrade;
    equity = balance;
    executed += 1;

    if (netProfitForTrade > 0) {
      grossProfit += netProfitForTrade;
      wins += 1;
      if (currentStreak < 0) {
        streaks.push(currentStreak);
        currentStreak = 1;
      } else {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      }
    } else if (netProfitForTrade < 0) {
      grossLoss += Math.abs(netProfitForTrade);
      losses += 1;
      largestLoss = Math.min(largestLoss, netProfitForTrade);
      if (currentStreak > 0) {
        streaks.push(currentStreak);
        currentStreak = -1;
      } else {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      }
    }

    // Update peak / drawdown
    if (equity > peak) peak = equity;
    const ddPct = ((peak - equity) / peak) * 100;
    if (ddPct > maxDrawdown) maxDrawdown = ddPct;

    // Monthly breakdown
    if (t.closeTime) {
      const key = `${t.closeTime.getUTCFullYear()}-${String(t.closeTime.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { netProfit: 0, trades: 0 };
      monthly[key].netProfit += netProfitForTrade;
      monthly[key].trades += 1;
    }

    equityCurve.push({
      time: t.closeTime!.toISOString(),
      equity,
    });

    // Stop simulation if max drawdown breached
    if (config.maxDrawdownPct && maxDrawdown >= config.maxDrawdownPct) {
      warnings.push(`Simulation stopped at trade #${executed}: max drawdown (${maxDrawdown.toFixed(1)}%) exceeded configured limit (${config.maxDrawdownPct}%).`);
      break;
    }
  }

  if (currentStreak !== 0) streaks.push(currentStreak);
  const lossStreaks = streaks.filter((s) => s < 0).map((s) => Math.abs(s));
  const maxLossStreak = lossStreaks.length > 0 ? Math.max(...lossStreaks) : 0;
  const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((s, n) => s + n, 0) / lossStreaks.length : 0;

  const netProfit = balance - startingBalance;
  const winRate = executed > 0 ? (wins / executed) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0);
  const recoveryFactor = maxDrawdown > 0 ? netProfit / (startingBalance * maxDrawdown / 100) : null;

  const monthlyPerformance = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  if (executed < sorted.length) {
    warnings.push(`${missed} of ${sorted.length} source trades could not be replicated (volume below broker minimum or risk limit).`);
  }
  warnings.push("Results are hypothetical. Slippage, spreads, and execution differences may differ from live conditions.");

  return {
    finalBalance: balance,
    finalEquity: equity,
    netProfit,
    grossProfit,
    grossLoss,
    totalTrades: sorted.length,
    executedTrades: executed,
    missedTrades: missed,
    winRate,
    profitFactor,
    maxDrawdownPct: maxDrawdown,
    recoveryFactor,
    largestLoss,
    losingStreaks: { max: maxLossStreak, avg: avgLossStreak },
    monthlyPerformance,
    equityCurve,
    warnings,
    isHypothetical: true,
  };
}
