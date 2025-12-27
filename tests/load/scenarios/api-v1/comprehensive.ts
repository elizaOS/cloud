/**
 * Comprehensive API Test Scenario
 * Tests all verified working API endpoints
 */

import { group, check, sleep } from "k6";
import { Options } from "k6/options";
import { getConfig, getBaseUrl } from "../../config/environments";
import { httpGet, httpPost } from "../../helpers/http";

const config = getConfig();
const baseUrl = getBaseUrl();

export const options: Options = {
  scenarios: {
    comprehensive: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: 3 },
        { duration: "30s", target: 3 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    checks: ["rate>0.95"],
    http_req_duration: ["p(95)<3000"],
  },
};

export function setup() {
  console.log(`\n🔬 COMPREHENSIVE API TEST | ${config.name} | ${baseUrl}\n`);
}

export default function () {
  // 1. Public - Agent Card
  group("Discovery", () => {
    const card = httpGet<{ name: string; protocolVersion: string }>("/.well-known/agent-card.json", { public: true });
    check(card, {
      "agent card loaded": (c) => c !== null && typeof c.name === "string",
    });
    sleep(0.3);
  });

  // 2. Auth - Credits Balance
  group("Credits", () => {
    const balance = httpGet<{ balance: number }>("/api/credits/balance");
    check(balance, {
      "balance returned": (b) => b !== null && typeof b.balance === "number",
    });
    sleep(0.3);
  });

  // 3. Auth - List Agents
  group("Agents", () => {
    const result = httpGet<{ success: boolean; agents: unknown[] }>("/api/v1/app/agents");
    check(result, {
      "agents listed": (r) => r !== null && r.success === true,
    });
    sleep(0.3);
  });

  // 4. Public - A2A Service Discovery
  group("A2A Discovery", () => {
    const info = httpGet<{ name: string; methods: unknown[] }>("/api/a2a", { public: true });
    check(info, {
      "a2a service info": (i) => i !== null && typeof i.name === "string",
    });
    sleep(0.3);
  });

  // 5. Auth - A2A Task Query (404 expected)
  group("A2A Tasks", () => {
    const result = httpPost<{ jsonrpc: string; error?: { code: number } }>("/api/a2a", {
      jsonrpc: "2.0",
      method: "tasks/get",
      params: { id: `test-${Date.now()}` },
      id: 1,
    }, { expectedStatus: 404 });
    check(result, {
      "a2a task query": (r) => r !== null && r.jsonrpc === "2.0",
    });
    sleep(0.3);
  });

  sleep(0.5);
}

export function teardown() {
  console.log("\n✅ Comprehensive API test complete\n");
}
