# Security and live-trading status

TRADE LINK is a development prototype. Use demo accounts only until all items in the production requirements below have been validated. MT4/MT5 terminal bridges support copying. cTrader OAuth and source monitoring are implemented, but cTrader destination execution remains disabled. Deriv contract monitoring/execution and FXCM account-session/execution are unavailable.

## Implemented in this checkout

- Production startup requires a configured `NEXTAUTH_SECRET` and `ENCRYPTION_KEY`; credential data uses AES-256-GCM when encrypted.
- Bridge secrets are generated per account, returned during enrollment, and stored only as SHA-256 hashes.
- Bridge heartbeat, command polling, command acknowledgements, monitoring scans, and event publishing use separate bearer secrets.
- Browser event subscriptions use short-lived signed tokens bound to the authenticated user.
- Account APIs redact credential references, and unsupported connectors fail closed.
- Live terminal accounts require explicit confirmation, an online bridge, and a configured persistent scan worker.

## Required before production use

- Complete and independently review cTrader destination fill/protection/close/modify operations and cross-platform symbol mapping; verify its implemented OAuth, refresh, and source monitoring with demo accounts.
- Complete Deriv contract-specific monitoring and order mapping, and the approved FXCM FCLite account session and order adapters.
- Validate MT4 and MT5 order, close, modify, hedge/netting, partial-close, and reconnect behavior against broker demo accounts.
- Add durable retry/reconciliation records, server-side idempotency around broker fills, and tested emergency-stop behavior.
- Configure a managed durable production database, HTTPS, backups, access restrictions, rate limits, MFA, and operational monitoring.
- Complete security review and test account isolation and live confirmation flows.

Never commit `.env`, tokens, bridge secrets, or a live database. If any credential is exposed, revoke it at its provider and rotate the application secrets.
