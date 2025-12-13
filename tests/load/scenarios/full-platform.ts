import { group, sleep } from "k6";
import { Options } from "k6/options";
import { getConfig } from "../config/environments";
import { getThresholds } from "../config/thresholds";
import { rampUpScenario } from "../config/scenarios";

import { agentCrudCycle, agentReadOnly } from "./api-v1/agents";
import { creditOperationsCycle, balancePolling } from "./api-v1/credits";
import { lightMcpTools, fullMcpToolsCoverage } from "./mcp/tools";
import { lightA2aMethods, fullA2aMethodsCoverage, criticalA2aMethods } from "./a2a/methods";

const config = getConfig();
const isSafe = config.safeMode;

export const options: Options = {
  scenarios: {
    warmup: { executor: "constant-vus", vus: 2, duration: "30s", startTime: "0s", exec: "warmup" },
    main: { ...rampUpScenario(config.maxVUs), startTime: "30s", exec: "mainLoad" },
    critical: { executor: "constant-vus", vus: 5, duration: config.testDuration, startTime: "30s", exec: "criticalPath" },
  },
  thresholds: getThresholds(true),
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

export function warmup() {
  group("Warmup", () => criticalA2aMethods());
}

export function mainLoad() {
  const s = __ITER % 8;
  if (s < 2) creditOperationsCycle();
  else if (s < 4) isSafe ? lightMcpTools() : fullMcpToolsCoverage();
  else if (s < 6) isSafe ? lightA2aMethods() : fullA2aMethodsCoverage();
  else isSafe ? agentReadOnly() : agentCrudCycle();
}

export function criticalPath() {
  criticalA2aMethods();
  sleep(2);
  balancePolling();
  sleep(2);
}

export default function () {
  mainLoad();
}

export function setup() {
  console.log(`\n🚀 FULL PLATFORM | ${config.name} | VUs: ${config.maxVUs} | Safe: ${isSafe}\n`);
}

export function teardown() {
  console.log("\n✅ Load test complete\n");
}
