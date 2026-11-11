// Create a second demo user (regular user role, not admin)
import { db } from "@/lib/db";
import { hash } from "@/lib/crypto";
import { randomBytes } from "node:crypto";

const demoPassword = randomBytes(24).toString("base64url");

async function createDemoUser() {
  const existing = await db.user.findUnique({ where: { email: "trader@tradelink.test" } });
  if (existing) {
    console.log("Demo trader user already exists.");
    console.log("  Email: trader@tradelink.test");
    console.log("Demo trader user already exists. No password is reset.");
    await db.$disconnect();
    return;
  }

  const user = await db.user.create({
    data: {
      email: "trader@tradelink.test",
      name: "Demo Trader",
      passwordHash: await hash(demoPassword),
      role: "user",
    },
  });

  console.log("Created demo trader user:");
  console.log("  Email: trader@tradelink.test");
  console.log(`  Generated one-time password: ${demoPassword}`);
  console.log("  Role: user (no admin access)");

  await db.$disconnect();
}

createDemoUser().catch(console.error);
