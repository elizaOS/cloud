import { group, sleep } from "k6";
import { httpGet } from "../../helpers/http";
import { Counter, Trend } from "k6/metrics";

const cronJobsTriggered = new Counter("cron_jobs_triggered");
const cronJobLatency = new Trend("cron_job_latency");

const CRON_ENDPOINTS = [
  { name: "auto-top-up", path: "/api/cron/auto-top-up", timeout: 5000 },
  {
    name: "cleanup-sessions",
    path: "/api/cron/cleanup-anonymous-sessions",
    timeout: 3000,
  },
  { name: "domain-health", path: "/api/cron/domain-health", timeout: 10000 },
  { name: "agent-budgets", path: "/api/cron/agent-budgets", timeout: 5000 },
  { name: "health-check", path: "/api/v1/cron/health-check", timeout: 5000 },
];

function getCronHeaders() {
  const key = __ENV.CRON_SECRET;
  if (!key && __ENV.LOAD_TEST_ENV !== "local")
    throw new Error("CRON_SECRET required");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key || "test-cron-secret"}`,
  };
}

export function triggerCronEndpoint(ep: {
  name: string;
  path: string;
  timeout: number;
}): boolean {
  const start = Date.now();
  const body = httpGet(ep.path, {
    headers: getCronHeaders(),
    tags: { endpoint: "cron", job: ep.name },
    timeout: `${ep.timeout * 2}ms`,
  });
  cronJobLatency.add(Date.now() - start);
  if (!body) return false;
  cronJobsTriggered.add(1);
  return true;
}

export function testAllCronEndpoints() {
  group("All Cron", () => {
    for (const ep of CRON_ENDPOINTS) {
      triggerCronEndpoint(ep);
      sleep(1);
    }
  });
}

export function testCriticalCronEndpoints() {
  group("Critical Cron", () => {
    for (const ep of CRON_ENDPOINTS.filter((e) =>
      ["auto-top-up", "agent-budgets", "health-check"].includes(e.name),
    )) {
      triggerCronEndpoint(ep);
      sleep(0.5);
    }
  });
}

export default function main() {
  testCriticalCronEndpoints();
}
