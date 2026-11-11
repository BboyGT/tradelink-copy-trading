// Persistent account-monitoring worker. Runs independently of browser sessions
// and invokes the same authenticated scanner used for manual account refreshes.
const baseUrl = (process.env.APP_INTERNAL_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const token = process.env.SCANNER_WORKER_TOKEN;
const intervalMs = Math.max(1_000, Number(process.env.SCANNER_INTERVAL_MS ?? 3_000));
let running = false;

if (!token || token.length < 32) {
  console.error("[copy-worker] SCANNER_WORKER_TOKEN must be configured with at least 32 characters.");
  process.exit(1);
}

async function cycle() {
  if (running) return;
  running = true;
  try {
    const accountsResponse = await fetch(`${baseUrl}/api/monitoring/scan`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!accountsResponse.ok) throw new Error(`Account list returned HTTP ${accountsResponse.status}`);
    const { accountIds } = await accountsResponse.json() as { accountIds?: string[] };
    for (const brokerAccountId of (accountIds ?? [])) {
      const response = await fetch(`${baseUrl}/api/monitoring/scan`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ brokerAccountId }), signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) console.error(`[copy-worker] account ${brokerAccountId} scan failed: HTTP ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? `${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ""}` : String(error);
    console.error("[copy-worker] cycle failed:", message);
  } finally {
    running = false;
  }
}

async function start() {
  console.log(`[copy-worker] polling ${baseUrl} every ${intervalMs}ms`);
  await cycle();
  setInterval(() => void cycle(), intervalMs);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

void start();
