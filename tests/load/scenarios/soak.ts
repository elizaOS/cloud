import { sleep } from "k6";
import { Options } from "k6/options";
import { getConfig } from "../config/environments";
import { soakScenario } from "../config/scenarios";
import { getThresholds } from "../config/thresholds";

import { agentReadOnly } from "./api-v1/agents";
import { creditOperationsCycle } from "./api-v1/credits";
import { lightMcpTools } from "./mcp/tools";
import { lightA2aMethods } from "./a2a/methods";

const config = getConfig();
const DURATION = __ENV.SOAK_DURATION || "30m";

export const options: Options = {
  scenarios: { soak: soakScenario(Math.floor(config.maxVUs * 0.3), DURATION) },
  thresholds: getThresholds(true),
};

export function setup() {
  console.log(`\n🕐 SOAK TEST | ${config.name} | Duration: ${DURATION}\n`);
}

export default function main() {
  const ops = [
    creditOperationsCycle,
    lightMcpTools,
    lightA2aMethods,
    agentReadOnly,
  ];
  ops[__ITER % ops.length]();
  sleep(2);
}

export function teardown() {
  console.log("\n✅ Soak test complete\n");
}
