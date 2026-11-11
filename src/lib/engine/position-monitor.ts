// TRADE LINK — Position Monitoring Engine (Part 7, 22)
//
// This module monitors the user's OWN broker accounts (copy trading accounts)
// and detects position changes. When a change is detected, it generates trade
// events that the replication engine can act on.
//
// The key insight: instead of subscribing to a provider's trade feed (which
// most platforms don't allow), we monitor the USER'S copy account. When the
// copy account's positions change (because the provider they're following
// traded), that's our signal.
//
// Flow:
// 1. Fetch current open positions from the broker
// 2. Compare to previously stored SourcePositions
// 3. Detect: new positions (OPEN), removed positions (CLOSE), volume changes (PARTIAL_CLOSE / MODIFY)
// 4. Create/update SourcePosition records
// 5. Return events for the replication engine to process

import type { BrokerPosition } from "@/lib/broker/connector";

export type PositionEventType = "open" | "close" | "partial_close" | "modify";

export interface PositionEvent {
  type: PositionEventType;
  sourcePositionId?: string;        // our internal SourcePosition ID
  externalPositionId: string;       // broker's position ID
  instrument: string;
  direction: "BUY" | "SELL";
  volume: number;                   // current volume (after change)
  previousVolume?: number;          // for partial_close / modify
  entryPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  exitPrice?: number;              // for close events
  realizedProfit?: number;         // for close events
  openTime: Date;
  closeTime?: Date;
  detectedAt: Date;
  detectionLatencyMs: number;
}

export interface ScanResult {
  events: PositionEvent[];
  summary: {
    opens: number;
    closes: number;
    partialCloses: number;
    modifications: number;
    totalCurrentPositions: number;
    totalPreviousPositions: number;
  };
}

/**
 * Compare current broker positions against previously stored positions.
 * Detect opens, closes, partial closes, and modifications.
 *
 * @param currentPositions - live positions fetched from the broker right now
 * @param previousPositions - positions we stored from the last scan
 * @returns detected events + summary
 */
export function diffPositions(
  currentPositions: BrokerPosition[],
  previousPositions: { externalPositionId: string; volume: number; stopLoss?: number | null; takeProfit?: number | null; instrument: string; direction: string; entryPrice: number; state: string }[],
): ScanResult {
  const now = new Date();
  const events: PositionEvent[] = [];

  const currentMap = new Map(currentPositions.map(p => [p.positionId, p]));
  const previousMap = new Map(previousPositions.map(p => [p.externalPositionId, p]));

  // Detect OPENS: positions in current but not in previous
  for (const curr of currentPositions) {
    const prev = previousMap.get(curr.positionId);
    if (!prev) {
      events.push({
        type: "open",
        externalPositionId: curr.positionId,
        instrument: curr.instrument,
        direction: curr.direction,
        volume: curr.volume,
        entryPrice: curr.entryPrice,
        currentPrice: curr.currentPrice,
        stopLoss: curr.stopLoss,
        takeProfit: curr.takeProfit,
        openTime: curr.openTime,
        detectedAt: now,
        detectionLatencyMs: 0, // Set by caller with actual fetch duration
      });
    }
  }

  // Detect CLOSES and MODIFICATIONS: positions in previous but not in current, or changed
  for (const prev of previousPositions) {
    const curr = currentMap.get(prev.externalPositionId);

    if (!curr) {
      // Position is gone — it was closed
      events.push({
        type: "close",
        externalPositionId: prev.externalPositionId,
        instrument: prev.instrument,
        direction: prev.direction as "BUY" | "SELL",
        volume: 0,
        previousVolume: prev.volume,
        entryPrice: prev.entryPrice,
        exitPrice: undefined, // Broker doesn't always provide exit price in position list
        realizedProfit: undefined,
        openTime: new Date(0), // We don't have the original open time here
        closeTime: now,
        detectedAt: now,
        detectionLatencyMs: 0,
      });
    } else {
      // Position still exists — check for changes
      const volumeDiff = prev.volume - curr.volume;

      if (volumeDiff > 0.0001) {
        // Volume decreased — partial close
        events.push({
          type: "partial_close",
          externalPositionId: curr.positionId,
          instrument: curr.instrument,
          direction: curr.direction,
          volume: curr.volume,
          previousVolume: prev.volume,
          entryPrice: curr.entryPrice,
          currentPrice: curr.currentPrice,
          stopLoss: curr.stopLoss,
          takeProfit: curr.takeProfit,
          openTime: curr.openTime,
          detectedAt: now,
          detectionLatencyMs: 0,
        });
      }

      // Check for SL/TP modifications
      const slChanged = (prev.stopLoss ?? null) !== (curr.stopLoss ?? null);
      const tpChanged = (prev.takeProfit ?? null) !== (curr.takeProfit ?? null);
      if ((slChanged || tpChanged) && volumeDiff <= 0.0001) {
        events.push({
          type: "modify",
          externalPositionId: curr.positionId,
          instrument: curr.instrument,
          direction: curr.direction,
          volume: curr.volume,
          entryPrice: curr.entryPrice,
          currentPrice: curr.currentPrice,
          stopLoss: curr.stopLoss,
          takeProfit: curr.takeProfit,
          openTime: curr.openTime,
          detectedAt: now,
          detectionLatencyMs: 0,
        });
      }
    }
  }

  const summary = {
    opens: events.filter(e => e.type === "open").length,
    closes: events.filter(e => e.type === "close").length,
    partialCloses: events.filter(e => e.type === "partial_close").length,
    modifications: events.filter(e => e.type === "modify").length,
    totalCurrentPositions: currentPositions.length,
    totalPreviousPositions: previousPositions.length,
  };

  return { events, summary };
}

/**
 * Calculate the mirror volume for a position event.
 * Uses the same sizing engine as the replication config.
 */
export function calculateMirrorVolume(
  event: PositionEvent,
  sourceEquity: number,
  destinationEquity: number,
  sizingMode: "equity_ratio" | "fixed_multiplier" | "fixed_lot" | "risk_based",
  multiplier: number = 1,
  fixedLot?: number,
  minVolume: number = 0.01,
  maxVolume: number = 100,
  volumeStep: number = 0.01,
): number {
  if (event.type === "close") return 0;

  const sourceVolume = event.type === "partial_close" && event.previousVolume
    ? event.previousVolume - event.volume  // the portion that was closed
    : event.volume;

  let destVolume = 0;

  switch (sizingMode) {
    case "equity_ratio":
      if (sourceEquity > 0) {
        destVolume = sourceVolume * (destinationEquity / sourceEquity) * multiplier;
      }
      break;
    case "fixed_multiplier":
      destVolume = sourceVolume * multiplier;
      break;
    case "fixed_lot":
      destVolume = fixedLot ?? 0;
      if (event.type === "partial_close" && event.previousVolume) {
        // Scale the fixed lot proportionally
        const ratio = (event.previousVolume - event.volume) / event.previousVolume;
        destVolume = (fixedLot ?? 0) * ratio;
      }
      break;
    case "risk_based":
      // Risk-based requires SL distance — use the event's SL if available
      if (event.stopLoss && event.entryPrice) {
        const slDistance = Math.abs(event.entryPrice - event.stopLoss);
        const riskAmount = destinationEquity * 0.01; // 1% risk default
        destVolume = slDistance > 0 ? riskAmount / (slDistance * 1) : 0; // simplified tick value
      }
      break;
  }

  // Round to volume step (round DOWN for partial closes, nearest for opens)
  if (event.type === "partial_close") {
    destVolume = Math.floor(destVolume / volumeStep) * volumeStep; // never close more than source
  } else {
    destVolume = Math.round(destVolume / volumeStep) * volumeStep;
  }

  // Clamp to min/max
  destVolume = Math.max(minVolume, Math.min(maxVolume, destVolume));

  return destVolume;
}
