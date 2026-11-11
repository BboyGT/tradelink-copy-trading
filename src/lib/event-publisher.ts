import type { TradeEvent } from "@/hooks/use-trade-events";

export async function publishUserTradeEvent(userId: string, event: TradeEvent): Promise<boolean> {
  const baseUrl = process.env.EVENTS_SERVICE_URL;
  const token = process.env.EVENTS_SERVICE_TOKEN;
  if (!baseUrl || !token) return false;
  try {
    const response = await fetch(new URL("/internal/publish", baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ userId, event }),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
