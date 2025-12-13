import { describe, test, expect, beforeEach } from "bun:test";

const mockEnv: Record<string, string> = {};
globalThis.__ENV = new Proxy(mockEnv, {
  get: (target, prop) => target[prop as string],
  set: (target, prop, value) => { target[prop as string] = value; return true; },
});

import { environments, getEnvironment, getConfig, getBaseUrl } from "../config/environments";
import { thresholds, relaxedThresholds, getThresholds } from "../config/thresholds";
import { rampUpScenario, spikeScenario, soakScenario, throughputScenario, smokeScenario, stressScenario } from "../config/scenarios";

describe("Environment Configuration", () => {
  beforeEach(() => { mockEnv.LOAD_TEST_ENV = ""; mockEnv.BASE_URL = ""; });

  test("has all environments", () => {
    expect(environments.local).toBeDefined();
    expect(environments.staging).toBeDefined();
    expect(environments.production).toBeDefined();
  });

  test("each environment has required fields", () => {
    for (const env of Object.values(environments)) {
      expect(env.name).toBeDefined();
      expect(env.baseUrl).toBeDefined();
      expect(typeof env.maxVUs).toBe("number");
      expect(typeof env.safeMode).toBe("boolean");
    }
  });

  test("production has safeMode and lowest maxVUs", () => {
    expect(environments.production.safeMode).toBe(true);
    expect(environments.production.maxVUs).toBeLessThan(environments.staging.maxVUs);
  });

  test("getEnvironment defaults to local", () => {
    expect(getEnvironment()).toBe("local");
  });

  test("getEnvironment throws on invalid", () => {
    mockEnv.LOAD_TEST_ENV = "invalid";
    expect(() => getEnvironment()).toThrow();
  });

  test("getBaseUrl respects override", () => {
    mockEnv.LOAD_TEST_ENV = "local";
    mockEnv.BASE_URL = "http://custom:8080";
    expect(getBaseUrl()).toBe("http://custom:8080");
    mockEnv.BASE_URL = "";
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("Thresholds", () => {
  test("default has percentile checks", () => {
    expect(thresholds.http_req_duration.some(t => t.includes("p(95)"))).toBe(true);
    expect(thresholds.http_req_failed.some(t => t.includes("rate"))).toBe(true);
  });

  test("relaxed thresholds are more permissive", () => {
    const defaultP99 = parseInt(thresholds.http_req_duration[2].split("<")[1]);
    const relaxedP99 = parseInt(relaxedThresholds.http_req_duration[2].split("<")[1]);
    expect(relaxedP99).toBeGreaterThan(defaultP99);
  });

  test("getThresholds returns correct set", () => {
    expect(getThresholds(true)).toBe(thresholds);
    expect(getThresholds(false)).toBe(relaxedThresholds);
  });
});

describe("Scenarios", () => {
  beforeEach(() => { mockEnv.LOAD_TEST_ENV = "local"; });

  test("smokeScenario is minimal", () => {
    const s = smokeScenario();
    expect(s.executor).toBe("constant-vus");
    expect(s.vus).toBe(1);
  });

  test("rampUpScenario has stages ending at 0", () => {
    const s = rampUpScenario(100);
    expect(s.executor).toBe("ramping-vus");
    expect(s.stages[s.stages.length - 1].target).toBe(0);
  });

  test("stressScenario exceeds maxVUs", () => {
    const s = stressScenario();
    const peak = Math.max(...s.stages.map(x => x.target));
    expect(peak).toBeGreaterThan(environments.local.maxVUs);
  });

  test("throughputScenario uses constant-arrival-rate", () => {
    const s = throughputScenario(100, "5m");
    expect(s.executor).toBe("constant-arrival-rate");
    expect(s.rate).toBe(100);
  });
});

describe("Source Files", () => {
  test("agents.ts uses /api/v1/app/agents", async () => {
    const src = await Bun.file(import.meta.dir + "/../scenarios/api-v1/agents.ts").text();
    expect(src).toContain("/api/v1/app/agents");
    expect(src).toContain("expectedStatus: 201");
  });

  test("a2a/methods.ts uses real A2A methods", async () => {
    const src = await Bun.file(import.meta.dir + "/../scenarios/a2a/methods.ts").text();
    expect(src).toContain("message/send");
    expect(src).toContain("tasks/get");
    expect(src).toContain("tasks/cancel");
    expect(src).not.toContain("a2a.getBalance");
  });

  test("mcp/tools.ts calls real tools", async () => {
    const src = await Bun.file(import.meta.dir + "/../scenarios/mcp/tools.ts").text();
    expect(src).toContain("check_credits");
    expect(src).toContain("list_agents");
    expect(src).toContain("list_models");
  });

  test("smoke.ts uses http helpers", async () => {
    const src = await Bun.file(import.meta.dir + "/../scenarios/smoke.ts").text();
    expect(src).toContain("httpGet");
    expect(src).toContain("httpPost");
  });
});

describe("Shell Scripts", () => {
  test("run-local.sh checks k6 and server", async () => {
    const src = await Bun.file(import.meta.dir + "/../scripts/run-local.sh").text();
    expect(src).toContain("command -v k6");
    expect(src).toContain("curl");
  });

  test("run-production.sh requires confirmation", async () => {
    const src = await Bun.file(import.meta.dir + "/../scripts/run-production.sh").text();
    expect(src).toContain("PROD_API_KEY");
  });
});

describe("CI Workflow", () => {
  test("load-tests.yml exists and has correct structure", async () => {
    const src = await Bun.file(import.meta.dir + "/../../.github/workflows/load-tests.yml").text();
    expect(src).toContain("k6 run");
    expect(src).toContain("upload-artifact");
    expect(src).toContain("schedule");
  });
});
