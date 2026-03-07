/**
 * Preload for bun test: load .env.local and .env.test so DATABASE_URL and other
 * vars are available. Run with: bun test --preload ./tests/load-env.ts ...
 */
import { config } from "dotenv";
import { resolve } from "path";

const root = resolve(import.meta.dir, "..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env.test") });
