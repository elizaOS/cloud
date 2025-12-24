import { agentsRepository } from "@/db/repositories/agents";
import { entitiesRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

const DEFAULT_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";

async function ensureDefaultAgentEntity() {
  try {
    logger.info("🔍 Checking default agent entity...");

    const agentExists = await agentsRepository.exists(DEFAULT_AGENT_ID);
    if (!agentExists) {
      logger.warn("⚠️  Default agent doesn't exist in agents table");
      return;
    }

    const entityExists = await entitiesRepository.exists(DEFAULT_AGENT_ID);
    if (entityExists) {
      logger.info("✅ Default agent entity already exists");
      return;
    }

    logger.info("📝 Creating entity for default agent...");

    await entitiesRepository.create({
      id: DEFAULT_AGENT_ID,
      agentId: DEFAULT_AGENT_ID,
      names: ["Eliza", "Agent", "Build Assistant"],
      metadata: {
        type: "agent",
        isDefault: true,
        description: "Default Eliza agent for build mode",
      },
    });

    logger.info(
      `✨ Successfully created entity for default agent ${DEFAULT_AGENT_ID}`,
    );
  } catch (error) {
    logger.error("❌ Error ensuring default agent entity:", error);
    process.exit(1);
  }
}

ensureDefaultAgentEntity()
  .then(() => {
    logger.info("✓ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("✗ Script failed:", error);
    process.exit(1);
  });
