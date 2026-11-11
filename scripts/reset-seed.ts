// Reset DB and re-seed
import { db } from "@/lib/db";

async function reset() {
  console.log("Deleting existing data...");
  // Delete in dependency order
  await db.auditEvent.deleteMany();
  await db.executionEvent.deleteMany();
  await db.destinationPosition.deleteMany();
  await db.sourcePosition.deleteMany();
  await db.replicationConfig.deleteMany();
  await db.simulationResult.deleteMany();
  await db.providerComparison.deleteMany();
  await db.watchlistEntry.deleteMany();
  await db.watchlist.deleteMany();
  await db.providerSubscription.deleteMany();
  await db.portfolioAllocation.deleteMany();
  await db.riskConfig.deleteMany();
  await db.accountSnapshot.deleteMany();
  await db.brokerAccount.deleteMany();
  await db.instrumentMapping.deleteMany();
  await db.instrumentSpec.deleteMany();
  await db.notification.deleteMany();
  await db.integrationHealthRecord.deleteMany();
  await db.eventProcessingLog.deleteMany();
  await db.providerHealthRecord.deleteMany();
  await db.providerChangeSnapshot.deleteMany();
  await db.providerChangeTracking.deleteMany();
  await db.providerRecommendation.deleteMany();
  await db.providerRanking.deleteMany();
  await db.providerPerformanceSnapshot.deleteMany();
  await db.providerTrade.deleteMany();
  await db.providerStatistic.deleteMany();
  await db.provider.deleteMany();
  await db.providerPlatform.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  console.log("Reset complete.");
}

await reset();
const { seedDemoData } = await import("@/lib/seed");
const result = await seedDemoData();
console.log("Seed result:", result);
await db.$disconnect();
