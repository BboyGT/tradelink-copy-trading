// TRADE LINK — Broker Connector Framework (Part 2.3, 2.4)
// Standardized connector interface so new brokers can be added without
// changing the core trading engine. Mock connectors simulate broker
// behaviour for the demo environment.

import type { BrokerCode, IntegrationCapability } from "@/lib/types";
import { PLATFORM_CAPABILITIES } from "@/lib/types";
import { TerminalBridgeConnector } from "./terminal-bridge";

export interface BrokerAccountInfo {
  accountId: string;
  broker: BrokerCode;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  accountType: "hedging" | "netting";
  isDemo: boolean;
}

export interface BrokerPosition {
  positionId: string;
  instrument: string;
  direction: "BUY" | "SELL";
  volume: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  swap: number;
  commission: number;
  unrealizedProfit: number;
  openTime: Date;
}

export interface BrokerInstrumentSpec {
  symbol: string;
  assetClass: string;
  contractSize: number;
  tickSize: number;
  tickValue: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  tradingHours?: string;
  marginRequired?: number;
  executionModel: "market" | "instant" | "exchange";
}

export interface OrderRequest {
  instrument: string;
  direction: "BUY" | "SELL";
  volume: number;
  orderType: "market" | "limit" | "stop";
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  positionId?: string;
  executedPrice?: number;
  executedVolume?: number;
  rejectionReason?: string;
  executionDelayMs?: number;
}

export interface CloseResult {
  success: boolean;
  closedVolume?: number;
  closedPrice?: number;
  realizedProfit?: number;
  rejectionReason?: string;
}

export interface ModifyResult {
  success: boolean;
  rejectionReason?: string;
}

/**
 * Standardized broker connector interface (Part 2.3).
 * New brokers implement this; the trading engine doesn't need to change.
 */
export interface BrokerConnector {
  readonly broker: BrokerCode;

  authorize(credentials: any): Promise<{ success: boolean; accountId?: string; reason?: string }>;
  disconnect(): Promise<void>;
  isAuthorized(): boolean;

  getAccountInfo(): Promise<BrokerAccountInfo>;
  getOpenPositions(): Promise<BrokerPosition[]>;
  getInstrumentSpec(symbol: string): Promise<BrokerInstrumentSpec | null>;

  placeOrder(req: OrderRequest): Promise<OrderResult>;
  modifyPosition(positionId: string, updates: { stopLoss?: number; takeProfit?: number; volume?: number }): Promise<ModifyResult>;
  closePosition(positionId: string, volume?: number): Promise<CloseResult>;

  capabilities(): IntegrationCapability;
}

// ============================================================
// BASE MOCK CONNECTOR — simulated broker for DEMO environment
// ============================================================

export abstract class BaseMockConnector implements BrokerConnector {
  abstract readonly broker: BrokerCode;
  protected accountInfo: BrokerAccountInfo | null = null;
  protected positions: Map<string, BrokerPosition> = new Map();
  protected authorized = false;
  protected nextOrderId = 1;

  async authorize(credentials: any): Promise<{ success: boolean; accountId?: string; reason?: string }> {
    if (!credentials || (!credentials.token && !credentials.apiKey && !credentials.login)) {
      return { success: false, reason: "Missing credentials" };
    }
    this.accountInfo = {
      accountId: credentials.accountId ?? `DEMO-${Math.random().toString(36).slice(2, 10)}`,
      broker: this.broker,
      currency: credentials.currency ?? "USD",
      balance: credentials.startingBalance ?? 10000,
      equity: credentials.startingBalance ?? 10000,
      margin: 0,
      freeMargin: credentials.startingBalance ?? 10000,
      leverage: credentials.leverage ?? 100,
      accountType: credentials.accountType ?? "hedging",
      isDemo: true,
    };
    this.authorized = true;
    return { success: true, accountId: this.accountInfo.accountId };
  }

  async disconnect(): Promise<void> {
    this.authorized = false;
    this.accountInfo = null;
    this.positions.clear();
  }

  isAuthorized(): boolean {
    return this.authorized;
  }

  async getAccountInfo(): Promise<BrokerAccountInfo> {
    this.requireAuth();
    const positions = Array.from(this.positions.values());
    const unrealized = positions.reduce((s, p) => s + p.unrealizedProfit, 0);
    const usedMargin = positions.reduce((s, p) => s + (p.volume * 100000 * 0.01), 0);
    this.accountInfo = {
      ...this.accountInfo!,
      equity: this.accountInfo!.balance + unrealized,
      margin: usedMargin,
      freeMargin: this.accountInfo!.balance + unrealized - usedMargin,
    };
    return this.accountInfo!;
  }

  async getOpenPositions(): Promise<BrokerPosition[]> {
    this.requireAuth();
    return Array.from(this.positions.values());
  }

  async getInstrumentSpec(symbol: string): Promise<BrokerInstrumentSpec | null> {
    return this.mockInstrumentSpec(symbol);
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    this.requireAuth();
    const start = Date.now();
    const spec = await this.getInstrumentSpec(req.instrument);
    if (!spec) {
      return { success: false, rejectionReason: `Instrument ${req.instrument} not supported on ${this.broker}` };
    }
    if (req.volume < spec.minVolume) {
      return { success: false, rejectionReason: `Volume below minimum (${spec.minVolume})` };
    }
    if (req.volume > spec.maxVolume) {
      return { success: false, rejectionReason: `Volume above maximum (${spec.maxVolume})` };
    }

    const price = await this.mockPrice(req.instrument);
    const positionId = `${this.broker.toUpperCase()}-${this.nextOrderId++}`;
    const unrealizedProfit = 0;

    this.positions.set(positionId, {
      positionId,
      instrument: req.instrument,
      direction: req.direction,
      volume: req.volume,
      entryPrice: price,
      currentPrice: price,
      stopLoss: req.stopLoss,
      takeProfit: req.takeProfit,
      swap: 0,
      commission: -req.volume * 7,
      unrealizedProfit,
      openTime: new Date(),
    });

    return {
      success: true,
      orderId: `ORD-${this.nextOrderId - 1}`,
      positionId,
      executedPrice: price,
      executedVolume: req.volume,
      executionDelayMs: Date.now() - start,
    };
  }

  async modifyPosition(positionId: string, updates: { stopLoss?: number; takeProfit?: number; volume?: number }): Promise<ModifyResult> {
    this.requireAuth();
    const pos = this.positions.get(positionId);
    if (!pos) return { success: false, rejectionReason: "Position not found" };
    if (updates.stopLoss !== undefined) pos.stopLoss = updates.stopLoss;
    if (updates.takeProfit !== undefined) pos.takeProfit = updates.takeProfit;
    if (updates.volume !== undefined) {
      if (updates.volume < pos.volume) {
        pos.volume = updates.volume;
      }
    }
    this.positions.set(positionId, pos);
    return { success: true };
  }

  async closePosition(positionId: string, volume?: number): Promise<CloseResult> {
    this.requireAuth();
    const pos = this.positions.get(positionId);
    if (!pos) return { success: false, rejectionReason: "Position not found" };
    const closeVol = volume ?? pos.volume;
    const closePrice = await this.mockPrice(pos.instrument);
    const direction = pos.direction === "BUY" ? 1 : -1;
    // Use the instrument's actual contract size from the spec (Part 2.4).
    const spec = this.mockInstrumentSpec(pos.instrument);
    const contractSize = spec?.contractSize ?? 100000;
    const realizedProfit = (closePrice - pos.entryPrice) * direction * closeVol * contractSize;

    // Preserve the original volume before any reduction so the commission ratio
    // is computed against the position size that was open when the close was requested.
    const originalVolume = pos.volume;

    if (closeVol >= pos.volume) {
      this.positions.delete(positionId);
    } else {
      pos.volume -= closeVol;
      this.positions.set(positionId, pos);
    }

    if (this.accountInfo) {
      this.accountInfo.balance += realizedProfit + pos.commission * (closeVol / originalVolume);
    }

    return {
      success: true,
      closedVolume: closeVol,
      closedPrice: closePrice,
      realizedProfit,
    };
  }

  protected requireAuth() {
    if (!this.authorized) throw new Error(`Broker ${this.broker} not authorized`);
  }

  protected async mockPrice(symbol: string): Promise<number> {
    const base: Record<string, number> = {
      XAUUSD: 2650.5, GOLD: 2650.5, EURUSD: 1.0850, GBPUSD: 1.2750,
      VOLATILITY10: 1234.56, VOLATILITY25: 2468.90, BOOM500: 5678.12, CRASH500: 4321.89,
      BTCUSD: 67500, ETHUSD: 3450,
    };
    const px = base[symbol] ?? 100;
    return px * (1 + (Math.random() - 0.5) * 0.001);
  }

  protected mockInstrumentSpec(symbol: string): BrokerInstrumentSpec | null {
    const known: Record<string, Partial<BrokerInstrumentSpec> & { assetClass: string }> = {
      XAUUSD: { assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, marginRequired: 0.01 },
      GOLD: { assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, marginRequired: 0.01 },
      EURUSD: { assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, marginRequired: 0.01 },
      GBPUSD: { assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, marginRequired: 0.01 },
      BTCUSD: { assetClass: "crypto", contractSize: 1, tickSize: 0.01, tickValue: 0.01, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, marginRequired: 0.05 },
      ETHUSD: { assetClass: "crypto", contractSize: 1, tickSize: 0.01, tickValue: 0.01, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, marginRequired: 0.05 },
      VOLATILITY10: { assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.5, maxVolume: 1000, volumeStep: 0.5, marginRequired: 0.01 },
      VOLATILITY25: { assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.5, maxVolume: 1000, volumeStep: 0.5, marginRequired: 0.01 },
      BOOM500: { assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.2, maxVolume: 500, volumeStep: 0.2, marginRequired: 0.01 },
      CRASH500: { assetClass: "synthetic", contractSize: 1, tickSize: 0.001, tickValue: 0.1, minVolume: 0.2, maxVolume: 500, volumeStep: 0.2, marginRequired: 0.01 },
    };
    const spec = known[symbol];
    if (!spec) return null;
    return {
      symbol,
      assetClass: spec.assetClass,
      contractSize: spec.contractSize ?? 1,
      tickSize: spec.tickSize ?? 0.01,
      tickValue: spec.tickValue ?? 1,
      minVolume: spec.minVolume ?? 0.01,
      maxVolume: spec.maxVolume ?? 100,
      volumeStep: spec.volumeStep ?? 0.01,
      marginRequired: spec.marginRequired,
      executionModel: "market",
    };
  }

  abstract capabilities(): IntegrationCapability;
}

// ============================================================
// CONCRETE MOCK CONNECTORS
// ============================================================

export class DerivConnector extends BaseMockConnector {
  readonly broker: BrokerCode = "deriv";
  capabilities() { return PLATFORM_CAPABILITIES.deriv; }
}

export class CTraderConnector extends BaseMockConnector {
  readonly broker: BrokerCode = "ctrader";
  capabilities() { return PLATFORM_CAPABILITIES.deriv_ctrader; }
}

export class MT4Connector extends BaseMockConnector {
  readonly broker: BrokerCode = "mt4";
  capabilities() { return PLATFORM_CAPABILITIES.mt4; }
}

export class MT5Connector extends BaseMockConnector {
  readonly broker: BrokerCode = "mt5";
  capabilities() { return PLATFORM_CAPABILITIES.mt5; }
}

// ============================================================
// REGISTRY
// ============================================================

const CONNECTOR_REGISTRY: Record<BrokerCode, () => BrokerConnector> = {
  deriv: () => { throw new Error("Deriv production connector is not configured"); },
  ctrader: () => { throw new Error("cTrader Open API connector is not configured"); },
  mt4: () => { throw new Error("MT4 requires an account-specific terminal bridge"); },
  mt5: () => { throw new Error("MT5 requires an account-specific terminal bridge"); },
  fxcm: () => { throw new Error("FXCM FCLite connector is not configured"); },
  ftmo: () => { throw new Error("Prop firm accounts require a connected MT terminal bridge"); },
  fundednext: () => { throw new Error("Prop firm accounts require a connected MT terminal bridge"); },
  myfundedfx: () => { throw new Error("Prop firm accounts require a connected MT terminal bridge"); },
  the5ers: () => { throw new Error("Prop firm accounts require a connected MT terminal bridge"); },
  propfirm: () => { throw new Error("Prop firm accounts require a connected MT terminal bridge"); },
  external: () => {
    throw new Error("External connectors must be configured per-broker");
  },
};

export function getConnector(broker: BrokerCode): BrokerConnector {
  const factory = CONNECTOR_REGISTRY[broker];
  if (!factory) throw new Error(`No connector for broker ${broker}`);
  return factory();
}

const activeConnectors: Map<string, BrokerConnector> = new Map();

export async function getAccountConnector(
  brokerCode: BrokerCode,
  accountId: string,
  credentials: any,
): Promise<BrokerConnector> {
  const key = `${brokerCode}:${accountId}`;
  let connector = activeConnectors.get(key);
  if (connector && connector.isAuthorized()) return connector;
  connector = brokerCode === "mt4" || brokerCode === "mt5"
    ? new TerminalBridgeConnector(brokerCode, accountId)
    : getConnector(brokerCode);
  const authResult = await connector.authorize(credentials);
  if (!authResult.success) {
    throw new Error(`Authorization failed: ${authResult.reason}`);
  }
  activeConnectors.set(key, connector);
  return connector;
}

export function disconnectAccount(brokerCode: BrokerCode, accountId: string): void {
  const key = `${brokerCode}:${accountId}`;
  const connector = activeConnectors.get(key);
  if (connector) {
    connector.disconnect();
    activeConnectors.delete(key);
  }
}
