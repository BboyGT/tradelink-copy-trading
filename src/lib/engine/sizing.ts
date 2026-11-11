// TRADE LINK — Position Sizing Engine (Part 10)
// Implements equity ratio, fixed multiplier, fixed lot, and risk-based sizing.
// Pure functions — fully testable, no side effects.

import type { SizingMode } from "@/lib/types";

export interface SizingInput {
  mode: SizingMode;
  // Equity ratio
  sourceEquity: number;
  destinationEquity: number;
  destinationBalance?: number;
  equityMultiplier: number;
  referenceBase: "balance" | "equity" | "fixed_capital";
  fixedReferenceCapital?: number;
  // Fixed multiplier
  sourceVolume: number;
  // Fixed lot
  fixedLotSize?: number;
  // Risk-based
  riskPerTradePct?: number;
  stopLossDistance?: number; // in price units
  tickValue?: number; // value of 1 pip move per 1 lot
  contractSize?: number;
  // Destination constraints
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  rounding: "nearest" | "down" | "up";
}

export interface SizingResult {
  requestedVolume: number;
  finalVolume: number;
  rounded: boolean;
  clamped: boolean;
  reason?: string;
}

/**
 * Compute destination volume according to Part 10.
 *
 * Equity ratio:    dest = src * (destEquity / srcEquity) * multiplier
 * Fixed multiplier: dest = src * multiplier
 * Fixed lot:       dest = fixedLot
 * Risk-based:      dest = (equity * riskPct) / (stopDistance * tickValue)
 */
export function computeSizing(input: SizingInput): SizingResult {
  let requested = 0;
  let reason: string | undefined;

  switch (input.mode) {
    case "equity_ratio": {
      if (input.sourceEquity <= 0) {
        return { requestedVolume: 0, finalVolume: 0, rounded: false, clamped: true, reason: "Source equity is zero" };
      }
      const refBase =
        input.referenceBase === "balance" ? (input.destinationBalance ?? input.destinationEquity)
        : input.referenceBase === "equity" ? input.destinationEquity
        : input.fixedReferenceCapital ?? input.destinationEquity;
      requested = input.sourceVolume * (refBase / input.sourceEquity) * input.equityMultiplier;
      break;
    }
    case "fixed_multiplier": {
      requested = input.sourceVolume * input.equityMultiplier;
      break;
    }
    case "fixed_lot": {
      requested = input.fixedLotSize ?? 0;
      reason = input.fixedLotSize === undefined ? "No fixed lot configured" : undefined;
      break;
    }
    case "risk_based": {
      // Risk-based requires a stop-loss distance.
      if (input.stopLossDistance === undefined || input.stopLossDistance <= 0) {
        return {
          requestedVolume: 0,
          finalVolume: 0,
          rounded: false,
          clamped: true,
          reason: "Risk-based sizing requires a stop-loss distance. Configure an alternative risk rule or use SL replication.",
        };
      }
      if (!input.tickValue || input.tickValue <= 0) {
        return {
          requestedVolume: 0,
          finalVolume: 0,
          rounded: false,
          clamped: true,
          reason: "Tick value unavailable for this instrument",
        };
      }
      const riskAmount = input.destinationEquity * ((input.riskPerTradePct ?? 1) / 100);
      const lossPerLot = input.stopLossDistance * input.tickValue;
      requested = lossPerLot > 0 ? riskAmount / lossPerLot : 0;
      break;
    }
  }

  // Round to volume step
  let final = requested;
  let rounded = false;
  if (input.volumeStep > 0) {
    const stepped =
      input.rounding === "down" ? Math.floor(requested / input.volumeStep) * input.volumeStep
      : input.rounding === "up" ? Math.ceil(requested / input.volumeStep) * input.volumeStep
      : Math.round(requested / input.volumeStep) * input.volumeStep;
    if (Math.abs(stepped - requested) > 1e-9) rounded = true;
    final = stepped;
  }

  // Clamp to min/max
  let clamped = false;
  if (final < input.minVolume) {
    final = input.minVolume;
    clamped = true;
    if (requested < input.minVolume) reason = `Below broker minimum (${input.minVolume})`;
  }
  if (final > input.maxVolume) {
    final = input.maxVolume;
    clamped = true;
    if (requested > input.maxVolume) reason = `Above broker maximum (${input.maxVolume})`;
  }

  return {
    requestedVolume: requested,
    finalVolume: final,
    rounded,
    clamped,
    reason,
  };
}

/**
 * Compute partial closure volume (Part 8.3).
 * If source closes 50% of position, destination closes 50%, subject to broker volume step.
 * Never leave a larger destination exposure than intended.
 */
export function computePartialClosure(
  sourceOriginalVolume: number,
  sourceRemainingVolume: number,
  destOriginalVolume: number,
  destCurrentVolume: number,
  volumeStep: number,
): { closeVolume: number; keepVolume: number; unrepresentable: boolean } {
  // Ratio that remains on source
  const sourceRatio = sourceRemainingVolume / sourceOriginalVolume;
  const desiredDestRemaining = destCurrentVolume * sourceRatio;

  // What needs to be closed
  const closeVolumeRaw = destCurrentVolume - desiredDestRemaining;

  // Round DOWN to volume step — never close more than the exact ratio
  const closeVolume = Math.floor(closeVolumeRaw / volumeStep) * volumeStep;
  const keepVolume = destCurrentVolume - closeVolume;
  const unrepresentable = Math.abs(closeVolumeRaw - closeVolume) > 1e-9;

  return { closeVolume, keepVolume, unrepresentable };
}
