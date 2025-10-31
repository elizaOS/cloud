// Knowledge service helper for accessing the knowledge plugin
import type { AgentRuntime } from "@elizaos/core";
import type { KnowledgeService as KnowledgeServiceType } from "@elizaos/plugin-knowledge";

/**
 * Get the knowledge service from runtime, with retry logic
 * Returns null if the plugin is not loaded after retries
 */
export async function getKnowledgeService(
  runtime: AgentRuntime,
): Promise<KnowledgeServiceType | null> {
  try {
    // Try to get the service immediately
    let service = runtime.getService("knowledge") as KnowledgeServiceType | null;
    if (service) {
      return service;
    }

    // Service not immediately available, wait a bit for it to load
    console.log("[KnowledgeService] Waiting for service to load...");
    
    // Retry a few times with delay
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      service = runtime.getService("knowledge") as KnowledgeServiceType | null;
      if (service) {
        console.log(`[KnowledgeService] Service loaded after ${i + 1} retries`);
        return service;
      }
    }
    
    // Service not available after retries
    console.warn("[KnowledgeService] Service not available after retries");
    return null;
  } catch (error) {
    console.warn("[KnowledgeService] Error getting service:", error);
    return null;
  }
}

/**
 * Check if knowledge service is available in the runtime
 */
export async function hasKnowledgeService(runtime: AgentRuntime): Promise<boolean> {
  const service = await getKnowledgeService(runtime);
  return service !== null;
}
