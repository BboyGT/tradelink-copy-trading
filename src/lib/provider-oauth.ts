import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/auth";
import { CTraderOpenApiConnector } from "@/lib/broker/ctrader-open-api";

export type OAuthProvider = "deriv" | "ctrader" | "fxcm";
const COOKIE = "broker_oauth_tx";
const MAX_AGE_SECONDS = 600;

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 32) throw new Error("NEXTAUTH_SECRET must contain at least 32 characters");
  return value;
}

function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }

function callbackUri(provider: OAuthProvider, origin: string) {
  const configured = process.env[`${provider.toUpperCase()}_REDIRECT_URI`];
  const expected = new URL(`/api/brokers/${provider}/callback`, origin).toString();
  if (configured && new URL(configured).toString() !== expected) {
    throw new Error(`${provider.toUpperCase()}_REDIRECT_URI must match ${expected}`);
  }
  return configured ?? expected;
}

export async function createAuthorizationUrl(request: NextRequest, provider: OAuthProvider) {
  const user = await requireUser();
  const origin = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_URL) {
    throw new Error("NEXTAUTH_URL must be explicitly configured in production");
  }
  const redirectUri = callbackUri(provider, origin);
  const clientId = provider === "deriv" ? process.env.DERIV_CLIENT_ID : provider === "ctrader" ? process.env.CTRADER_CLIENT_ID : process.env.FXCM_CLIENT_ID;
  if (!clientId) throw new Error(`${provider.toUpperCase()}_CLIENT_ID is not configured`);
  if (provider === "ctrader" && !process.env.CTRADER_CLIENT_SECRET) throw new Error("CTRADER_CLIENT_SECRET is not configured");
  if (provider === "fxcm" && !process.env.FXCM_CLIENT_SECRET) throw new Error("FXCM_CLIENT_SECRET is not configured; FXCM issues OAuth credentials to approved vendors");

  const state = randomBytes(32).toString("base64url");
  const verifier = provider === "deriv" || provider === "fxcm" ? randomBytes(48).toString("base64url") : undefined;
  const payload = Buffer.from(JSON.stringify({ provider, userId: user.id, state, verifier, issuedAt: Date.now() })).toString("base64url");
  const cookieValue = `${payload}.${sign(payload)}`;
  const url = provider === "deriv"
    ? new URL("https://auth.deriv.com/oauth2/auth")
    : provider === "ctrader"
      ? new URL("https://id.ctrader.com/my/settings/openapi/grantingaccess/")
      : new URL(`https://${process.env.FXCM_ENVIRONMENT === "real" ? "oauth.fxcorporate.com" : "oauth-demo.fxcorporate.com"}/oauth/authorize`);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (provider === "deriv") {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "trade");
  } else if (provider === "ctrader") {
    url.searchParams.set("scope", "trading");
    url.searchParams.set("product", "web");
  } else {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid trading");
    if (verifier) {
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    }
  }
  if (provider === "deriv" && verifier) {
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  }

  const response = NextResponse.json({ url: url.toString() });
  response.cookies.set(COOKIE, cookieValue, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: `/api/brokers/${provider}/callback`, maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

type OAuthContext = { provider: OAuthProvider; userId: string; state: string; verifier?: string; issuedAt: number };

function readContext(request: NextRequest, provider: OAuthProvider): OAuthContext | null {
  const value = request.cookies.get(COOKIE)?.value;
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const context = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthContext;
    const age = Date.now() - context.issuedAt;
    return context.provider === provider && context.state === request.nextUrl.searchParams.get("state") &&
      Number.isFinite(age) && age >= 0 && age <= MAX_AGE_SECONDS * 1000 && typeof context.userId === "string" && context.userId
      ? context : null;
  } catch { return null; }
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Provider authorization failed (HTTP ${response.status})`);
  return data as Record<string, any>;
}

async function persistAccount(input: {
  userId: string; provider: OAuthProvider; accountId: string; label: string; currency?: string;
  balance?: number; equity?: number; isDemo: boolean; auth: Record<string, unknown>;
}) {
  const authRef = encrypt(JSON.stringify(input.auth));
  const data = {
    accountLabel: input.label.slice(0, 80), currency: input.currency || "USD",
    balance: Number.isFinite(input.balance) ? input.balance! : 0,
    equity: Number.isFinite(input.equity) ? input.equity! : (Number.isFinite(input.balance) ? input.balance! : 0),
    isDemo: input.isDemo, status: "connected", authMethod: "oauth", authRef,
    externalAccountId: input.accountId,
  };
  const existing = await db.brokerAccount.findFirst({ where: { userId: input.userId, brokerCode: input.provider, externalAccountId: input.accountId } });
  if (existing) return db.brokerAccount.update({ where: { id: existing.id }, data });
  return db.brokerAccount.create({ data: { userId: input.userId, brokerCode: input.provider, ...data } });
}

async function exchangeToken(provider: OAuthProvider, code: string, context: OAuthContext, origin: string) {
  const clientId = provider === "deriv" ? process.env.DERIV_CLIENT_ID! : provider === "ctrader" ? process.env.CTRADER_CLIENT_ID! : process.env.FXCM_CLIENT_ID!;
  const redirectUri = callbackUri(provider, process.env.NEXTAUTH_URL ?? origin);
  if (provider === "deriv") {
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: context.verifier ?? "", redirect_uri: redirectUri });
    return requestJson("https://auth.deriv.com/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  }
  if (provider === "ctrader") {
    const url = new URL("https://openapi.ctrader.com/apps/token");
    for (const [key, value] of Object.entries({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: process.env.CTRADER_CLIENT_SECRET! })) url.searchParams.set(key, value);
    return requestJson(url.toString(), { method: "GET", headers: { accept: "application/json" } });
  }
  const environment = process.env.FXCM_ENVIRONMENT === "real" ? "oauth.fxcorporate.com" : "oauth-demo.fxcorporate.com";
  const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: process.env.FXCM_CLIENT_SECRET!, redirect_uri: redirectUri });
  if (context.verifier) {
    body.set("code_challenge_method", "S256");
    body.set("code_challenge", createHash("sha256").update(context.verifier).digest("base64url"));
  }
  return requestJson(`https://${environment}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
}

async function connectCTraderAccounts(userId: string, token: Record<string, any>) {
  const accessToken = String(token.accessToken ?? "");
  if (!accessToken) throw new Error("cTrader returned no access token");
  const results = await Promise.allSettled([
    cTraderAccountList("wss://demo.ctraderapi.com:5036", accessToken),
    cTraderAccountList("wss://live.ctraderapi.com:5036", accessToken),
  ]);
  const accounts = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!accounts.length) {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw failure?.reason instanceof Error ? failure.reason : new Error("cTrader returned no accounts");
  }
  const uniqueAccounts = [...new Map(accounts.map((account) => [String(account.ctidTraderAccountId), account])).values()];
  for (const account of uniqueAccounts) {
    const id = String(account.ctidTraderAccountId ?? "");
    if (!id) continue;
    // cTrader returns a deposit asset ID, not an ISO currency code, from account-list.
    // Do not display it as a currency or fabricate a balance before account-level
    // authorization and trader data retrieval are implemented.
    const auth = { ...token, expiresAt: Date.now() + Number(token.expiresIn ?? 0) * 1000, ctidTraderAccountId: id, isLive: !!account.isLive };
    const connector = new CTraderOpenApiConnector();
    const authorization = await connector.authorize({ auth });
    if (!authorization.success) throw new Error(authorization.reason ?? "cTrader account authorization failed");
    try {
      const info = await connector.getAccountInfo();
      await persistAccount({ userId, provider: "ctrader", accountId: id, label: `cTrader ${account.traderLogin ?? id}`,
        currency: info.currency, balance: info.balance, equity: info.equity, isDemo: info.isDemo, auth });
    } finally { await connector.disconnect(); }
  }
  return uniqueAccounts.length;
}

async function cTraderAccountList(host: string, accessToken: string): Promise<Record<string, any>[]> {
  const WebSocketConstructor = (globalThis as any).WebSocket as new (url: string) => any;
  if (!WebSocketConstructor) throw new Error("WebSocket is not available in this Node.js runtime");
  const socket = new WebSocketConstructor(host);
  const result = await new Promise<Record<string, any>[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("cTrader account discovery timed out")), 12_000);
    let stage: "application" | "accounts" = "application";
    socket.addEventListener("open", () => socket.send(JSON.stringify({ clientMsgId: "app-auth", payloadType: 2100, payload: { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET } })));
    socket.addEventListener("message", (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data));
        const type = Number(message.payloadType);
        const payload = message.payload ?? {};
        if (type === 50 || type === 2142) throw new Error(payload.description ?? payload.errorCode ?? "cTrader authorization failed");
        if (stage === "application" && type === 2101) {
          stage = "accounts";
          socket.send(JSON.stringify({ clientMsgId: "get-accounts", payloadType: 2149, payload: { accessToken } }));
        } else if (stage === "accounts" && type === 2150) {
          clearTimeout(timer);
          resolve(payload.ctidTraderAccount ?? []);
        }
      } catch (error) { clearTimeout(timer); reject(error); }
    });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to cTrader Open API")); });
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      reject(new Error("cTrader closed the account discovery session before returning accounts"));
    });
  });
  socket.close();
  return result;
}

export async function handleProviderCallback(request: NextRequest, provider: OAuthProvider) {
  const context = readContext(request, provider);
  const finish = (status: string, message: string) => {
    const response = NextResponse.redirect(new URL(`/broker-connections?oauth_${status}=${encodeURIComponent(message)}`, request.nextUrl.origin));
    response.cookies.set(COOKIE, "", { path: `/api/brokers/${provider}/callback`, maxAge: 0 });
    return response;
  };
  if (!context) return finish("error", "Authorization state expired or did not match. Please start again.");
  if (request.nextUrl.searchParams.has("error")) return finish("error", "Authorization was declined by the provider.");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 4096) return finish("error", "The provider did not return an authorization code.");
  try {
    const token = await exchangeToken(provider, code, context, request.nextUrl.origin);
    let linked = 0;
    if (provider === "deriv") {
      const accessToken = String(token.access_token ?? "");
      if (!accessToken) throw new Error("Deriv returned no access token");
      const accountsResult = await requestJson("https://api.derivws.com/trading/v1/options/accounts", { headers: { authorization: `Bearer ${accessToken}` } });
      const accounts = Array.isArray(accountsResult.data) ? accountsResult.data : accountsResult.data ? [accountsResult.data] : [];
      for (const account of accounts) {
        const id = String(account.account_id ?? "");
        if (!id) continue;
        await persistAccount({ userId: context.userId, provider, accountId: id, label: `Deriv ${id}`,
          currency: String(account.currency ?? "USD"), balance: Number(account.balance ?? 0),
          isDemo: account.account_type !== "real", auth: { accessToken, expiresAt: Date.now() + Number(token.expires_in ?? 0) * 1000, accountId: id } });
        linked++;
      }
    } else if (provider === "ctrader") {
      linked = await connectCTraderAccounts(context.userId, token);
    } else {
      throw new Error("FXCM OAuth requires account discovery through its approved FCLite integration before an account can be marked connected");
    }
    if (!linked) return finish("error", "Authorization succeeded, but no trading accounts were returned.");
    return finish("success", `${linked} ${provider} account${linked === 1 ? "" : "s"} linked`);
  } catch (error) {
    console.error(`[oauth:${provider}] callback failed:`, error instanceof Error ? error.message : "unknown error");
    return finish("error", error instanceof Error ? error.message.slice(0, 160) : "Account linking failed.");
  }
}
