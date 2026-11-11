// Standalone seed runner
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "tradelink-dev-secret-change-me";

import { db } from "@/lib/db";
import { seedDemoData } from "@/lib/seed";

try {
  const result = await seedDemoData();
  console.log("Seed result:", result);
} catch (e) {
  console.error("Seed failed:", e);
} finally {
  await db.$disconnect();
}
