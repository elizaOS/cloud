import { group, check, sleep } from "k6";
import { Options } from "k6/options";
import { getConfig } from "../config/environments";
import { httpGet, httpPost } from "../helpers/http";
import { smokeScenario } from "../config/scenarios";

const config = getConfig();

export const options: Options = {
  scenarios: { smoke: smokeScenario() },
  thresholds: { http_req_failed: ["rate<0.1"], http_req_duration: ["p(95)<5000"], checks: ["rate>0.9"] },
};

export function setup() {
  console.log(`\n🔥 SMOKE TEST | ${config.name} | ${config.baseUrl}\n`);
}

export default function () {
  group("Public", () => {
    const card = httpGet("/.well-known/agent-card.json", { public: true });
    check(null, { "agent card 200": () => card !== null });
    sleep(0.5);
  });

  group("Authenticated", () => {
    const balance = httpGet("/api/credits/balance");
    check(null, { "balance 200": () => balance !== null });
    sleep(0.5);
    const agents = httpGet("/api/v1/app/agents");
    check(null, { "agents 200": () => agents !== null });
    sleep(0.5);
    const a2a = httpPost("/api/a2a", { jsonrpc: "2.0", method: "a2a.getAgentCard", params: {}, id: 1 });
    check(null, { "a2a 200": () => a2a !== null });
  });
  sleep(2);
}

export function teardown() {
  console.log("\n✅ Smoke test complete\n");
}
