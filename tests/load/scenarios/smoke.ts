import { group, check, sleep } from "k6";
import { Options } from "k6/options";
import http from "k6/http";
import { getBaseUrl, getConfig } from "../config/environments";
import { getAuthHeaders, getPublicHeaders } from "../helpers/auth";
import { smokeScenario } from "../config/scenarios";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const publicHeaders = getPublicHeaders();
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
    check(http.get(`${baseUrl}/.well-known/agent-card.json`, { headers: publicHeaders }), { "agent card 200": (r) => r.status === 200 });
    sleep(0.5);
  });

  group("Authenticated", () => {
    check(http.get(`${baseUrl}/api/credits/balance`, { headers }), { "balance 200": (r) => r.status === 200 });
    sleep(0.5);
    check(http.get(`${baseUrl}/api/v1/app/agents`, { headers }), { "agents 200": (r) => r.status === 200 });
    sleep(0.5);
    check(
      http.post(`${baseUrl}/api/a2a`, JSON.stringify({ jsonrpc: "2.0", method: "a2a.getAgentCard", params: {}, id: 1 }), { headers }),
      { "a2a 200": (r) => r.status === 200 }
    );
  });
  sleep(2);
}

export function teardown() {
  console.log("\n✅ Smoke test complete\n");
}
