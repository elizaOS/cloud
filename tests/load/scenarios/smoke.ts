import { group, check, sleep } from "k6";
import { Options } from "k6/options";
import http from "k6/http";
import { getConfig, getBaseUrl } from "../config/environments";
import { httpGet, httpPost } from "../helpers/http";
import { smokeScenario } from "../config/scenarios";

const config = getConfig();
const baseUrl = getBaseUrl();

export const options: Options = {
  scenarios: { smoke: smokeScenario() },
  thresholds: {
    // Public endpoints must always work
    "checks{type:public}": ["rate>0.95"],
    // Authenticated endpoints should work with valid API key
    "checks{type:auth}": ["rate>0.8"],
    // Response times
    http_req_duration: ["p(95)<5000"],
  },
};

export function setup() {
  console.log(`\n🔥 SMOKE TEST | ${config.name} | ${baseUrl}\n`);

  // Connectivity check
  const res = http.get(`${baseUrl}/.well-known/agent-card.json`);
  if (res.status !== 200) {
    throw new Error(
      `Server not responding at ${baseUrl} (status: ${res.status})`,
    );
  }
  console.log("✓ Server connectivity verified\n");
}

export default function () {
  // Public endpoints (must always work)
  group("Public", () => {
    const card = httpGet("/.well-known/agent-card.json", { public: true });
    check(null, { "agent card 200": () => card !== null }, { type: "public" });
    sleep(0.3);
  });

  // Authenticated endpoints (should work with seeded test key)
  group("Authenticated", () => {
    const balance = httpGet("/api/credits/balance");
    check(null, { "balance 200": () => balance !== null }, { type: "auth" });
    sleep(0.3);

    const agents = httpGet("/api/v1/app/agents");
    check(null, { "agents 200": () => agents !== null }, { type: "auth" });
    sleep(0.3);

    // A2A tasks/get - should return "not found" error which is a valid response
    const a2a = httpPost(
      "/api/a2a",
      {
        jsonrpc: "2.0",
        method: "tasks/get",
        params: { id: "smoke-test-nonexistent" },
        id: 1,
      },
      { expectedStatus: 404 },
    );
    check(null, { "a2a responds": () => a2a !== null }, { type: "auth" });
  });
  sleep(1);
}

export function teardown() {
  console.log("\n✅ Smoke test complete\n");
}
