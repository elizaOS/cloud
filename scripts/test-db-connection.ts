import { config } from "dotenv";
import { db } from "../db/drizzle";
import * as schema from "../db/sass/schema";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

async function testConnection() {
  console.log("🔍 Testing Database Connection");
  console.log("=".repeat(50));
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL}\n`);

  try {
    console.log("1️⃣ Testing basic query...");
    const orgs = await db.select().from(schema.organizations).limit(1);
    console.log(`   ✓ Found ${orgs.length} organizations`);

    console.log("\n2️⃣ Testing user query...");
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, "prajwalpl096@gmail.com"),
    });
    console.log(`   ✓ User found: ${user?.email}`);

    console.log("\n3️⃣ Testing user with organization...");
    const userWithOrg = await db.query.users.findFirst({
      where: eq(schema.users.email, "prajwalpl096@gmail.com"),
      with: {
        organization: true,
      },
    });
    console.log(`   ✓ User: ${userWithOrg?.email}`);
    console.log(`   ✓ Organization: ${userWithOrg?.organization?.name}`);
    console.log(`   ✓ Credits: ${userWithOrg?.organization?.credit_balance}`);

    console.log("\n✅ Database connection successful!");
  } catch (error) {
    console.error("\n❌ Connection failed:");
    console.error(error);
    process.exit(1);
  }
}

testConnection()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
