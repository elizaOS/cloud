import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cloudRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const truthyValues = new Set(["1", "true", "yes", "on"]);
const defaultServerPort = Number.parseInt(process.env.TEST_SERVER_PORT?.trim() || "3000", 10);

function envFlagEnabled(name) {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? truthyValues.has(value) : false;
}

function skip(reason) {
  console.log(`[cloud] Skipping e2e smoke because ${reason}.`);
  process.exit(0);
}

async function isPortBusy(port) {
  if (!Number.isInteger(port) || port <= 0) {
    return false;
  }

  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.listen(port, () => {
      server.close(() => resolve(false));
    });
  });
}

if (envFlagEnabled("MILADY_SKIP_CLOUD_LIVE_SMOKE")) {
  skip("MILADY_SKIP_CLOUD_LIVE_SMOKE=1");
}

if (!fs.existsSync(path.join(cloudRoot, "packages", "tests", "e2e", "preload.ts"))) {
  skip("the cloud e2e harness is not available in this checkout");
}

if (!process.env.TEST_BASE_URL?.trim() && (await isPortBusy(defaultServerPort))) {
  skip(`port ${defaultServerPort} is already in use`);
}

const result = spawnSync(
  process.env.npm_execpath || process.env.BUN || "bun",
  [
    "test",
    "--max-concurrency=1",
    "--preload",
    "./packages/tests/e2e/preload.ts",
    "packages/tests/e2e/api/health-route.test.ts",
    "packages/tests/e2e/v1/chat.test.ts",
    "--timeout",
    "120000",
  ],
  {
    cwd: cloudRoot,
    stdio: "inherit",
    env: process.env,
  },
);

if (result.error?.code === "ENOENT") {
  skip(`the test runner could not be launched: ${result.error.message}`);
}

process.exit(result.status ?? 1);
