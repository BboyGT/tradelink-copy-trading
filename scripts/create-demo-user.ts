// Create a second demo user (regular user role, not admin)
import { db } from "@/lib/db";
import { hash } from "@/lib/crypto";

async function createDemoUser() {
  const existing = await db.user.findUnique({ where: { email: "trader@tradelink.test" } });
  if (existing) {
    console.log("Demo trader user already exists.");
    console.log("  Email: trader@tradelink.test");
    console.log("  Password: demo1234");
    console.log("  Role: user");
    await db.$disconnect();
    return;
  }

  const user = await db.user.create({
    data: {
      email: "trader@tradelink.test",
      name: "Demo Trader",
      passwordHash: hash("demo1234"),
      role: "user",
    },
  });

  console.log("Created demo trader user:");
  console.log("  Email: trader@tradelink.test");
  console.log("  Password: demo1234");
  console.log("  Role: user (no admin access)");

  await db.$disconnect();
}

createDemoUser().catch(console.error);
