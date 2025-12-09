// Load environment variables for tests
import { config } from "dotenv";

// Load .env first, then .env.local to override (Next.js convention)
config({ path: ".env" });
config({ path: ".env.local", override: true });

console.log("[Test Setup] Environment loaded");
console.log("[Test Setup] DATABASE_URL:", process.env.DATABASE_URL?.slice(0, 40) + "...");
