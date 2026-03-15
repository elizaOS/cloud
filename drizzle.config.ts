import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Environment file mapping:
// - .env.local       → localhost (docker postgres)
// - .env.development → staging (Neon EU)
// - .env.production  → production (Neon US)
const envFiles: Record<string, string> = {
  local: ".env.local",
  development: ".env.development",
  production: ".env.production",
};
const envFile = envFiles[process.env.NODE_ENV || "local"] || ".env.local";
config({ path: envFile });

export default defineConfig({
  schema: "./packages/db/schemas/index.ts",
  out: "./packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
