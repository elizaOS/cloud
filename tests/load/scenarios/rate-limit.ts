import http from "k6/http";
import { check, group, sleep } from "k6";
import { Options } from "k6/options";
import { getBaseUrl, getConfig } from "../config/environments";
import { getAuthHeaders } from "../helpers/auth";
import {
  rateLimitHits,
  rateLimitRate,
  recordHttpError,
} from "../helpers/metrics";
import { Counter, Rate, Trend } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const config = getConfig();

const requestsBeforeLimit = new Counter("requests_before_limit");
const rateLimitRecoveryTime = new Trend("rate_limit_recovery_time");
const rateLimitResponses = new Rate("rate_limit_response_rate");

export const options: Options = {
  scenarios: {
    rate_limit_test: {
      executor: "constant-arrival-rate",
      rate: 200,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.5"],
    rate_limit_response_rate: ["rate<0.3"],
  },
};

export function setup() {
  console.log(`\n⚡ RATE LIMIT TEST | ${config.name} | 200 RPS\n`);
}

function makeRequest() {
  const res = http.get(`${baseUrl}/api/credits/balance`, {
    headers,
    tags: { endpoint: "rate_limit_test" },
  });
  if (res.status === 429) {
    rateLimitHits.add(1);
    rateLimitRate.add(1);
    rateLimitResponses.add(1);
    const ra = res.headers["Retry-After"];
    if (ra) rateLimitRecoveryTime.add(parseInt(ra) * 1000);
  } else if (res.status >= 200 && res.status < 300) {
    requestsBeforeLimit.add(1);
    rateLimitResponses.add(0);
  } else {
    recordHttpError(res.status);
    rateLimitResponses.add(0);
  }
}

export function burstTest() {
  group("Burst", () => {
    for (let i = 0; i < 20; i++) makeRequest();
  });
  sleep(0.1);
}

export function recoveryTest() {
  group("Recovery", () => {
    for (let i = 0; i < 50; i++) {
      const res = http.get(`${baseUrl}/api/credits/balance`, { headers });
      if (res.status === 429) break;
    }
    sleep(5);
    check(http.get(`${baseUrl}/api/credits/balance`, { headers }), {
      recovered: (r) => r.status === 200,
    });
  });
  sleep(10);
}

export default function () {
  makeRequest();
}

export function teardown() {
  console.log("\n✅ Rate limit test complete\n");
}
