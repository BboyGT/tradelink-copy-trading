# TRADE LINK project guide

The previous walkthrough described the original demo-only single-page prototype. It is obsolete. Use the root [README](../README.md) for installation, routed pages, and current integration status.

## Current architecture

- `src/app/[view]/page.tsx` maps direct URLs to dashboard, discovery, analytics, comparison, portfolio, live monitor, automated trading, trade history, backtesting, risk management, broker connections, notifications, settings, administration, watchlists, and instrument mapping views.
- `src/app/api/` contains authenticated Next.js API routes. Account-scoped operations check the signed-in user's ownership.
- `src/lib/broker/connector.ts` defines the connector contract and a fail-closed registry. It does not provide simulated production connectivity.
- `src/lib/broker/terminal-bridge.ts` adapts an enrolled MT4/MT5 terminal into that connector contract.
- `bridges/mt4/` and `bridges/mt5/` contain separate Expert Advisors. They send account and position snapshots, poll expiring commands, execute supported market orders/close/modify actions, and acknowledge results.
- `mini-services/copy-worker/` periodically calls the protected scanner so copying can continue while the browser is closed.
- `mini-services/trade-events/` authenticates browser subscriptions and accepts trade events only from the trusted server-side publisher.
- `prisma/schema.prisma` contains user, broker, replication, position, audit, and terminal bridge records.

## Trade-copy flow

1. A user enrolls an MT4 or MT5 account in Broker Connections and receives a one-time terminal bridge secret.
2. The user installs the corresponding EA in their own broker terminal and configures the HTTPS origin and secret.
3. The EA posts account and open-position snapshots. The application stores the secret hash, heartbeat, and position snapshots.
4. The persistent copy worker scans connected source accounts, compares snapshots, and creates position events.
5. Active auto-replication configurations map a source position to an MT4/MT5 destination. The app queues a command with an expiry and waits for the terminal's acknowledgement before recording a successful result.
6. Unavailable connectors, stale heartbeats, unsupported instruments, non-market order types, and failed terminal commands fail closed.

## Integration limits

Deriv, cTrader, and FXCM are present in the provider catalog but currently have no production OAuth callback, persistent account session, source monitor, or execution adapter. Their UI must not imply they are connected. MT terminal copying is limited to the behavior stated in the root README and `BROKER-INTEGRATIONS.md`; symbol normalization, durable retry records, and historical reconciliation are still needed before production live use.
