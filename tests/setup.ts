/**
 * Test Setup
 *
 * Configures environment and provides server availability checking.
 * Integration tests that need a server will skip gracefully if unavailable.
 *
 * To run integration tests:
 *   1. Start server: bun run dev
 *   2. Run tests: bun test ./tests/integration
 *
 * Or use the combined command: bun run test:with-server
 */

import { config } from "dotenv";

// Preserve test-specific env vars that might be passed from test scripts
const preservedEnvVars = {
  TEST_API_URL: process.env.TEST_API_URL,
  TEST_SERVER_URL: process.env.TEST_SERVER_URL,
  TEST_PORT: process.env.TEST_PORT,
};

// Load .env first, then .env.local to override (Next.js convention)
config({ path: ".env" });
config({ path: ".env.local", override: true });

// Restore preserved env vars (they take precedence over .env files)
for (const [key, value] of Object.entries(preservedEnvVars)) {
  if (value) {
    process.env[key] = value;
  }
}

console.log("[Test Setup] Environment loaded");
console.log("[Test Setup] DATABASE_URL:", process.env.DATABASE_URL?.slice(0, 40) + "...");
console.log("[Test Setup] TEST_API_URL:", process.env.TEST_API_URL);

// Server availability cache
let serverAvailabilityCache: Map<string, boolean> = new Map();

// Default test URL - check common ports
const DEFAULT_PORTS = ["3000", "3001", "5006"];
const TEST_URL =
  process.env.TEST_SERVER_URL ||
  process.env.TEST_API_URL ||
  "http://localhost:3000";

/**
 * Check if a server is responding at the given URL
 * Accepts any response (including 401/403) as indication server is running
 */
async function checkServer(url: string, timeout = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url + "/api/health", {
      signal: controller.signal,
      method: "GET",
    }).catch(() => null);
    clearTimeout(timeoutId);
    return response !== null;
  } catch {
    return false;
  }
}

/**
 * Find an available server on common ports
 */
async function findAvailableServer(): Promise<string | null> {
  if (await checkServer(TEST_URL)) {
    return TEST_URL;
  }
  for (const port of DEFAULT_PORTS) {
    const url = "http://localhost:" + port;
    if (url !== TEST_URL && (await checkServer(url))) {
      return url;
    }
  }
  return null;
}

/**
 * Check if server is available at the given URL.
 * Results are cached per URL.
 */
export async function isServerAvailable(url?: string): Promise<boolean> {
  const testUrl = url || TEST_URL;
  if (serverAvailabilityCache.has(testUrl)) {
    return serverAvailabilityCache.get(testUrl)!;
  }
  let available = await checkServer(testUrl);
  if (!available) {
    const foundUrl = await findAvailableServer();
    if (foundUrl) {
      console.log("[Test Setup] Server found at " + foundUrl);
      available = true;
      serverAvailabilityCache.set(foundUrl, true);
    } else {
      console.log("[Test Setup] No server available");
      console.log("[Test Setup] Start with: bun run dev");
      console.log("[Test Setup] Integration tests will skip");
    }
  } else {
    console.log("[Test Setup] Server available at " + testUrl);
  }
  serverAvailabilityCache.set(testUrl, available);
  return available;
}

export async function ensureServer(): Promise<boolean> {
  return isServerAvailable();
}

export async function getTestUrl(): Promise<string> {
  const foundUrl = await findAvailableServer();
  return foundUrl || TEST_URL;
}

export function clearServerCache(): void {
  serverAvailabilityCache.clear();
}

declare global {
  var isServerAvailable: typeof isServerAvailable;
  var ensureServer: typeof ensureServer;
  var getTestUrl: () => Promise<string>;
}
globalThis.isServerAvailable = isServerAvailable;
globalThis.ensureServer = ensureServer;
globalThis.getTestUrl = getTestUrl;
