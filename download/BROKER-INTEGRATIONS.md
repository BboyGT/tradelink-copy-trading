# Broker integration status and implementation contract

This document records the real integration boundary for Deriv, cTrader, MetaTrader 4/5, and FXCM. A provider card is not proof of connectivity. Accounts must only be created after authorization, account discovery, and a successful account snapshot.

## Current application status

The old connection route accepted placeholder credentials and could create fabricated demo accounts. That behavior has been disabled. The broker connection screen no longer collects broker passwords and explicitly reports when a provider flow is not available. The connector registry fails closed instead of returning simulated account state. FXCM is now included in the provider catalog.

The MT terminal bridge, authenticated event service, persistent worker, and MT4/MT5 market-order/close/modify path are implemented in this checkout. cTrader OAuth, token refresh, account verification, account snapshots, position reconciliation, market orders, closes, and protection changes are implemented; its destination order flows still need demo-account validation. Deriv OAuth linking is present, but options contract monitoring and execution remain **not implemented**. FXCM account linking and trading remain **not implemented** pending an approved FCLite integration. Production behavior still requires validation with broker demo accounts and deployment configuration.

## Provider implementation contracts

### Deriv

- Deriv OAuth 2.0 Authorization Code + PKCE, state/verifier cookies, server-side exchange, encrypted token storage, and authorized account discovery are implemented.
- Contract monitoring and trading are not implemented. Deriv options require explicit symbol, contract type, duration, stake, and settlement mapping; they cannot safely be treated as generic forex positions.
- Deriv access tokens have a limited lifetime and must be reauthorized when expired; the current connector does not run a contract session or copy trades.

Official references: [OAuth 2.0](https://developers.deriv.com/docs/intro/oauth/), [authentication](https://developers.deriv.com/docs/intro/authentication/), [workflow](https://developers.deriv.com/docs/workflows/).

### cTrader

- Register and obtain approval for a cTrader Open API application and exact redirect URI.
- Request `trading` scope only when trade execution is required; exchange the one-minute authorization code server-side and encrypt both access and refresh tokens.
- Authenticate the application, enumerate accounts, authorize each selected account, fetch account/asset data, refresh OAuth tokens, and reconcile open positions using cTrader Open API JSON-over-WebSocket messages.
- The source connector normalizes cTrader protocol volume using the provider's symbol lot size. cTrader can be selected as a source or destination. Market orders require a broker-confirmed fill; requested stops are added after the fill, with an immediate close attempted if protection fails. Stable broker labels and recent order reconciliation prevent blind resubmission after an ambiguous timeout. Verify these flows on demo accounts before live use.
- The current reconciliation reads provider-reported unrealized P&L but does not fetch a fresh quote per open position. The current-price field is therefore left blank rather than showing the entry price as a live quote.
- Keep cTrader account IDs and symbol IDs as provider-specific metadata. Use demo accounts to verify symbol aliases, volume rules, and reconciliation before production use.

Official references: [authentication and token refresh](https://help.ctrader.com/open-api/account-authentication/), [JSON messages](https://help.ctrader.com/open-api/sending-receiving-json/), [message models and volume units](https://help.ctrader.com/open-api/model-messages/), [getting started](https://help.ctrader.com/open-api/), [register an application](https://help.ctrader.com/open-api/api-application/).

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
