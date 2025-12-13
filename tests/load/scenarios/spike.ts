import { sleep } from "k6";
import { Options } from "k6/options";
import { getConfig } from "../config/environments";
import { spikeScenario } from "../config/scenarios";
import { relaxedThresholds } from "../config/thresholds";

import { listAgents } from "./api-v1/agents";
import { getBalance } from "./api-v1/credits";
import { checkCredits, listModels } from "./mcp/tools";
import { getAgentCard, sendMessage } from "./a2a/methods";

const config = getConfig();

export const options: Options = {
  scenarios: { spike: spikeScenario(config.maxVUs * 2) },
  thresholds: relaxedThresholds,
};

export function setup() {
  console.log(`\n📈 SPIKE TEST | ${config.name} | Peak: ${config.maxVUs * 2} VUs\n`);
}

export default function () {
  const ops = [getAgentCard, getBalance, listAgents, checkCredits, () => sendMessage("ping"), listModels];
  ops[__ITER % ops.length]();
  sleep(0.05);
}

export function teardown() {
  console.log("\n✅ Spike test complete\n");
}
