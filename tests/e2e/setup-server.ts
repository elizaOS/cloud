/**
 * E2E Server Setup (Preload)
 *
 * Auto-starts Next.js server before e2e tests, shuts down after.
 * Uses top-level await for synchronous startup before any test runs.
 *
 * Behavior:
 *   - Top-level: Check if server running → reuse or start new
 *   - Process exit: Kill server if we started it
 *
 * Usage:
 *   bun test --config bunfig.e2e.toml tests/e2e
 */

import type { Subprocess } from "bun";

const SERVER_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const HEALTH_ENDPOINT = `${SERVER_URL}/api/health`;
const STARTUP_TIMEOUT = 60_000;
const POLL_INTERVAL = 500;

let serverProcess: Subprocess | null = null;
let weStartedServer = false;

async function isServerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(HEALTH_ENDPOINT, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isServerRunning()) {
      return;
    }
    await Bun.sleep(POLL_INTERVAL);
  }
  throw new Error(`Server failed to start within ${timeout / 1000}s`);
}

async function startServer(): Promise<void> {
  console.log("\n[E2E Setup] Checking server status...");

  if (await isServerRunning()) {
    console.log(`[E2E Setup] ♻️  Reusing existing server at ${SERVER_URL}`);
    weStartedServer = false;
    return;
  }

  console.log("[E2E Setup] 🚀 Starting Next.js server...");
  weStartedServer = true;

  serverProcess = Bun.spawn(["bun", "run", "dev"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: "3000",
    },
  });

  // Log server output in background
  if (serverProcess.stdout) {
    const reader = serverProcess.stdout.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          if (text.includes("Ready") || text.includes("Local:")) {
            console.log(`[E2E Server] ${text.trim()}`);
          }
        }
      } catch {
        // Stream closed
      }
    })();
  }

  await waitForServer(STARTUP_TIMEOUT);
  console.log(`[E2E Setup] ✅ Server ready at ${SERVER_URL}`);
}

function stopServer(): void {
  if (weStartedServer && serverProcess) {
    console.log("\n[E2E Setup] 🛑 Stopping server...");
    serverProcess.kill();
    console.log("[E2E Setup] Server stopped");
  }
}

// Register cleanup on process exit
process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopServer();
  process.exit(0);
});

// Start server synchronously before any tests run
await startServer();

export const serverUrl = SERVER_URL;
