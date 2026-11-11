// TRADE LINK — Recommendation Engine (Part 5)
// Scores providers across multiple factors, with separate data-confidence scoring.
// Pure functions, deterministic.

import type { ProviderStatistic } from "@prisma/client";
import type { RecommendationCategory } from "@/lib/types";

export interface RecommendationScore {
  score: number; // 0..100 overall recommendation score
  confidence: number; // 0..1 data confidence
  category: RecommendationCategory;
  strengths: string[];
  weaknesses: string[];
  dataLimitations: string[];
  reasonSummary: string;
}

export interface ScoringWeights {
  profitability: number;
  maxDrawdown: number;
  currentDrawdown: number;
  profitFactor: number;
  consistency: number;
  historicalDuration: number;
  verifiedTrades: number;
  recoveryFactor: number;
  losingStreaks: number;
  positionSizeStability: number;
  riskConcentration: number;
  recentPerformance: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  profitability: 0.18,
  maxDrawdown: 0.15,
  currentDrawdown: 0.08,
  profitFactor: 0.12,
  consistency: 0.12,
  historicalDuration: 0.08,
  verifiedTrades: 0.05,
  recoveryFactor: 0.07,
  losingStreaks: 0.05,
  positionSizeStability: 0.03,
  riskConcentration: 0.04,
  recentPerformance: 0.03,
};

// Normalisers — convert raw metric to 0..1 contribution score
function norm(value: number | null, max: number, invert = false, min = 0): number {
  if (value === null) return 0;
  const v = Math.min(Math.max(value, min), max);
  const norm = (v - min) / (max - min);
  return invert ? 1 - norm : norm;
}

export function scoreProvider(
  stats: ProviderStatistic | null,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): RecommendationScore {
  if (!stats) {
    return {
      score: 0,
      confidence: 0,
      category: "insufficient_history",
      strengths: [],
      weaknesses: ["No statistics available"],
      dataLimitations: ["Provider has no calculated statistics"],
      reasonSummary: "Insufficient data to evaluate this provider.",
    };
  }

  // Confidence based on data quality and trade count
  const tradeCount = stats.totalClosedTrades ?? 0;
  let confidence = 0;
  if (stats.dataQuality === "verified") confidence = 0.95;
  else if (stats.dataQuality === "platform_reported") confidence = 0.75;
  else if (stats.dataQuality === "calculated") confidence = 0.60;
  else if (stats.dataQuality === "estimated") confidence = 0.40;
  else if (stats.dataQuality === "incomplete") confidence = 0.20;
  else confidence = 0.0;

  if (tradeCount < 30) confidence *= 0.4;
  else if (tradeCount < 100) confidence *= 0.7;
  else if (tradeCount < 300) confidence *= 0.9;
  confidence = Math.max(0, Math.min(1, confidence));

  // Score components (each 0..1)
  const sProfitability = norm(stats.lifetimeReturnPct, 200); // 0..200% maps to 0..1
  const sMaxDrawdown = norm(stats.maxDrawdownPct, 50, true); // lower DD = higher score
  const sCurrentDrawdown = norm(stats.currentDrawdownPct, 30, true);
  const sProfitFactor = stats.profitFactor !== null ? Math.min(stats.profitFactor / 3, 1) : 0;
  const sConsistency = stats.winRate !== null ? Math.min(stats.winRate / 70, 1) : 0.3;
  const sHistoricalDuration = norm(stats.longestDrawdownDays ?? 0, 365); // proxy
  const sVerifiedTrades = Math.min(tradeCount / 500, 1);
  const sRecoveryFactor = stats.recoveryFactor !== null ? Math.min(stats.recoveryFactor / 5, 1) : 0;
  const sLosingStreaks = norm(stats.largestLosingStreak ?? 0, 15, true);
  const sRiskConcentration = norm((stats.riskConcentration ?? 0) * 100, 80, true);
  const sRecentPerformance = norm(stats.monthlyReturnPct, 20);

  // Position size stability — measures how consistently the provider sizes positions.
  // Stability = 1 - (largestVolume - avgVolume) / largestVolume, clamped 0..1.
  // A provider whose largest trade equals its average is perfectly stable (1.0).
  let sPositionSizeStability = 0;
  if (stats.avgVolume !== null && stats.largestVolume !== null && stats.largestVolume > 0) {
    const spread = (stats.largestVolume - stats.avgVolume) / stats.largestVolume;
    sPositionSizeStability = Math.max(0, Math.min(1, 1 - spread));
  }

  const w = weights;
  const score =
    sProfitability * w.profitability +
    sMaxDrawdown * w.maxDrawdown +
    sCurrentDrawdown * w.currentDrawdown +
    sProfitFactor * w.profitFactor +
    sConsistency * w.consistency +
    sHistoricalDuration * w.historicalDuration +
    sVerifiedTrades * w.verifiedTrades +
    sRecoveryFactor * w.recoveryFactor +
    sLosingStreaks * w.losingStreaks +
    sPositionSizeStability * w.positionSizeStability +
    sRiskConcentration * w.riskConcentration +
    sRecentPerformance * w.recentPerformance;

  const finalScore = Math.round(score * 100);

  // Determine category
  let category: RecommendationCategory;
  if (tradeCount < 30) {
    category = "insufficient_history";
  } else if (sMaxDrawdown < 0.3 || (stats.maxDrawdownPct ?? 0) > 40) {
    category = "high_risk";
  } else if (sRecentPerformance < 0.3 && stats.monthlyReturnPct !== null && stats.monthlyReturnPct < 0) {
    category = "deteriorating";
  } else if (sRecoveryFactor >= 0.7) {
    category = "best_recovery";
  } else if (sHistoricalDuration >= 0.7) {
    category = "best_long_term";
  } else if (sMaxDrawdown >= 0.8) {
    category = "lowest_drawdown";
  } else if (sProfitFactor >= 0.8 && confidence >= 0.7) {
    category = "highest_verified_return";
  } else if (sConsistency >= 0.75) {
    category = "most_consistent";
  } else {
    category = "best_risk_adjusted";
  }

  // Strengths
  const strengths: string[] = [];
  if (sProfitFactor >= 0.7) strengths.push(`Strong profit factor (${stats.profitFactor?.toFixed(2)})`);
  if (sMaxDrawdown >= 0.7) strengths.push(`Low maximum drawdown (${stats.maxDrawdownPct?.toFixed(1)}%)`);
  if (sConsistency >= 0.7) strengths.push(`Consistent win rate (${stats.winRate?.toFixed(1)}%)`);
  if (sRecoveryFactor >= 0.7) strengths.push(`Excellent recovery factor (${stats.recoveryFactor?.toFixed(2)})`);
  if (sVerifiedTrades >= 0.7) strengths.push(`${tradeCount} verified historical trades`);
  if (sHistoricalDuration >= 0.7) strengths.push("Long verified track record");
  if (strengths.length === 0) strengths.push("Limited standout metrics");

  // Weaknesses
  const weaknesses: string[] = [];
  if (sMaxDrawdown < 0.4 && stats.maxDrawdownPct !== null) weaknesses.push(`High maximum drawdown (${stats.maxDrawdownPct.toFixed(1)}%)`);
  if (sLosingStreaks < 0.4 && stats.largestLosingStreak !== null) weaknesses.push(`Large losing streak (${stats.largestLosingStreak} trades)`);
  if (sRiskConcentration < 0.4) weaknesses.push("High instrument concentration");
  if (sRecentPerformance < 0.4 && stats.monthlyReturnPct !== null && stats.monthlyReturnPct < 0) weaknesses.push("Negative recent monthly return");
  if (sProfitFactor < 0.4 && stats.profitFactor !== null) weaknesses.push(`Weak profit factor (${stats.profitFactor.toFixed(2)})`);
  if (weaknesses.length === 0) weaknesses.push("No major weaknesses identified");

  // Data limitations
  const dataLimitations: string[] = [];
  if (confidence < 0.4) dataLimitations.push("Low data confidence — verify before relying");
  if (stats.dataQuality === "calculated") dataLimitations.push("Drawdown based on closed trades, not intra-trade equity");
  if (tradeCount < 100) dataLimitations.push(`Only ${tradeCount} historical trades`);
  if (dataLimitations.length === 0) dataLimitations.push("No significant data limitations");

  const reasonSummary = `Recommendation score ${finalScore}/100 with ${Math.round(confidence * 100)}% data confidence. ${strengths[0]}. Primary weakness: ${weaknesses[0]}.`;

  return {
    score: finalScore,
    confidence,
    category,
    strengths,
    weaknesses,
    dataLimitations,
    reasonSummary,
  };
}
