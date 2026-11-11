# Security and live-trading status

TRADE LINK is a development prototype. Use demo accounts only until all items in the production requirements below have been validated. The website currently supports terminal bridges for MT4/MT5; Deriv, cTrader, and FXCM authorization and copy execution are not implemented.

## Implemented in this checkout

- Production startup requires a configured `NEXTAUTH_SECRET` and `ENCRYPTION_KEY`; credential data uses AES-256-GCM when encrypted.
- Bridge secrets are generated per account, returned during enrollment, and stored only as SHA-256 hashes.
- Bridge heartbeat, command polling, command acknowledgements, monitoring scans, and event publishing use separate bearer secrets.
- Browser event subscriptions use short-lived signed tokens bound to the authenticated user.
- Account APIs redact credential references, and unsupported connectors fail closed.
- Live terminal accounts require explicit confirmation, an online bridge, and a configured persistent scan worker.

## Required before production use

- Complete and independently review Deriv, cTrader, and FXCM authorization, monitoring, refresh/revocation, symbol mapping, and order adapters.
- Validate MT4 and MT5 order, close, modify, hedge/netting, partial-close, and reconnect behavior against broker demo accounts.
- Add durable retry/reconciliation records, server-side idempotency around broker fills, and tested emergency-stop behavior.
- Configure a managed durable production database, HTTPS, backups, access restrictions, rate limits, MFA, and operational monitoring.
- Complete security review and test account isolation and live confirmation flows.

Never commit `.env`, tokens, bridge secrets, or a live database. If any credential is exposed, revoke it at its provider and rotate the application secrets.
