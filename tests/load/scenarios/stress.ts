import { group, sleep } from "k6";
import { Options } from "k6/options";
import { getConfig } from "../config/environments";
import { stressScenario } from "../config/scenarios";
import { relaxedThresholds } from "../config/thresholds";

import { listAgents, createAgent, deleteAgent } from "./api-v1/agents";
import { getBalance, listTransactions } from "./api-v1/credits";
import { checkCredits } from "./mcp/tools";
import { sendMessage } from "./a2a/methods";

const config = getConfig();

export const options: Options = {
  scenarios: { stress: stressScenario() },
  thresholds: relaxedThresholds,
};

export function setup() {
  console.log(
    `\n⚡ STRESS TEST | ${config.name} | Max VUs: ${Math.floor(config.maxVUs * 1.5)}\n`,
  );
}

export default function () {
  const op = __ITER % 5;
  switch (op) {
    case 0:
      group("Balance Stress", () => {
        for (let i = 0; i < 10; i++) getBalance();
      });
      break;
    case 1:
      group("List Stress", () => {
        listAgents();
        listTransactions(20);
      });
      break;
    case 2:
      group("MCP Stress", () => {
        for (let i = 0; i < 5; i++) checkCredits();
      });
      break;
    case 3:
      group("A2A Stress", () => {
        for (let i = 0; i < 3; i++) sendMessage("ping");
      });
      break;
    case 4:
      if (!config.safeMode) {
        group("CRUD Stress", () => {
          const id = createAgent();
          if (id) deleteAgent(id);
        });
      }
      break;
  }
  sleep(0.1);
}

export function teardown() {
  console.log("\n✅ Stress test complete\n");
}
