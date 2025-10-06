import { config } from "dotenv";
import { execSync } from "child_process";

config({ path: ".env.local" });

const dbUrl = process.env.DATABASE_URL || "";

console.log("🗄️  Local Database Setup");
console.log("=".repeat(50));

if (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1")) {
  console.error("\n❌ ERROR: DATABASE_URL does not point to localhost!");
  console.error("Current URL:", dbUrl.substring(0, 50) + "...");
  console.error("\nPlease update .env.local to use:");
  console.error('DATABASE_URL="postgresql://eliza_dev:local_dev_password@localhost:5432/eliza_dev"');
  process.exit(1);
}

console.log("\n✅ Using local database");
console.log(`URL: ${dbUrl}\n`);

try {
  console.log("📊 Pushing schema to database...");
  execSync("npm run db:push", { stdio: "inherit" });

  console.log("\n✅ Database setup complete!");
  console.log("\n💡 Next steps:");
  console.log("   1. Run: npm run dev");
  console.log("   2. Open: http://localhost:3000");
  console.log("   3. View DB: npm run db:studio");

} catch (error) {
  console.error("\n❌ Setup failed:", error);
  process.exit(1);
}
