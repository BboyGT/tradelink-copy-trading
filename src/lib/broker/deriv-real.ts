// TRADE LINK — Real Deriv API Connector
//
// This connector implements the BrokerConnector interface using the real
// Deriv API. It uses:
//   - OAuth 2.0 for account authorization (user grants access via Deriv)
//   - Deriv WebSocket API for real-time account info, positions, and trade execution
//   - REST API fallback for historical data
//
// ACTIVATION:
//   Set these environment variables in .env.local:
//     DERIV_APP_ID=your_app_id          # Get one at https://api.deriv.com
//     DERIV_CLIENT_SECRET=your_secret   # For server-side OAuth
//     DERIV_REDIRECT_URI=http://localhost:3000/api/brokers/deriv/callback
//
//   When DERIV_APP_ID is set, the broker route uses this real connector.
//   When not set, it falls back to the mock DerivConnector.
//
// WHAT YOU NEED TO DO:
//   1. Go to https://api.deriv.com and register an application
//   2. Get your App ID and (optionally) OAuth client secret
//   3. Set the redirect URI to: http://localhost:3000/api/brokers/deriv/callback
//      (or your production URL)
//   4. Add the env vars to .env.local
//   5. Restart the dev server
//
// The connector then:
//   - Redirects the user to Deriv's OAuth consent page when they click "Connect"
//   - Receives an authorization code at the callback URL
//   - Exchanges it for an access token
//   - Stores the token (encrypted) in BrokerAccount.authRef
//   - Uses the token for all subsequent API calls (balance, positions, trade)

import type { BrokerConnector, BrokerAccountInfo, BrokerPosition, BrokerInstrumentSpec, OrderRequest, OrderResult, CloseResult, ModifyResult } from "./connector";
import type { IntegrationCapability } from "@/lib/types";
import { PLATFORM_CAPABILITIES } from "@/lib/types";

const DERIV_API_URL = "https://api.deriv.com";
const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3";

/**
 * Real Deriv API connector.
 * Implements the same BrokerConnector interface as the mock — drop-in replacement.
 */
export class DerivRealConnector implements BrokerConnector {
  readonly broker = "deriv" as const;
  private accessToken: string | null = null;
  private accountId: string | null = null;
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, (data: any) => void> = new Map();
  private reqId = 1;

  constructor(accessToken?: string, accountId?: string) {
    this.accessToken = accessToken ?? null;
    this.accountId = accountId ?? null;
  }

  /**
   * Generate the OAuth authorization URL for Deriv.
   * Redirect the user here to get consent, then Deriv redirects back with a code.
   */
  static getOAuthUrl(state: string): string {
    const appId = process.env.DERIV_APP_ID;
    if (!appId) {
      throw new Error("DERIV_APP_ID environment variable not set. Get one at https://api.deriv.com");
    }
    const redirectUri = process.env.DERIV_REDIRECT_URI ?? "http://localhost:3000/api/brokers/deriv/callback";
    const params = new URLSearchParams({
      app_id: appId,
      l: "EN", // language
      brand: "deriv",
      date_first_contact: new Date().toISOString().slice(0, 10),
      signup_device: "desktop",
      state,
    });
    return `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange OAuth authorization code for an access token.
   * Called by the callback handler after the user grants access on Deriv's site.
   */
  static async exchangeCodeForToken(code: string): Promise<{ accessToken: string; accountId: string } | null> {
    const appId = process.env.DERIV_APP_ID;
    const secret = process.env.DERIV_CLIENT_SECRET;
    const redirectUri = process.env.DERIV_REDIRECT_URI ?? "http://localhost:3000/api/brokers/deriv/callback";

    if (!appId || !secret) {
      throw new Error("DERIV_APP_ID and DERIV_CLIENT_SECRET must be set for OAuth token exchange");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: appId,
      client_secret: secret,
      redirect_uri: redirectUri,
    });

    const res = await fetch("https://oauth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      console.error("[deriv] token exchange failed:", await res.text());
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      accountId: data.account_id ?? "",
    };
  }

  /**
   * Authorize using a stored access token.
   * In production, the token would come from encrypted storage.
   */
  async authorize(credentials: any): Promise<{ success: boolean; accountId?: string; reason?: string }> {
    const token = credentials.accessToken ?? credentials.token;
    if (!token) {
      return { success: false, reason: "No access token provided. Complete OAuth flow first." };
    }
    this.accessToken = token;

    // Open WebSocket connection to Deriv
    const appId = process.env.DERIV_APP_ID ?? "1089"; // 1089 is Deriv's test app_id
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(`${DERIV_WS_URL}?app_id=${appId}`);
        this.ws.onopen = () => {
          // Send authorize request
          const reqId = String(this.reqId++);
          this.ws!.send(JSON.stringify({ authorize: 1, req_id: reqId }));
          this.pendingRequests.set(reqId, (data: any) => {
            if (data.error) {
              resolve({ success: false, reason: data.error.message });
            } else {
              this.accountId = data.authorize.account_list?.[0]?.loginid ?? data.authorize.loginid;
              resolve({ success: true, accountId: this.accountId ?? undefined });
            }
          });
        };
        this.ws.onerror = () => {
          resolve({ success: false, reason: "WebSocket connection failed" });
        };
        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.req_id && this.pendingRequests.has(data.req_id)) {
            this.pendingRequests.get(data.req_id)!(data);
            this.pendingRequests.delete(data.req_id);
          }
        };
        // Timeout after 10s
        setTimeout(() => resolve({ success: false, reason: "Authorization timeout" }), 10000);
      } catch (e: any) {
        resolve({ success: false, reason: e.message });
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.accessToken = null;
    this.accountId = null;
    this.pendingRequests.clear();
  }

  isAuthorized(): boolean {
    return this.accessToken !== null && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Send a request to Deriv's WebSocket API and wait for the response.
   */
  private sendRequest(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const reqId = String(this.reqId++);
      this.ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      this.pendingRequests.set(reqId, (data: any) => {
        if (data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data);
        }
      });
      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error("Request timeout"));
        }
      }, 10000);
    });
  }

  async getAccountInfo(): Promise<BrokerAccountInfo> {
    if (!this.isAuthorized()) throw new Error("Not authorized");
    const res = await this.sendRequest({ balance: 1, subscribe: 0 });
    const b = res.balance;
    return {
      accountId: this.accountId!,
      broker: this.broker,
      currency: b.currency,
      balance: b.balance,
      // Deriv's balance API doesn't expose equity separately from balance,
      // so we treat the reported balance as the equity too. This is accurate
      // when no positions are open; for open positions Deriv's `portfolio`
      // endpoint provides per-contract profit which the caller can aggregate.
      equity: b.balance,
      margin: 0, // Not available in balance response
      freeMargin: b.balance,
      leverage: 1000, // Deriv default; varies per instrument
      accountType: "hedging",
      isDemo: this.accountId?.startsWith("CR") === false, // CR prefix = real money
    };
  }

  async getOpenPositions(): Promise<BrokerPosition[]> {
    if (!this.isAuthorized()) throw new Error("Not authorized");
    const res = await this.sendRequest({
      portfolio: 1,
      // contract_types: ["CALL", "PUT", "MULTUP", "MULTDOWN"],
    });
    const contracts = res.portfolio?.contracts ?? [];
    return contracts.map((c: any) => ({
      positionId: c.contract_id,
      instrument: c.underlying,
      direction: c.contract_type === "CALL" || c.contract_type === "MULTUP" ? "BUY" : "SELL",
      volume: c.amount,
      entryPrice: c.entry_spot ?? 0,
      currentPrice: 0,
      swap: 0,
      commission: 0,
      unrealizedProfit: c.profit ?? 0,
      openTime: new Date(c.purchase_time * 1000),
    }));
  }

  async getInstrumentSpec(symbol: string): Promise<BrokerInstrumentSpec | null> {
    // Deriv uses "R_" for synthetics, "frx" for forex
    // This is a simplified mapping; in production you'd query Deriv's active_symbols
    const known: Record<string, BrokerInstrumentSpec> = {
      XAUUSD: { symbol: "XAUUSD", assetClass: "metal", contractSize: 100, tickSize: 0.01, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market" },
      EURUSD: { symbol: "EURUSD", assetClass: "forex", contractSize: 100000, tickSize: 0.00001, tickValue: 1, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, executionModel: "market" },
      // Deriv synthetic indices use different symbols (R_10, R_25, BOOM500, CRASH500)
    };
    return known[symbol] ?? null;
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    if (!this.isAuthorized()) throw new Error("Not authorized");

    // Deriv's trade execution is different from traditional brokers.
    // For forex/CFDs, you use the "proposal" + "buy" flow.
    // For simplicity, this implements the CFD buy flow.
    const proposalRes = await this.sendRequest({
      proposal: 1,
      amount: 100, // stake amount in account currency
      basis: "stake",
      contract_type: req.direction === "BUY" ? "CALL" : "PUT",
      symbol: req.instrument,
      duration: 60, // 60 ticks
      duration_unit: "ticks",
      currency: "USD",
    });

    const proposalId = proposalRes.proposal.id;
    const buyRes = await this.sendRequest({
      buy: proposalId,
      price: proposalRes.proposal.ask_price,
    });

    return {
      success: true,
      orderId: String(buyRes.buy.transaction_id),
      positionId: String(buyRes.buy.contract_id),
      executedPrice: buyRes.buy.purchase_time ? buyRes.buy.purchase_time : undefined,
      executedVolume: req.volume,
    };
  }

  async modifyPosition(positionId: string, updates: { stopLoss?: number; takeProfit?: number; volume?: number }): Promise<ModifyResult> {
    // Deriv doesn't support modifying stop-loss/take-profit on existing contracts.
    // You'd need to close and reopen with new parameters.
    return { success: false, rejectionReason: "Deriv API does not support position modification. Close and reopen instead." };
  }

  async closePosition(positionId: string, volume?: number): Promise<CloseResult> {
    if (!this.isAuthorized()) throw new Error("Not authorized");
    const res = await this.sendRequest({ sell: positionId, price: 0 });
    return {
      success: true,
      closedVolume: volume,
      closedPrice: res.sell.sold_for,
      realizedProfit: res.sell.profit ?? (res.sell.sold_for - res.sell.buy_price),
    };
  }

  capabilities(): IntegrationCapability {
    return PLATFORM_CAPABILITIES.deriv;
  }
}
