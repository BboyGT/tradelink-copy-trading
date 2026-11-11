import { db } from "@/lib/db";
import { getAccountConnector } from "@/lib/broker/connector";
import type { BrokerCode } from "@/lib/types";

/** Record already-open source positions before activation so they are not copied retroactively. */
export async function seedSourceBaseline(configId: string, account: {
  id: string; brokerCode: string; externalAccountId: string | null;
  balance: number; currency: string; leverage?: number | null; accountType?: string | null;
}) {
  if (account.brokerCode !== "mt4" && account.brokerCode !== "mt5" && account.brokerCode !== "ctrader") throw new Error("A connected MT4/MT5 or cTrader account is required as the source");
  const connector = await getAccountConnector(account.brokerCode as BrokerCode, account.id, {
    accountId: account.externalAccountId ?? undefined,
    startingBalance: account.balance,
    currency: account.currency,
    leverage: account.leverage ?? undefined,
    accountType: account.accountType ?? undefined,
  });
  const positions = await connector.getOpenPositions();
  if (!positions.length) return 0;
  for (const position of positions) {
    const data = {
      replicationConfigId: configId,
      externalTradeId: `baseline:${account.id}:${position.positionId}:${position.openTime.getTime()}`,
      externalPositionId: position.positionId,
      instrument: position.instrument,
      direction: position.direction,
      entryPrice: position.entryPrice,
      volume: position.volume,
      stopLoss: position.stopLoss ?? null,
      takeProfit: position.takeProfit ?? null,
      orderType: "market",
      openTime: position.openTime,
      state: "open",
    };
    await db.sourcePosition.upsert({
      where: { replicationConfigId_externalTradeId: { replicationConfigId: configId, externalTradeId: data.externalTradeId } },
      create: data,
      update: { externalPositionId: position.positionId, volume: position.volume, stopLoss: position.stopLoss ?? null, takeProfit: position.takeProfit ?? null, state: "open", closeTime: null, exitPrice: null },
    });
  }
  return positions.length;
}
