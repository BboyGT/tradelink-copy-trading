import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { PLATFORM_CAPABILITIES } from "@/lib/types";
import type { BrokerAccountInfo, BrokerConnector, BrokerInstrumentSpec, BrokerPosition, CloseResult, ModifyResult, OrderRequest, OrderResult } from "./connector";

const HEARTBEAT_TTL_MS = 20_000;
const COMMAND_TTL_MS = 20_000;
const EXECUTION_TIMEOUT_MS = 18_000;

export class TerminalBridgeConnector implements BrokerConnector {
  readonly broker: "mt4" | "mt5";
  private authorized = false;
  private accountId: string;

  constructor(broker: "mt4" | "mt5", accountId: string) {
    this.broker = broker;
    this.accountId = accountId;
  }

  async authorize() {
    const bridge = await this.getFreshBridge();
    if (bridge.brokerAccount.brokerCode !== this.broker) return { success: false, reason: "Terminal type does not match the linked account" };
    this.authorized = true;
    return { success: true, accountId: bridge.brokerAccount.externalAccountId ?? undefined };
  }

  async disconnect() { this.authorized = false; }
  isAuthorized() { return this.authorized; }

  private async getFreshBridge() {
    const bridge = await db.terminalBridge.findUnique({
      where: { brokerAccountId: this.accountId },
      include: { brokerAccount: true },
    });
    if (!bridge || bridge.status !== "connected" || !bridge.lastHeartbeatAt || Date.now() - bridge.lastHeartbeatAt.getTime() > HEARTBEAT_TTL_MS) {
      throw new Error("MetaTrader terminal bridge is offline");
    }
    if (bridge.brokerAccount.brokerCode !== this.broker) throw new Error("MetaTrader terminal type mismatch");
    return bridge;
  }

  async getAccountInfo(): Promise<BrokerAccountInfo> {
    const bridge = await this.getFreshBridge();
    const a = bridge.brokerAccount;
    return {
      accountId: a.externalAccountId ?? a.id, broker: this.broker, currency: a.currency,
      balance: a.balance, equity: a.equity, margin: a.margin, freeMargin: a.freeMargin,
      leverage: a.leverage ?? 1, accountType: (a.accountType === "netting" ? "netting" : "hedging"), isDemo: a.isDemo,
    };
  }

  async getOpenPositions(): Promise<BrokerPosition[]> {
    const bridge = await this.getFreshBridge();
    const rows = await db.terminalBridgePosition.findMany({ where: { bridgeId: bridge.id }, orderBy: { openTime: "asc" } });
    return rows.map((p) => ({
      positionId: p.externalPositionId, instrument: p.instrument,
      direction: p.direction === "SELL" ? "SELL" : "BUY", volume: p.volume,
      entryPrice: p.entryPrice, currentPrice: p.currentPrice, stopLoss: p.stopLoss ?? undefined,
      takeProfit: p.takeProfit ?? undefined, swap: p.swap, commission: p.commission,
      unrealizedProfit: p.unrealizedProfit, openTime: p.openTime,
    }));
  }

  async getInstrumentSpec(symbol: string): Promise<BrokerInstrumentSpec | null> {
    await this.getFreshBridge();
    const spec = await db.instrumentSpec.findUnique({ where: { brokerCode_symbol: { brokerCode: this.broker, symbol } } });
    if (!spec) return null;
    return { ...spec, tradingHours: spec.tradingHours ?? undefined, marginRequired: spec.marginRequired ?? undefined, executionModel: spec.executionModel as BrokerInstrumentSpec["executionModel"] };
  }

  private async execute(commandType: "open" | "close" | "modify", payload: Record<string, unknown>, idempotencyKey: string = randomUUID()): Promise<Record<string, unknown>> {
    const bridge = await this.getFreshBridge();
    let command = await db.terminalBridgeCommand.findUnique({ where: { idempotencyKey } });
    if (command) {
      if (command.bridgeId !== bridge.id || command.commandType !== commandType || command.payload !== JSON.stringify(payload)) {
        throw new Error("Idempotency key was already used for a different terminal command");
      }
    } else {
      try {
        command = await db.terminalBridgeCommand.create({ data: {
          bridgeId: bridge.id, idempotencyKey, commandType, payload: JSON.stringify(payload),
          expiresAt: new Date(Date.now() + COMMAND_TTL_MS),
        } });
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
        command = await db.terminalBridgeCommand.findUnique({ where: { idempotencyKey } });
        if (!command || command.bridgeId !== bridge.id || command.commandType !== commandType || command.payload !== JSON.stringify(payload)) {
          throw new Error("Conflicting terminal command used the same idempotency key");
        }
      }
    }
    if (!command) throw new Error("Terminal command could not be created");
    if (command.status === "completed" || command.status === "rejected") {
      const result = command.result ? JSON.parse(command.result) as Record<string, unknown> : {};
      if (command.status === "rejected") throw new Error(String(result.message ?? "Terminal rejected the command"));
      return result;
    }
    if (command.status === "expired") throw new Error("Terminal command outcome is unknown because it expired; reconcile the account before retrying");
    const deadline = Date.now() + EXECUTION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = await db.terminalBridgeCommand.findUnique({ where: { id: command.id } });
      if (current?.status === "completed" || current?.status === "rejected") {
        const result = current.result ? JSON.parse(current.result) as Record<string, unknown> : {};
        if (current.status === "rejected") throw new Error(String(result.message ?? "Terminal rejected the command"));
        return result;
      }
      if (current?.status === "expired") throw new Error("Terminal command expired before execution");
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error("Terminal did not acknowledge the command in time; its outcome is unknown and the same command key must be reused after reconciliation");
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    if (req.orderType !== "market") return { success: false, rejectionReason: "The terminal bridge currently supports market orders only" };
    try {
      const result = await this.execute("open", { instrument: req.instrument, direction: req.direction, volume: req.volume, stopLoss: req.stopLoss ?? 0, takeProfit: req.takeProfit ?? 0 }, req.idempotencyKey);
      return { success: true, orderId: String(result.orderId ?? ""), positionId: String(result.positionId ?? result.orderId ?? ""), executedPrice: Number(result.price), executedVolume: Number(result.volume ?? req.volume) };
    } catch (error) {
      return { success: false, rejectionReason: error instanceof Error ? error.message : "Terminal execution failed" };
    }
  }

  async modifyPosition(positionId: string, updates: { stopLoss?: number; takeProfit?: number; volume?: number }, idempotencyKey?: string): Promise<ModifyResult> {
    try {
      await this.execute("modify", { positionId, stopLoss: updates.stopLoss ?? 0, takeProfit: updates.takeProfit ?? 0 }, idempotencyKey);
      return { success: true };
    } catch (error) {
      return { success: false, rejectionReason: error instanceof Error ? error.message : "Terminal modification failed" };
    }
  }

  async closePosition(positionId: string, volume?: number, idempotencyKey?: string): Promise<CloseResult> {
    try {
      const result = await this.execute("close", { positionId, volume: volume ?? 0 }, idempotencyKey);
      return { success: true, closedVolume: Number(result.volume ?? volume ?? 0), closedPrice: Number(result.price), realizedProfit: Number(result.profit ?? 0) };
    } catch (error) {
      return { success: false, rejectionReason: error instanceof Error ? error.message : "Terminal close failed" };
    }
  }

  capabilities() { return PLATFORM_CAPABILITIES[this.broker]; }
}
