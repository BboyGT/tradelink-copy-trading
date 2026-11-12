# TRADE LINK

## About

TRADE LINK is a copy-trading workspace for connecting a trader's own brokerage accounts, monitoring positions, and configuring risk-limited trade replication. It brings account connections, provider research, execution controls, history, and risk monitoring into one dashboard.

The project is designed around owner-authorized connections. MT4 and MT5 use a terminal bridge installed by the account owner. Deriv and cTrader use their official account authorization flows. FXCM MT4 accounts can use the same terminal bridge. FXCM Trading Station still needs approved FXCM credentials and a broker-session adapter.

TRADE LINK does not guarantee returns. Historical provider examples are marked as demo data and must not be treated as real performance.

## Product features

- Connect and monitor supported accounts from Deriv, cTrader, MT4, and MT5.
- Mirror supported position changes with configurable sizing and risk limits.
- Review live monitoring, trade history, provider analytics, comparisons, and backtests.
- Use emergency pause controls and an audit trail for sensitive actions.
- Track integration status and unsupported broker capabilities before configuring a strategy.

## Package information

This repository contains a private npm application, not a reusable npm library. Install dependencies with `npm ci` and use the included npm scripts to build and run it. It is not published to the npm registry or GitHub Packages. The project is proprietary and has no open-source reuse license.

**Integration status:** MT4 and MT5 have an Expert Advisor bridge and persistent copy worker; an FXCM account using MT4 can connect through this same terminal bridge. cTrader has OAuth, token refresh, account snapshots, open-position reconciliation, market execution, close, and protection operations; it can be a source or destination. cTrader order paths still need broker demo validation. Deriv OAuth supports balance and open Options monitoring, with constrained Deriv-to-Deriv copying for standard CALL/PUT contracts, matching currencies, and supported remaining expiry. FXCM Trading Station requires approved FCLite credentials and a broker-session adapter. Sample marketplace analytics are demo data.

## Tech stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui (New York)
- **State:** Zustand (client) + TanStack Query (server)
- **Auth:** NextAuth.js v4 (credentials provider, JWT sessions)
- **Database:** Prisma ORM + SQLite (dev) - switch `datasource.provider` to `postgresql` for production
- **Real-time:** Socket.IO mini-service (port 3003) proxied via Caddy with `XTransformPort` query param
- **Charts:** Recharts
- **Validation:** Zod

The application uses Next.js API routes, Prisma, and independent Node.js services for persistent copy monitoring and authenticated trade-event delivery. The scanner supports MT4/MT5 and cTrader source and destination accounts, including FXCM accounts running the MT4 terminal. Deriv-to-Deriv copying is supported for standard CALL/PUT contracts only; cross-broker Options-to-FX/CFD copying is disabled. FXCM Trading Station is not yet available for replication.

## Local setup

1. Install Node.js 20+ and npm 10+, then copy `.env.example` to `.env`.
2. Generate separate random secrets for `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `SCANNER_WORKER_TOKEN`, and `EVENTS_SERVICE_TOKEN` (at least 32 random bytes each). Keep `.env` out of source control.
3. Set `NEXTAUTH_URL` to the app origin and `WEB_ORIGINS` to the browser origin. Configure a durable production database before deploying.
4. Run `npm ci`, `npm run db:generate`, `npm run db:push`, then `npm run dev:stack` to start the web app, event service, and copy worker together.
5. Demo marketplace data is optional. Seed it explicitly with `npm run db:seed`; signup does not seed thousands of sample trades or wait for background demo work.
6. For app-only development, run `npm run dev`. Start the worker and event service separately with `npm run dev:worker` and `npm run dev:events` when you need automatic monitoring and live event delivery.

The initial bridge account is created from Broker Connections. Install the matching EA source from `bridges/mt4/TradeLinkBridge.mq4` or `bridges/mt5/TradeLinkBridge.mq5` in the user's own terminal, allow HTTPS requests to the app origin, and configure its one-time bridge secret. Test with a demo terminal before enabling a live account. Never put a broker password or bridge secret into public source control.

## Project structure

```
src/
├── app/
│   ├── api/                      # Next.js API routes (auth, providers, analytics, brokers, replication, risk, etc.)
│   ├── layout.tsx                # Root layout (dark theme, providers)
│   ├── page.tsx                  # Main SPA page (sidebar + view switching)
│   └── globals.css               # Dark-first fintech theme
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── views/                    # dashboard, marketplace, monitoring, risk, and admin views
│   ├── sidebar.tsx               # 13-section navigation
│   ├── top-bar.tsx
│   ├── auth-dialog.tsx
│   ├── providers.tsx             # NextAuth + React Query + ThemeProvider
│   └── badges.tsx                # DataQualityBadge, HealthBadge, DemoBadge
├── lib/
│   ├── db.ts                     # Prisma client
│   ├── auth.ts                   # NextAuth config + audit logging
│   ├── crypto.ts                 # Password hashing (scrypt)
│   ├── types.ts                  # Enums + integration capability registry
│   ├── format.ts                 # Currency/percent/date formatters
│   ├── nav-store.ts              # Zustand view state
│   ├── notify.ts                 # Notification helper
│   ├── seed.ts                   # Demo data generator (10 providers, ~3700 trades)
│   ├── engine/
│   │   ├── analytics.ts          # Part 4 - performance, drawdown, behaviour, risk
│   │   ├── sizing.ts             # Part 10 - equity ratio, multiplier, fixed lot, risk-based
│   │   ├── recommendation.ts     # Part 5 - risk-adjusted scoring
│   │   └── backtest.ts           # Part 6 - historical simulation
│   └── broker/
│       └── connector.ts          # Broker connector contract and fail-closed registry
├── hooks/
│   ├── use-trade-events.ts       # WebSocket trade event subscription
│   ├── use-mobile.ts
│   └── use-toast.ts
└── prisma/
    └── schema.prisma             # All Part 21.2 entities

mini-services/
├── trade-events/                 # Authenticated Socket.IO event delivery (port 3003)
└── copy-worker/                  # Persistent source account scanner
    └── index.ts

scripts/
├── seed.ts                       # Standalone seed runner
└── reset-seed.ts                 # Reset DB + re-seed
```

## Main navigation (routed website)

Each main view has a direct URL. Navigation updates the route and browser history while the shared app shell preserves client-side transitions:

1. `/` - Dashboard: portfolio overview, recommended providers, system status
2. `/discover` - Provider marketplace with filters and sorting
3. `/analytics` - Provider performance, drawdown, behaviour, and risk
4. `/comparison` - Side-by-side provider comparison
5. `/portfolio` - Accounts, allocations, and replications
6. `/live-monitor` - Trade event feed
7. `/automated-trading` - Replication configuration and controls
8. `/trade-history` - Trade ledger
9. `/backtesting` - Historical simulation
10. `/risk-management` - Risk limits and emergency controls
11. `/broker-connections` - Broker connections
12. `/notifications` - Alert center
13. `/settings` - Account and preferences
14. `/admin` - System health and audit tools (admin role only)
15. `/watchlists` - Saved provider and instrument lists
16. `/instrument-mapping` - Source-to-destination symbol mapping

Analytics selections are held in browser state; a direct `/analytics` link opens the analytics view without a preselected provider.

## Core engine modules

### Analytics (Part 4) - `src/lib/engine/analytics.ts`
- `computePerformance(trades, startingBalance)` → PerformanceMetrics with all 20+ metrics from Part 4.1
- `computeDrawdown(trades, startingBalance)` → DrawdownMetrics with equity curve, drawdown series, recovery factor (Part 4.2)
- `computeBehaviour(trades)` → BehaviourMetrics (Part 4.3)
- `computeRiskMetrics(trades)` → RiskMetrics (Part 4.4)
- `computeMonthlyPerformance(trades)` → monthly breakdown
- Every metric carries a `dataQuality` tag (Part 4.5)

### Sizing (Part 10) - `src/lib/engine/sizing.ts`
- `computeSizing(input)` - 4 sizing modes:
  - `equity_ratio`: dest = src × (destEquity / srcEquity) × multiplier
  - `fixed_multiplier`: dest = src × multiplier
  - `fixed_lot`: dest = fixed lot
  - `risk_based`: requires stop-loss distance; refuses to invent one
- `computePartialClosure(...)` - Part 8.3 - rounds DOWN to volume step, never leaves larger exposure than intended

### Recommendation (Part 5) - `src/lib/engine/recommendation.ts`
- `scoreProvider(stats, weights)` → returns score (0-100), confidence (0-1), category, strengths, weaknesses, data limitations
- 9 recommendation categories from Part 5.1
- Customizable weights for each scoring factor

### Backtest (Part 6) - `src/lib/engine/backtest.ts`
- `runSimulation(sourceTrades, sourceEquity, config)` → SimulationResult
- Always marks `isHypothetical: true`
- Includes spreads, commissions, swaps, slippage
- Stops when max drawdown breached
- Reports missed/executed trades

### Broker connectors (Part 2.3) - `src/lib/broker/connector.ts`
- `BrokerConnector` interface - standardized contract for all brokers
- `BaseMockConnector` - demo-only simulator, never used by production registry
- MT4/MT5 use account-bound `TerminalBridgeConnector` instances
- cTrader Open API supports source monitoring and destination order, close, and protection operations; demo validation is still required
- Deriv OAuth uses the official account-scoped one-time WebSocket URL to poll balances and open Options contracts. Copy execution supports standard CALL/PUT contracts between matching-currency Deriv accounts, with stake sizing, source-close mirroring, and persistent duplicate prevention. Other contract types, partial closes, and cross-broker copying are rejected.
- FXCM MT4 accounts use the MetaTrader terminal bridge. FXCM Trading Station account linking and trading fail closed pending approved FCLite credentials and session integration.
- `getAccountConnector(broker, accountId, credentials)` - connection cache
- Each connector exposes `capabilities()` returning the `IntegrationCapability` from Part 2.4

## Getting started

### Prerequisites
- Node.js 20+ and npm 10+
- SQLite (bundled) or PostgreSQL 14+ (production)

### Install & run

```bash
# Install locked app and service dependencies
npm ci

# Push the DB schema (the example URL stores SQLite at db/custom.db)
npm run db:generate
npm run db:push

# Optional demo marketplace data (10 providers and historical trades)
npm run db:seed
# Or to reset and re-seed:
npm run db:seed:reset

# Run all services
npm run dev:stack
```

Open http://localhost:3000. The first registered user becomes the admin. Signup responds without waiting for optional demo-marketplace seeding. Do not treat seeded providers or their performance as real trading accounts.

### Default admin access

There is no default user. Register at the sign-in dialog - the first user becomes admin and is auto-assigned `role: "admin"`.

## Deployment

### Production readiness

The app can be built with `npm run build` and deployed with its Next.js standalone output plus the two Node.js services. Configure all secrets and service environment variables from `.env.example` in the deployment platform. This repository is not a turnkey production trading service: the Prisma datasource is currently SQLite, the deployment must provide a durable database and worker/event-service processes, cTrader and Deriv order flows still need broker demo validation, and FXCM Trading Station integration is unavailable. Validate terminal behavior with broker demo accounts before enabling any live account.

## Compliance & data integrity (Part 23, 4.5)

- Every metric carries a `dataQuality` label: `verified` | `platform_reported` | `calculated` | `estimated` | `incomplete` | `unavailable` | `delayed`
- Drawdown from closed trades is labeled "closed-trade drawdown", not "actual equity drawdown"
- Integration capability registry (Part 2.4) records exactly what each platform supports
- Live trading requires explicit authorization (Part 17) - `confirm: "I AUTHORIZE LIVE TRADING"` on PATCH /api/brokers/[id]
- Risk disclosures shown in footer of every page
- Demo data is clearly labelled with `DEMO` badges throughout

## Known integration limits

- Configure `DERIV_CLIENT_ID` and `CTRADER_CLIENT_ID`/`CTRADER_CLIENT_SECRET` and register their callback URLs. cTrader supports source and destination roles. Deriv only supports same-currency Deriv-to-Deriv copying for standard CALL/PUT contracts.
- FXCM MT4 is supported through the terminal bridge. Trading Station credentials are restricted to approved integrations; the FCLite account-session and execution adapter is not implemented.
- The terminal bridge supports market orders and position close/modify commands. Pending orders and provider-specific symbol/contract normalization are not implemented.
- Production database migration, distributed job coordination, rate limiting, MFA, and a broker-terminal validation suite remain deployment work.

## License

Proprietary - TRADE LINK.
