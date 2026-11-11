import type { BrokerAccountInfo, BrokerConnector, BrokerInstrumentSpec, BrokerPosition, CloseResult, ModifyResult, OrderRequest, OrderResult } from "./connector";
import type { IntegrationCapability } from "@/lib/types";
import { PLATFORM_CAPABILITIES } from "@/lib/types";

type DerivAuth = { accessToken: string; expiresAt?: number; accountId: string; isDemo?: boolean };

/** Read-only monitor for Deriv's Options product. Options stakes/contracts are
 * deliberately not represented as FX lots and cannot be executed by this adapter. */
export class DerivOptionsConnector implements BrokerConnector {
  readonly broker = "deriv" as const;
  private auth?: DerivAuth;

  async authorize(credentials: any) {
    const auth = credentials?.auth as DerivAuth | undefined;
    if (!auth?.accessToken || !auth.accountId) return { success: false, reason: "Deriv OAuth account credentials are missing" };
    if (auth.expiresAt && auth.expiresAt <= Date.now()) return { success: false, reason: "Deriv access token expired; reconnect the account" };
    this.auth = auth;
    return { success: true, accountId: auth.accountId };
  }

  async disconnect() { this.auth = undefined; }
  isAuthorized() { return !!this.auth; }
  capabilities(): IntegrationCapability { return PLATFORM_CAPABILITIES.deriv; }

  async getAccountInfo(): Promise<BrokerAccountInfo> {
    const result = await this.request({ balance: 1 });
    const balance = Number(result.balance?.balance ?? 0);
    const currency = String(result.balance?.currency ?? "USD");
    if (!Number.isFinite(balance)) throw new Error("Deriv returned an invalid account balance");
    return { accountId: this.auth!.accountId, broker: "deriv", currency, balance, equity: balance, margin: 0,
      freeMargin: balance, leverage: 1, accountType: "hedging", isDemo: this.auth!.isDemo ?? false };
  }

  async getOpenPositions(): Promise<BrokerPosition[]> {
    const result = await this.request({ portfolio: 1 });
    const contracts = Array.isArray(result.portfolio?.contracts) ? result.portfolio.contracts : [];
    return contracts.map((contract: any) => {
      const type = String(contract.contract_type ?? "").toUpperCase();
      const direction = /DOWN|PUT|BEAR|SELL/.test(type) ? "SELL" : /UP|CALL|BULL|BUY/.test(type) ? "BUY" : null;
      const id = String(contract.contract_id ?? "");
      const symbol = String(contract.underlying_symbol ?? "");
      const entry = Number(contract.entry_spot);
      const stake = Number(contract.buy_price);
      const opened = Number(contract.date_start);
      if (!id || !symbol || !direction || !Number.isFinite(entry) || !Number.isFinite(stake)) return null;
      return {
        positionId: id, instrument: symbol, direction, volume: stake, entryPrice: entry,
        currentPrice: Number.isFinite(Number(contract.current_spot)) ? Number(contract.current_spot) : undefined,
        stopLoss: undefined, takeProfit: undefined, swap: 0, commission: 0,
        unrealizedProfit: Number(contract.profit ?? 0), openTime: new Date(Number.isFinite(opened) ? opened * 1000 : Date.now()),
        productMetadata: {
          product: "deriv_options", contractId: id, contractType: type,
          currency: String(contract.currency ?? ""), stake, volumeUnit: "stake",
          expiryEpoch: Number(contract.date_expiry ?? 0) || null,
          longcode: String(contract.longcode ?? ""),
        },
      } satisfies BrokerPosition;
    }).filter((position: BrokerPosition | null): position is BrokerPosition => !!position);
  }

  async getInstrumentSpec(_symbol: string): Promise<BrokerInstrumentSpec | null> { return null; }
  async placeOrder(_req: OrderRequest): Promise<OrderResult> {
    return { success: false, rejectionReason: "Deriv Options execution is not enabled: contract type, expiry and stake cannot be safely mapped to FX lot orders" };
  }
  async modifyPosition(_positionId: string, _updates: { stopLoss?: number; takeProfit?: number; volume?: number }): Promise<ModifyResult> {
    return { success: false, rejectionReason: "Deriv Options modification is not implemented" };
  }
  async closePosition(_positionId: string, _volume?: number): Promise<CloseResult> {
    return { success: false, rejectionReason: "Deriv Options close is not implemented" };
  }

  private async request(payload: Record<string, unknown>): Promise<Record<string, any>> {
    if (!this.auth) throw new Error("Deriv account is not authorized");
    if (this.auth.expiresAt && this.auth.expiresAt <= Date.now()) throw new Error("Deriv access token expired; reconnect the account");
    const accountId = encodeURIComponent(this.auth.accountId);
    const otpResponse = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
      method: "POST", headers: { authorization: `Bearer ${this.auth.accessToken}` },
      signal: AbortSignal.timeout(12_000), cache: "no-store",
    });
    const otp = await otpResponse.json().catch(() => ({})) as Record<string, any>;
    const wsUrl = otp?.data?.url;
    if (!otpResponse.ok || typeof wsUrl !== "string" || !wsUrl.startsWith("wss://api.derivws.com/trading/v1/options/ws/")) {
      throw new Error(`Deriv account session could not be established (HTTP ${otpResponse.status})`);
    }
    const WebSocketConstructor = (globalThis as any).WebSocket as (new (url: string) => any) | undefined;
    if (!WebSocketConstructor) throw new Error("WebSocket is not available in this Node.js runtime");
    const socket = new WebSocketConstructor(wsUrl);
    const reqId = Math.floor(Math.random() * 2_000_000_000) + 1;
    try {
      return await new Promise<Record<string, any>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Deriv account request timed out")), 12_000);
        const finish = (error?: Error, data?: Record<string, any>) => {
          clearTimeout(timer);
          try { socket.close(); } catch { /* ignore close failure */ }
          error ? reject(error) : resolve(data ?? {});
        };
        socket.addEventListener("open", () => socket.send(JSON.stringify({ ...payload, req_id: reqId })));
        socket.addEventListener("message", (event: MessageEvent) => {
          try {
            const message = JSON.parse(String(event.data));
            if (message.req_id !== reqId) return;
            if (message.error) return finish(new Error(String(message.error.message ?? "Deriv request failed")));
            finish(undefined, message);
          } catch { finish(new Error("Deriv returned an invalid WebSocket response")); }
        });
        socket.addEventListener("error", () => finish(new Error("Deriv WebSocket connection failed")));
        socket.addEventListener("close", () => finish(new Error("Deriv closed the account session unexpectedly")));
      });
    } catch (error) {
      try { socket.close(); } catch { /* ignore close failure */ }
      throw error;
    }
  }
}
