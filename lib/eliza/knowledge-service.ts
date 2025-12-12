/**
 * Knowledge service access helpers.
 */

import type { AgentRuntime } from "@elizaos/core";
import type { KnowledgeService as KnowledgeServiceType } from "@elizaos/plugin-knowledge";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export async function getKnowledgeService(
  runtime: AgentRuntime,
): Promise<KnowledgeServiceType | null> {
  let service = runtime.getService("knowledge") as KnowledgeServiceType | null;
  if (service) return service;

  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    service = runtime.getService("knowledge") as KnowledgeServiceType | null;
    if (service) return service;
  }

  return null;
}

export async function hasKnowledgeService(
  runtime: AgentRuntime,
): Promise<boolean> {
  return (await getKnowledgeService(runtime)) !== null;
}
