// TRADE LINK — Demo data generator (Part 25.4)
// Generates clearly-labelled DEMO providers, historical trades, broker accounts.
// Used only in dev environment. Per the PRD: never fabricate in production.

import { db } from "@/lib/db";
import { PLATFORM_CAPABILITIES } from "@/lib/types";
import type { IntegrationCapability } from "@/lib/types";

const INSTRUMENTS = [
  { symbol: "XAUUSD", asset: "metal", price: 2650.5, vol: 2.5 },       // ~$2.5-$10 move per trade (was 0.012 — too small, costs ate all profit)
  { symbol: "EURUSD", asset: "forex", price: 1.085, vol: 0.0008 },
  { symbol: "GBPUSD", asset: "forex", price: 1.275, vol: 0.0009 },
  { symbol: "BTCUSD", asset: "crypto", price: 67500, vol: 350 },
  { symbol: "ETHUSD", asset: "crypto", price: 3450, vol: 22 },
  { symbol: "VOLATILITY10", asset: "synthetic", price: 1234.56, vol: 8 },
  { symbol: "VOLATILITY25", asset: "synthetic", price: 2468.90, vol: 15 },
  { symbol: "BOOM500", asset: "synthetic", price: 5678.12, vol: 30 },
  { symbol: "CRASH500", asset: "synthetic", price: 4321.89, vol: 28 },
];

interface ProviderSeed {
  name: string;
  platform: string;
  description: string;
  currency: string;
  startingBalance: number;
  avgTradesPerDay: number;
  winBias: number; // 0..1, higher = more winning trades
  avgVolume: number;
  instruments: string[];
  daysActive: number;
  verification: "verified" | "platform_reported" | "calculated";
}

const PROVIDER_SEEDS: ProviderSeed[] = [
  {
    name: "AlphaTrend FX",
    platform: "deriv",
    description: "Disciplined forex swing trader focusing on EUR/USD and GBP/USD with strict risk management.",
    currency: "USD",
    startingBalance: 5000,
    avgTradesPerDay: 1.5,
    winBias: 0.62,
    avgVolume: 0.30,
    instruments: ["EURUSD", "GBPUSD"],
    daysActive: 420,
    verification: "verified",
  },
  {
    name: "GoldRush Capital",
    platform: "deriv",
    description: "XAUUSD specialist with macro-driven entries. Higher volatility, higher returns.",
    currency: "USD",
    startingBalance: 10000,
    avgTradesPerDay: 2.2,
    winBias: 0.55,
    avgVolume: 0.25,
    instruments: ["XAUUSD"],
    daysActive: 280,
    verification: "verified",
  },
  {
    name: "Synth Master",
    platform: "deriv",
    description: "Deriv synthetic indices specialist. Trades Volatility 10 and Boom 500.",
    currency: "USD",
    startingBalance: 2000,
    avgTradesPerDay: 4.5,
    winBias: 0.58,
    avgVolume: 1.5,
    instruments: ["VOLATILITY10", "BOOM500"],
    daysActive: 190,
    verification: "platform_reported",
  },
  {
    name: "Crypto Swing Pro",
    platform: "deriv_ctrader",
    description: "BTC/ETH swing trader. Larger drawdowns, asymmetric upside.",
    currency: "USD",
    startingBalance: 8000,
    avgTradesPerDay: 0.8,
    winBias: 0.51,
    avgVolume: 0.15,
    instruments: ["BTCUSD", "ETHUSD"],
    daysActive: 310,
    verification: "verified",
  },
  {
    name: "Stable Growth FX",
    platform: "ctrader_copy",
    description: "Conservative forex trader. Lower returns but very low drawdown.",
    currency: "USD",
    startingBalance: 15000,
    avgTradesPerDay: 0.6,
    winBias: 0.71,
    avgVolume: 0.20,
    instruments: ["EURUSD", "GBPUSD"],
    daysActive: 540,
    verification: "verified",
  },
  {
    name: "CrashHunter 500",
    platform: "deriv",
    description: "Specialises in CRASH500 spike trading. High risk, high reward.",
    currency: "USD",
    startingBalance: 3000,
    avgTradesPerDay: 6.0,
    winBias: 0.48,
    avgVolume: 1.0,
    instruments: ["CRASH500"],
    daysActive: 95,
    verification: "platform_reported",
  },
  {
    name: "Diversified Pro",
    platform: "mt5",
    description: "Multi-asset trader across metals, forex and crypto.",
    currency: "USD",
    startingBalance: 12000,
    avgTradesPerDay: 1.8,
    winBias: 0.59,
    avgVolume: 0.40,
    instruments: ["XAUUSD", "EURUSD", "BTCUSD"],
    daysActive: 365,
    verification: "calculated",
  },
  {
    name: "Momentum Scalper",
    platform: "deriv",
    description: "Short-term momentum trader. High frequency, smaller sizes.",
    currency: "USD",
    startingBalance: 2500,
    avgTradesPerDay: 8.0,
    winBias: 0.53,
    avgVolume: 0.10,
    instruments: ["VOLATILITY25", "VOLATILITY10"],
    daysActive: 60,
    verification: "platform_reported",
  },
  {
    name: "Macro Position Trader",
    platform: "mt4",
    description: "Long-term macro trader. Holds positions for days/weeks.",
    currency: "USD",
    startingBalance: 25000,
    avgTradesPerDay: 0.3,
    winBias: 0.66,
    avgVolume: 0.50,
    instruments: ["XAUUSD", "EURUSD", "GBPUSD"],
    daysActive: 720,
    verification: "verified",
  },
  {
    name: "Newcomer Trader",
    platform: "deriv",
    description: "Recently listed provider. Limited history available.",
    currency: "USD",
    startingBalance: 1000,
    avgTradesPerDay: 2.0,
    winBias: 0.50,
    avgVolume: 0.20,
    instruments: ["EURUSD"],
    daysActive: 25,
    verification: "incomplete" as any,
  },
];

function rng(seed: number) {
  // Mulberry32 PRNG — deterministic for reproducible demo data
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

export async function seedDemoData(): Promise<{ providers: number; trades: number }> {
  // Idempotency — skip if already seeded
  const existing = await db.providerPlatform.count();
  if (existing > 0) {
    return { providers: 0, trades: 0 };
  }

  // 1. Platforms
  const platformDefs: { code: string; name: string; kind: string; capabilities: IntegrationCapability }[] = [
    { code: "deriv", name: "Deriv Copy Trading", kind: "copy_trading", capabilities: PLATFORM_CAPABILITIES.deriv },
    { code: "deriv_ctrader", name: "Deriv cTrader Copy", kind: "copy_trading", capabilities: PLATFORM_CAPABILITIES.deriv_ctrader },
    { code: "ctrader_copy", name: "cTrader Copy", kind: "copy_trading", capabilities: PLATFORM_CAPABILITIES.ctrader_copy },
    { code: "mt4", name: "MetaTrader 4", kind: "broker_native", capabilities: PLATFORM_CAPABILITIES.mt4 },
    { code: "mt5", name: "MetaTrader 5", kind: "broker_native", capabilities: PLATFORM_CAPABILITIES.mt5 },
    { code: "external", name: "External Signal", kind: "signal_feed", capabilities: PLATFORM_CAPABILITIES.external },
  ];

  const platforms: Record<string, string> = {};
  for (const p of platformDefs) {
    const rec = await db.providerPlatform.create({
      data: { code: p.code, name: p.name, kind: p.kind, capabilities: JSON.stringify(p.capabilities) },
    });
    platforms[p.code] = rec.id;
  }

  // 2. Providers + trades
  let totalTrades = 0;
  let providerCount = 0;

  for (let i = 0; i < PROVIDER_SEEDS.length; i++) {
    const seed = PROVIDER_SEEDS[i];
    const r = rng(i * 9999 + 1);

    const accountCreatedAt = new Date(Date.now() - seed.daysActive * 24 * 60 * 60 * 1000);
    const provider = await db.provider.create({
      data: {
        externalId: `DEMO-${seed.platform.toUpperCase()}-${1000 + i}`,
        platformId: platforms[seed.platform],
        name: seed.name,
        description: seed.description,
        accountType: "real",
        accountCurrency: seed.currency,
        startingBalance: seed.startingBalance,
        reportedBalance: seed.startingBalance * (1 + (r() * 1.5 - 0.1)), // vary growth
        reportedEquity: seed.startingBalance * (1 + (r() * 1.5 - 0.1)),
        accountCreatedAt,
        followers: Math.floor(r() * 5000) + 50,
        subscribers: Math.floor(r() * 800) + 5,
        activityStatus: r() > 0.1 ? "active" : "inactive",
        verificationLevel: seed.verification,
        dataCompleteness: seed.verification === "verified" ? 0.95 : seed.verification === "platform_reported" ? 0.7 : 0.4,
        lastSyncedAt: new Date(),
        importedById: null,
      },
    });

    // Generate historical trades
    const tradesCount = Math.floor(seed.daysActive * seed.avgTradesPerDay);
    let currentTime = accountCreatedAt.getTime();
    let runningBalance = seed.startingBalance;

    for (let t = 0; t < tradesCount; t++) {
      // Trade time
      const gapHours = (24 / seed.avgTradesPerDay) * (0.5 + r() * 1.5);
      currentTime += gapHours * 60 * 60 * 1000;
      if (currentTime > Date.now()) break;

      const instrument = pick(seed.instruments, r);
      const instrDef = INSTRUMENTS.find((x) => x.symbol === instrument)!;
      const direction = r() > 0.5 ? "BUY" : "SELL";
      const volume = Math.max(0.01, seed.avgVolume * (0.5 + r() * 1.0));
      const entryPrice = instrDef.price * (1 + (r() - 0.5) * 0.02);

      // Holding time
      const holdingHours = 1 + r() * (seed.name === "Macro Position Trader" ? 240 : 24);
      const closeTime = new Date(currentTime + holdingHours * 60 * 60 * 1000);
      if (closeTime.getTime() > Date.now()) continue;

      // Win/loss
      const isWin = r() < seed.winBias;
      const exitMove = instrDef.vol * (1 + r() * 3) * (isWin ? 1 : -1);
      const exitPrice = direction === "BUY"
        ? entryPrice + exitMove
        : entryPrice - exitMove;

      const grossProfit = (exitPrice - entryPrice) * (direction === "BUY" ? 1 : -1) * volume * (instrDef.asset === "forex" ? 100000 : instrDef.asset === "metal" ? 100 : 1);
      const commission = -volume * 7;
      const swap = -volume * (holdingHours / 24) * 0.5;
      const netProfit = grossProfit + commission + swap;
      runningBalance += netProfit;

      await db.providerTrade.create({
        data: {
          providerId: provider.id,
          externalTradeId: `DEMO-${provider.id}-${t}`,
          positionId: `POS-${t}`,
          instrument,
          direction,
          entryPrice,
          exitPrice,
          openTime: new Date(currentTime),
          closeTime,
          volume,
          stopLoss: direction === "BUY" ? entryPrice * 0.98 : entryPrice * 1.02,
          takeProfit: direction === "BUY" ? entryPrice * 1.04 : entryPrice * 0.96,
          orderType: "market",
          contractType: instrDef.asset === "synthetic" ? "synthetic" : instrDef.asset === "crypto" ? "spot" : "cfd",
          grossProfit,
          netProfit,
          commission,
          swap,
          closingReason: isWin ? "take_profit" : "manual",
          dataQuality: seed.verification,
        },
      });
      totalTrades++;
    }

    // Compute statistics
    await computeAndStoreStatistics(provider.id, seed.startingBalance, r);
    providerCount++;
  }

  // 3. Demo broker account (if no user yet, will be claimed on signup)
  // Skipped — broker accounts are created per-user.

  // 4. Instrument specs for the demo brokers
  const instrumentDefs = [
    { brokerCode: "deriv", symbol: "XAUUSD", assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "deriv", symbol: "EURUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "deriv", symbol: "VOLATILITY10", assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.5, maxVolume: 1000, volumeStep: 0.5, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "deriv", symbol: "BOOM500", assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.2, maxVolume: 500, volumeStep: 0.2, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "deriv", symbol: "CRASH500", assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.2, maxVolume: 500, volumeStep: 0.2, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "deriv", symbol: "BTCUSD", assetClass: "crypto", contractSize: 1, tickSize: 0.01, tickValue: 0.01, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, executionModel: "market", marginRequired: 0.05 },
    { brokerCode: "ctrader", symbol: "XAUUSD", assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "ctrader", symbol: "EURUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "ctrader", symbol: "GBPUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "ctrader", symbol: "BTCUSD", assetClass: "crypto", contractSize: 1, tickSize: 0.01, tickValue: 0.01, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, executionModel: "market", marginRequired: 0.05 },
    { brokerCode: "mt4", symbol: "XAUUSD", assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "mt4", symbol: "EURUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "mt4", symbol: "GBPUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "mt5", symbol: "XAUUSD", assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "mt5", symbol: "EURUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market", marginRequired: 0.01 },
    { brokerCode: "mt5", symbol: "BTCUSD", assetClass: "crypto", contractSize: 1, tickSize: 0.01, tickValue: 0.01, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, executionModel: "market", marginRequired: 0.05 },
  ];

  for (const spec of instrumentDefs) {
    await db.instrumentSpec.create({ data: spec });
  }

  return { providers: providerCount, trades: totalTrades };
}

async function computeAndStoreStatistics(providerId: string, startingBalance: number, r: () => number) {
  const trades = await db.providerTrade.findMany({ where: { providerId } });
  if (trades.length === 0) return;

  const { computePerformance, computeDrawdown, computeBehaviour, computeRiskMetrics } = await import("@/lib/engine/analytics");
  const perf = computePerformance(trades as any, startingBalance);
  const dd = computeDrawdown(trades as any, startingBalance);
  const beh = computeBehaviour(trades as any);
  const risk = computeRiskMetrics(trades as any);

  await db.providerStatistic.create({
    data: {
      providerId,
      totalReturnPct: perf.totalReturnPct,
      dailyReturnPct: perf.dailyReturnPct,
      weeklyReturnPct: perf.weeklyReturnPct,
      monthlyReturnPct: perf.monthlyReturnPct,
      quarterlyReturnPct: perf.quarterlyReturnPct,
      yearlyReturnPct: perf.yearlyReturnPct,
      lifetimeReturnPct: perf.lifetimeReturnPct,
      grossProfit: perf.grossProfit,
      grossLoss: perf.grossLoss,
      netProfit: perf.netProfit,
      totalWinningTrades: perf.totalWinningTrades,
      totalLosingTrades: perf.totalLosingTrades,
      totalClosedTrades: perf.totalClosedTrades,
      winRate: perf.winRate,
      lossRate: perf.lossRate,
      avgWinningTrade: perf.avgWinningTrade,
      avgLosingTrade: perf.avgLosingTrade,
      largestWinningTrade: perf.largestWinningTrade,
      largestLosingTrade: perf.largestLosingTrade,
      profitFactor: perf.profitFactor,
      avgProfitPerTrade: perf.avgProfitPerTrade,
      expectedValuePerTrade: perf.expectedValuePerTrade,
      maxDrawdownPct: dd.maxDrawdownPct,
      currentDrawdownPct: dd.currentDrawdownPct,
      balanceDrawdown: dd.balanceDrawdown,
      equityDrawdown: dd.equityDrawdown,
      maxDrawdownMonetary: dd.maxDrawdownMonetary,
      avgDrawdownPct: dd.avgDrawdownPct,
      longestDrawdownDays: dd.longestDrawdownDays,
      avgRecoveryDays: dd.avgRecoveryDays,
      maxRecoveryDays: dd.maxRecoveryDays,
      recoveryFactor: dd.recoveryFactor,
      largestLosingStreak: dd.largestLosingStreak,
      avgTradesPerDay: beh.avgTradesPerDay,
      tradesPerWeek: beh.tradesPerWeek,
      avgHoldingHours: beh.avgHoldingHours,
      longestHoldingHours: beh.longestHoldingHours,
      shortestHoldingHours: beh.shortestHoldingHours,
      avgVolume: beh.avgVolume,
      largestVolume: beh.largestVolume,
      maxSimultaneousPos: beh.maxSimultaneousPositions,
      buySellRatio: beh.buySellRatio,
      avgTimeBetweenTradesH: beh.avgTimeBetweenTradesHours,
      avgRiskReward: risk.avgRiskReward,
      riskConcentration: risk.riskConcentration,
      positionConcentration: risk.positionConcentration,
      avgLosingStreak: risk.avgLosingStreak,
      avgWinningStreak: risk.avgWinningStreak,
      calculationPeriod: "lifetime",
      periodStart: perf.periodStart,
      periodEnd: perf.periodEnd,
      dataQuality: perf.dataQuality,
    },
  });

  // Generate health record
  const maxDD = dd.maxDrawdownPct ?? 0;
  let healthStatus = "healthy";
  if (maxDD > 30) healthStatus = "high_risk";
  else if (maxDD > 20) healthStatus = "deteriorating";
  else if (maxDD > 10) healthStatus = "under_observation";

  await db.providerHealthRecord.create({
    data: {
      providerId,
      status: healthStatus,
      reason: `Auto-calculated from ${trades.length} historical trades`,
      metrics: JSON.stringify({ maxDD, winRate: perf.winRate, profitFactor: perf.profitFactor }),
    },
  });

  // Generate historical ProviderChangeSnapshot records — 5-10 snapshots
  // spread across the last 90 days (one every ~9 days). Older snapshots
  // trend toward the current stats so the change-tracking chart shows a
  // plausible evolution (e.g. return grows from +20% to +140% over time)
  // rather than a flat line.
  await generateChangeSnapshots(providerId, r, perf, dd, beh);
}

// Helper: deterministic risk-profile label from a drawdown pct.
function deriveRiskProfileSeed(maxDrawdownPct: number | null | undefined): string {
  if (maxDrawdownPct === null || maxDrawdownPct === undefined) return "unknown";
  if (maxDrawdownPct > 30) return "high_risk";
  if (maxDrawdownPct > 15) return "moderate_risk";
  if (maxDrawdownPct > 5) return "low_risk";
  return "conservative";
}

// Build N historical snapshots that interpolate from a starting baseline
// toward the provider's current stats. Older snapshots have lower return,
// smaller drawdown (less history to draw down from), and noisier win rate.
async function generateChangeSnapshots(
  providerId: string,
  r: () => number,
  perf: any,
  dd: any,
  beh: any,
) {
  const currentReturn = perf.lifetimeReturnPct ?? perf.totalReturnPct ?? 0;
  const currentDD = dd.maxDrawdownPct ?? 0;
  const currentWinRate = perf.winRate ?? 50;
  const currentProfitFactor = perf.profitFactor ?? 1;
  const currentAvgVolume = beh.avgVolume ?? 0;
  const currentTradesPerDay = beh.avgTradesPerDay ?? 0;

  const snapshotCount = 5 + Math.floor(r() * 6); // 5..10 snapshots
  const spacingDays = 9; // ~9 days between snapshots → ~90 day window for N=10
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Build oldest-first so progress=1 at the latest snapshot.
  for (let i = 0; i < snapshotCount; i++) {
    const progress = (i + 1) / snapshotCount; // 1/N .. 1
    // Non-linear curve so early snapshots aren't trivially tiny for high returns
    // (a +140% provider still shows ~+20% on the oldest snapshot).
    const curve = Math.pow(progress, 1.4);

    // Snapshot time: oldest = now - (N-1)*9 days, newest = now.
    // Add ±1 day of jitter so the snapshots don't land on a perfect grid.
    const offsetDays = (snapshotCount - 1 - i) * spacingDays + (r() - 0.5) * 2;
    const snapshotAt = new Date(now - offsetDays * dayMs);

    // Return grows toward current; allow a little noise (0.85..1.15 of target).
    const returnPct = currentReturn === 0
      ? (r() - 0.5) * 8
      : currentReturn * curve * (0.85 + r() * 0.3);

    // Drawdown: older snapshots show smaller drawdowns (less history), grow
    // toward current. Use a flatter curve since DD doesn't compound as cleanly.
    const drawdownPct = Math.max(
      0,
      currentDD * (0.3 + curve * 0.7) * (0.85 + r() * 0.3),
    );

    // Win rate oscillates around the current value within ±6pp.
    const winRate = Math.max(
      0,
      Math.min(100, currentWinRate + (r() - 0.5) * 12 * (1 - curve * 0.5)),
    );

    // Profit factor interpolates between ~1.0 (early) and the current value.
    const profitFactor = currentProfitFactor === 0 || currentProfitFactor === null
      ? 1 + (r() - 0.5) * 0.4
      : 1 + (currentProfitFactor - 1) * curve * (0.85 + r() * 0.3);

    const avgVolume = Math.max(
      0,
      currentAvgVolume * (0.7 + r() * 0.6),
    );

    const tradingFrequency = Math.max(
      0,
      currentTradesPerDay * (0.6 + r() * 0.8),
    );

    const riskProfile = deriveRiskProfileSeed(drawdownPct);

    // Notes capture profit factor (no dedicated column in the snapshot schema)
    // and the synthetic period label.
    const notes = `profitFactor=${profitFactor.toFixed(2)}; period=day-${Math.round(offsetDays)}`;

    await db.providerChangeSnapshot.create({
      data: {
        providerId,
        snapshotAt,
        returnPct,
        drawdownPct,
        winRate,
        tradingFrequency,
        avgVolume,
        riskProfile,
        notes,
      },
    });
  }
}

// (End of demo data generator)

