# Broker integration status and implementation contract

This document records the real integration boundary for Deriv, cTrader, MetaTrader 4/5, and FXCM. A provider card is not proof of connectivity. Accounts must only be created after authorization, account discovery, and a successful account snapshot.

## Current application status

The old connection route accepted placeholder credentials and could create fabricated demo accounts. That behavior has been disabled. The broker connection screen no longer collects broker passwords and explicitly reports when a provider flow is not available. The connector registry fails closed instead of returning simulated account state. FXCM is now included in the provider catalog.

The MT terminal bridge, authenticated event service, persistent worker, and MT4/MT5 market-order/close/modify path are implemented in this checkout. Production execution still needs validation with actual broker terminals and deployment configuration. Deriv, cTrader, and FXCM callbacks, token refresh, account discovery, monitoring, and execution remain **not implemented**. No provider should be treated as connected or used for copy trading until its requirements are complete.

## Provider implementation contracts

### Deriv

- Replace the legacy OAuth flow with Deriv OAuth 2.0 Authorization Code + PKCE. Keep `state` and `code_verifier` in short-lived, HttpOnly, same-site server cookies.
- Exchange the code server-side and encrypt the resulting token and expiry metadata.
- Discover authorized accounts through the current Trading API, obtain an account OTP, and establish the provider WebSocket using that OTP.
- Model Deriv contracts explicitly. The existing generic forex `OrderRequest` cannot safely be translated into a Deriv options contract without symbol, contract type, duration, and stake mapping.
- Refresh or repeat authorization according to Deriv's current token lifecycle.

Official references: [OAuth 2.0](https://developers.deriv.com/docs/intro/oauth/), [authentication](https://developers.deriv.com/docs/intro/authentication/), [workflow](https://developers.deriv.com/docs/workflows/).

### cTrader

- Register and obtain approval for a cTrader Open API application and exact redirect URI.
- Request `trading` scope only when trade execution is required; exchange the one-minute authorization code server-side and encrypt both access and refresh tokens.
- Authenticate the application, enumerate account IDs, authorize the selected account, then implement Open API position reconciliation and order operations.
- Use cTrader's official JSON-over-WebSocket envelope or the official Protobuf SDK. Keep its account ID and symbol IDs as provider-specific metadata.

Official references: [authentication](https://help.ctrader.com/open-api/account-authentication/), [getting started](https://help.ctrader.com/open-api/), [register an application](https://help.ctrader.com/open-api/api-application/).

### MT4 and MT5

- Do not request terminal passwords in the website. Install an Expert Advisor inside the user's own terminal and have that agent establish an outbound TLS connection to a bridge service.
- The bridge must authenticate a per-account revocable secret, report account identity/balance/positions, and poll for idempotent commands. Every command must expire, have a unique ID, and be acknowledged with broker result codes.
- MT4 and MT5 need separate EA implementations because their languages and order/position models differ. Reconcile by ticket and symbol; never infer a fill from command submission alone.
- Use a persistent worker and server-side command queue. A browser-triggered scan or in-memory connector is not sufficient for unattended copying.

Official references: [MQL5 Python/terminal integration](https://www.mql5.com/en/docs/python_metatrader5), [MQL5 order send](https://www.mql5.com/en/docs/python_metatrader5/mt5ordersend_py). MT4's terminal bridge needs its own MQL4 implementation.

### FXCM

- Use FXCM-issued FCLite/Open API OAuth credentials; never collect the FXCM account password in TRADE LINK.
- Complete the OAuth callback and token exchange, store refresh credentials encrypted, and run refresh/session maintenance in a persistent worker.
- Implement the FCLite session layer for account details, open positions, order submission, and close/modify operations before enabling replication.
- Test FXCM demo accounts and provider rejection responses before exposing live execution.

Official references: [FCLite access and authentication](https://www.fxcm.com/public-docs/fclite/gettingstarted/authentication/getting_access.html), [FCLite trading API](https://www.fxcm.com/public-docs/fclite/trading/).

## Copy-trading safety requirements

Before enabling any live account, the integration must have persistent monitoring, source/destination symbol mapping, volume and contract-size normalization, duplicate-event protection, close/partial-close reconciliation, stop-loss/take-profit mapping, risk limits, token revocation, audit records, and a kill switch. The implemented MT scanner covers terminal snapshots and position deltas; symbol conversion, contract-size normalization, historical reconciliation, and durable retry records need further work before live use can be considered production-ready.
