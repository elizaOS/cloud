import http from "k6/http";
import { check } from "k6";
import { Options } from "k6/options";
import { getBaseUrl, getConfig } from "../config/environments";
import { getAuthHeaders, getPublicHeaders } from "../helpers/auth";
import { throughputScenario } from "../config/scenarios";
import { getThresholds } from "../config/thresholds";
import { Trend } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const publicHeaders = getPublicHeaders();
const config = getConfig();

const LIGHT_RPS = 500,
  MEDIUM_RPS = 200,
  HEAVY_RPS = 50;
const throughputAchieved = new Trend("throughput_achieved");

export const options: Options = {
  scenarios: {
    light: { ...throughputScenario(LIGHT_RPS, "3m"), exec: "lightEndpoints" },
    medium: {
      ...throughputScenario(MEDIUM_RPS, "3m"),
      startTime: "3m",
      exec: "mediumEndpoints",
    },
    heavy: {
      ...throughputScenario(HEAVY_RPS, "3m"),
      startTime: "6m",
      exec: "heavyEndpoints",
    },
  },
  thresholds: {
    ...getThresholds(false),
    "http_req_duration{type:light}": ["p(95)<100"],
    "http_req_duration{type:medium}": ["p(95)<300"],
    "http_req_duration{type:heavy}": ["p(95)<1000"],
  },
};

export function setup() {
  console.log(
    `\n📊 THROUGHPUT TEST | ${config.name} | L:${LIGHT_RPS} M:${MEDIUM_RPS} H:${HEAVY_RPS} RPS\n`,
  );
}

export function lightEndpoints() {
  const urls = [
    `${baseUrl}/.well-known/agent-card.json`,
    `${baseUrl}/api/openapi.json`,
  ];
  check(
    http.get(urls[__ITER % urls.length], {
      headers: publicHeaders,
      tags: { type: "light" },
    }),
    { "light 200": (r) => r.status === 200 },
  );
  throughputAchieved.add(1);
}

export function mediumEndpoints() {
  const ops = [
    () =>
      http.get(`${baseUrl}/api/credits/balance`, {
        headers,
        tags: { type: "medium" },
      }),
    () =>
      http.get(`${baseUrl}/api/v1/app/agents`, {
        headers,
        tags: { type: "medium" },
      }),
    () =>
      http.post(
        `${baseUrl}/api/a2a`,
        JSON.stringify({
          jsonrpc: "2.0",
          method: "a2a.getBalance",
          params: {},
          id: Date.now(),
        }),
        { headers, tags: { type: "medium" } },
      ),
  ];
  check(ops[__ITER % ops.length](), { "medium 200": (r) => r.status === 200 });
  throughputAchieved.add(1);
}

export function heavyEndpoints() {
  const ops = [
    () =>
      http.post(
        `${baseUrl}/api/mcp`,
        JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "list_agents", arguments: {} },
          id: Date.now(),
        }),
        { headers, tags: { type: "heavy" } },
      ),
    () =>
      http.post(
        `${baseUrl}/api/v1/discovery`,
        JSON.stringify({ sources: ["local"], limit: 10 }),
        { headers, tags: { type: "heavy" } },
      ),
    () =>
      http.get(`${baseUrl}/api/credits/transactions?limit=20`, {
        headers,
        tags: { type: "heavy" },
      }),
  ];
  check(ops[__ITER % ops.length](), { "heavy 200": (r) => r.status === 200 });
  throughputAchieved.add(1);
}

export default function () {
  mediumEndpoints();
}

export function teardown() {
  console.log("\n✅ Throughput test complete\n");
}
