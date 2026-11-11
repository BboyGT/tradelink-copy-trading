import { randomUUID } from "crypto";
import type { BrokerAccountInfo, BrokerConnector, BrokerInstrumentSpec, BrokerPosition, CloseResult, ModifyResult, OrderRequest, OrderResult } from "./connector";
import type { BrokerCode, IntegrationCapability } from "@/lib/types";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

type Json = Record<string, any>;
export type CTraderAuth = Json & { accessToken?: string; refreshToken?: string; expiresAt?: number; ctidTraderAccountId?: string; isLive?: boolean };
type RequestSpec = { payloadType: number; expectedType: number; payload: Json };
function amount(value: unknown, digits: unknown) {
  const n = Number(value ?? 0);
  const scale = Math.max(0, Math.min(12, Number(digits ?? 0)));
  return Number.isFinite(n) ? n / 10 ** scale : 0;
}

function numberField(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`cTrader returned invalid ${label}`);
  return n;
}

async function openApiRequests(auth: CTraderAuth, requests: RequestSpec[]): Promise<Json[]> {
  const WebSocketConstructor = globalThis.WebSocket;
  if (!WebSocketConstructor) throw new Error("WebSocket is not available in this Node.js runtime");
  const host = auth.isLive ? "wss://live.ctraderapi.com:5036" : "wss://demo.ctraderapi.com:5036";
  const socket = new WebSocketConstructor(host);
  const accountId = String(auth.ctidTraderAccountId ?? "");
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  if (!accountId || !auth.accessToken || !clientId || !clientSecret) throw new Error("cTrader account or application credentials are missing");

  return new Promise<Json[]>((resolve, reject) => {
    const requestIds = requests.map(() => randomUUID());
    const results = new Map<string, Json>();
    let stage: "application" | "account" | "requests" = "application";
    let settled = false;
    const timer = setTimeout(() => finish(new Error("cTrader Open API request timed out")), 12_000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error);
      else resolve(requestIds.map((id) => results.get(id)!));
    };
    const send = (clientMsgId: string, payloadType: number, payload: Json) => {
      socket.send(JSON.stringify({ clientMsgId, payloadType, payload }));
    };

    socket.addEventListener("open", () => {
      send("app-auth", 2100, { clientId, clientSecret });
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as Json;
        const type = Number(message.payloadType);
        const payload = (message.payload ?? message) as Json;
        if (type === 50 || type === 2142) throw new Error(String(payload.description ?? payload.errorCode ?? "cTrader request failed"));
        if (stage === "application" && type === 2101) {
          stage = "account";
          send("account-auth", 2102, { ctidTraderAccountId: accountId, accessToken: auth.accessToken });
          return;
        }
        if (stage === "account" && type === 2103) {
          if (String(payload.ctidTraderAccountId) !== accountId) throw new Error("cTrader authorized a different account than the selected account");
          stage = "requests";
          requests.forEach((request, index) => send(requestIds[index], request.payloadType, request.payload));
          if (requests.length === 0) finish();
          return;
        }
        if (stage !== "requests") return;
        const clientMsgId = String(message.clientMsgId ?? "");
        const requestIndex = requestIds.indexOf(clientMsgId);
        if (requestIndex < 0) return;
        if (type !== requests[requestIndex].expectedType) return;
        results.set(clientMsgId, payload);
        if (results.size === requests.length) finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("cTrader returned an invalid response"));
      }
    });
    socket.addEventListener("error", () => finish(new Error("Could not connect to the cTrader Open API")));
    socket.addEventListener("close", () => {
      if (!settled) finish(new Error("cTrader closed the session before completing the request"));
    });
  });
}

export class CTraderOpenApiConnector implements BrokerConnector {
  readonly broker: BrokerCode = "ctrader";
  private auth: CTraderAuth | null = null;
  private authorized = false;
  private symbols: Json[] = [];
  private symbolsLoadedAt = 0;
  private accountRecordId?: string;
  private tokenRefresh?: Promise<void>;

  constructor(accountRecordId?: string) { this.accountRecordId = accountRecordId; }

  replaceAuth(auth: CTraderAuth) { this.auth = auth; this.authorized = true; }

  async authorize(credentials: Json): Promise<{ success: boolean; accountId?: string; reason?: string }> {
    try {
      this.auth = credentials.auth as CTraderAuth;
      if (!this.auth?.accessToken || !this.auth.ctidTraderAccountId || typeof this.auth.isLive !== "boolean") {
        return { success: false, reason: "Encrypted cTrader account authorization is missing" };
      }
      await this.ensureToken();
      await openApiRequests(this.auth, []);
      this.authorized = true;
      return { success: true, accountId: this.auth.ctidTraderAccountId };
    } catch (error) {
      return { success: false, reason: error instanceof Error ? error.message : "cTrader authorization failed" };
    }
  }

  async disconnect() { this.authorized = false; }
  isAuthorized() { return this.authorized; }

  private async ensureToken() {
    if (!this.auth) throw new Error("cTrader account is not authorized");
    if (Number(this.auth.expiresAt ?? 0) > Date.now() + 60_000) return;
    if (this.tokenRefresh) return this.tokenRefresh;
    this.tokenRefresh = this.refreshToken();
    try { await this.tokenRefresh; }
    finally { this.tokenRefresh = undefined; }
  }

  private async refreshToken() {
    if (!this.auth) throw new Error("cTrader account is not authorized");
    const clientId = process.env.CTRADER_CLIENT_ID;
    const clientSecret = process.env.CTRADER_CLIENT_SECRET;
    if (!clientId || !clientSecret || !this.auth.refreshToken) throw new Error("cTrader access token expired; reconnect the account");
    const url = new URL("https://openapi.ctrader.com/apps/token");
    for (const [key, value] of Object.entries({ grant_type: "refresh_token", refresh_token: this.auth.refreshToken, client_id: clientId, client_secret: clientSecret })) url.searchParams.set(key, value);
    const response = await fetch(url, { method: "GET", headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const renewed = await response.json().catch(() => ({})) as Json;
    if (!response.ok || !renewed.accessToken || !renewed.refreshToken) throw new Error("cTrader token refresh failed; reconnect the account");
    this.auth = { ...this.auth, ...renewed, expiresAt: Date.now() + Number(renewed.expiresIn ?? 0) * 1000 };
    if (this.accountRecordId) await db.brokerAccount.update({ where: { id: this.accountRecordId }, data: { authRef: encrypt(JSON.stringify(this.auth)) } });
  }

  private async request(requests: RequestSpec[]) {
    if (!this.authorized || !this.auth) throw new Error("cTrader account is not authorized");
    await this.ensureToken();
    return openApiRequests(this.auth, requests.map((request) => ({ ...request, payload: { ...request.payload, ctidTraderAccountId: this.auth!.ctidTraderAccountId } })));
  }

  private async symbolCatalog(requiredIds?: string[]) {
    const cachedIds = new Set(this.symbols.map((symbol) => String(symbol.symbolId)));
    if (Date.now() - this.symbolsLoadedAt < 60_000 && this.symbols.length && (!requiredIds || requiredIds.every((id) => cachedIds.has(id)))) return this.symbols;
    const [light] = await this.request([{ payloadType: 2114, expectedType: 2115, payload: {} }]);
    const lightSymbols = Array.isArray(light.symbol) ? light.symbol as Json[] : [];
    if (!lightSymbols.length) throw new Error("cTrader returned no tradable symbols");
    const wanted = requiredIds ? new Set(requiredIds) : undefined;
    const selected = wanted ? lightSymbols.filter((symbol) => wanted.has(String(symbol.symbolId))) : lightSymbols;
    if (wanted && selected.length !== wanted.size) throw new Error("cTrader could not resolve all symbols for current positions");
    const [full] = await this.request([{ payloadType: 2116, expectedType: 2117, payload: { symbolId: selected.map((symbol) => String(symbol.symbolId)) } }]);
    const newSymbols = Array.isArray(full.symbol) ? full.symbol as Json[] : [];
    this.symbols = [...new Map<string, Json>([...this.symbols, ...newSymbols].map((symbol): [string, Json] => [String(symbol.symbolId), symbol])).values()];
    this.symbolsLoadedAt = Date.now();
    return this.symbols;
  }

  async getAccountInfo(): Promise<BrokerAccountInfo> {
    const [traderResult, reconcileResult, pnlResult, assetResult] = await this.request([
      { payloadType: 2121, expectedType: 2122, payload: {} },
      { payloadType: 2124, expectedType: 2125, payload: {} },
      { payloadType: 2187, expectedType: 2188, payload: {} },
      { payloadType: 2112, expectedType: 2113, payload: {} },
    ]);
    const trader = traderResult.trader as Json;
    if (!trader) throw new Error("cTrader did not return account details");
    const assets = Array.isArray(assetResult.asset) ? assetResult.asset as Json[] : [];
    const asset = assets.find((item) => String(item.assetId) === String(trader.depositAssetId));
    const positions = Array.isArray(reconcileResult.position) ? reconcileResult.position as Json[] : [];
    const pnl = Array.isArray(pnlResult.positionUnrealizedPnL) ? pnlResult.positionUnrealizedPnL as Json[] : [];
    const digits = Number(pnlResult.moneyDigits ?? trader.moneyDigits ?? 0);
    const equity = amount(trader.balance, trader.moneyDigits) + pnl.reduce((sum, row) => sum + amount(row.netUnrealizedPnL, digits), 0);
    const margin = positions.reduce((sum, row) => sum + amount(row.usedMargin, row.moneyDigits ?? trader.moneyDigits), 0);
    return {
      accountId: String(this.auth!.ctidTraderAccountId), broker: this.broker,
      currency: String(asset?.name ?? "N/A"), balance: amount(trader.balance, trader.moneyDigits), equity,
      margin, freeMargin: equity - margin, leverage: Number(trader.leverageInCents ?? 0) / 100,
      accountType: Number(trader.accountType) === 1 ? "netting" : "hedging", isDemo: !this.auth!.isLive,
    };
  }

  async getOpenPositions(): Promise<BrokerPosition[]> {
    const [reconcile, pnlResult] = await this.request([
      { payloadType: 2124, expectedType: 2125, payload: {} },
      { payloadType: 2187, expectedType: 2188, payload: {} },
    ]);
    const positions = Array.isArray(reconcile.position) ? reconcile.position as Json[] : [];
    if (!positions.length) return [];
    const symbols = await this.symbolCatalog([...new Set(positions.map((position) => String((position.tradeData as Json).symbolId)))]);
    const pnl = new Map<string, number>((Array.isArray(pnlResult.positionUnrealizedPnL) ? pnlResult.positionUnrealizedPnL as Json[] : []).map((row): [string, number] => [String(row.positionId), amount(row.netUnrealizedPnL, pnlResult.moneyDigits)]));
    return positions.map((position) => {
      const trade = position.tradeData as Json;
      const symbol = symbols.find((entry) => String(entry.symbolId) === String(trade.symbolId));
      if (!symbol) throw new Error(`cTrader symbol ${trade.symbolId} is missing metadata; refusing to copy this position`);
      const lotSize = numberField(symbol.lotSize, `lot size for ${symbol.symbolName ?? symbol.name}`);
      const instrument = String(symbol.symbolName ?? symbol.name ?? "").replaceAll("/", "");
      if (!instrument) throw new Error("cTrader returned a symbol without a name");
      const volume = Number(trade.volume) / lotSize;
      if (!Number.isFinite(volume) || volume <= 0) throw new Error(`cTrader returned an invalid position volume for ${instrument}`);
      const entryPrice = Number(position.price);
      return {
        positionId: String(position.positionId), instrument,
        direction: Number(trade.tradeSide) === 2 ? "SELL" as const : "BUY" as const,
        volume, entryPrice, currentPrice: entryPrice,
        stopLoss: position.stopLoss == null ? undefined : Number(position.stopLoss),
        takeProfit: position.takeProfit == null ? undefined : Number(position.takeProfit),
        swap: amount(position.swap, position.moneyDigits), commission: amount(position.commission, position.moneyDigits),
        unrealizedProfit: pnl.get(String(position.positionId)) ?? 0,
        openTime: new Date(Number(trade.openTimestamp ?? Date.now())),
      };
    });
  }

  async getInstrumentSpec(symbolName: string): Promise<BrokerInstrumentSpec | null> {
    const normalized = symbolName.replaceAll("/", "").toUpperCase();
    const cached = this.symbols.find((entry) => String(entry.symbolName ?? entry.name ?? "").replaceAll("/", "").toUpperCase() === normalized);
    let symbol = cached;
    if (!symbol) {
      const [light] = await this.request([{ payloadType: 2114, expectedType: 2115, payload: {} }]);
      const lightSymbols = Array.isArray(light.symbol) ? light.symbol as Json[] : [];
      const match = lightSymbols.find((entry) => String(entry.symbolName ?? entry.name ?? "").replaceAll("/", "").toUpperCase() === normalized);
      if (!match) return null;
      symbol = (await this.symbolCatalog([String(match.symbolId)])).find((entry) => String(entry.symbolId) === String(match.symbolId));
    }
    if (!symbol) return null;
    const lotSize = numberField(symbol.lotSize, `lot size for ${symbolName}`);
    const minVolume = Number(symbol.minVolume ?? 0) / lotSize;
    const maxVolume = Number(symbol.maxVolume ?? 0) / lotSize;
    const volumeStep = Number(symbol.stepVolume ?? 0) / lotSize;
    if (![minVolume, maxVolume, volumeStep].every((n) => Number.isFinite(n) && n > 0)) throw new Error(`cTrader returned invalid volume rules for ${symbolName}`);
    const digits = Number(symbol.digits ?? 5);
    return {
      symbol: String(symbol.symbolName ?? symbol.name), assetClass: "unknown", contractSize: lotSize / 100,
      tickSize: 10 ** -digits, tickValue: 0, minVolume, maxVolume, volumeStep,
      executionModel: "market",
    };
  }

  async placeOrder(_request: OrderRequest): Promise<OrderResult> { return { success: false, rejectionReason: "cTrader execution is not enabled until the live fill and protection flow is completed" }; }
  async modifyPosition(_positionId: string, _updates: { stopLoss?: number; takeProfit?: number; volume?: number }, _idempotencyKey?: string): Promise<ModifyResult> { return { success: false, rejectionReason: "cTrader position modification is not implemented" }; }
  async closePosition(_positionId: string, _volume?: number, _idempotencyKey?: string): Promise<CloseResult> { return { success: false, rejectionReason: "cTrader position closure is not implemented" }; }

  capabilities(): IntegrationCapability {
    return {
      providerDiscovery: false, providerStatistics: false, historicalTrades: false, liveTradeEvents: false,
      openPositions: true, stopLossInfo: true, takeProfitInfo: true, partialClosures: true,
      tradeExecution: false, positionModification: false, positionClosure: false,
      accountEquity: true, accountBalance: true, streamingMode: "periodic",
      notes: "OAuth account authorization, account data, and open position monitoring are available; destination execution is disabled pending tested fill/protection handling",
    };
  }
}

export async function loadCTraderAuth(accountId: string) {
  const account = await db.brokerAccount.findFirst({ where: { id: accountId, brokerCode: "ctrader", status: "connected" } });
  if (!account?.authRef) throw new Error("cTrader authorization is missing; reconnect the account");
  try { return JSON.parse(decrypt(account.authRef)) as CTraderAuth; }
  catch { throw new Error("Stored cTrader authorization cannot be decrypted; reconnect the account"); }
}
