import { type IAgentRuntime, type Plugin, logger } from "@elizaos/core";
import { readResourceAction } from "./actions/readResourceAction";
import { provider } from "./provider";
import { McpService } from "./service";

// Re-export types
export * from "./types";

// Re-export service
export { McpService } from "./service";

// Re-export dynamic action utilities
export {
  createMcpToolAction,
  createMcpToolActions,
  isMcpToolAction,
  getMcpToolActionsForServer,
  type McpToolAction,
} from "./actions/dynamic-tool-actions";

// Re-export tool compatibility
export {
  createMcpToolCompatibilitySync,
  createMcpToolCompatibility,
  detectModelProvider,
  McpToolCompatibility,
  type ModelInfo,
  type ModelProvider,
} from "./tool-compatibility";

// Re-export schema cache
export { McpSchemaCache, getSchemaCache } from "./cache";

const mcpPlugin: Plugin = {
  name: "mcp",
  description: "Plugin for connecting to MCP (Model Context Protocol) servers",

  init: async (_config: Record<string, string>, _runtime: IAgentRuntime) => {
    logger.info("Initializing MCP plugin...");
  },

  services: [McpService],
  actions: [readResourceAction],
  providers: [provider],
};

export default mcpPlugin;
