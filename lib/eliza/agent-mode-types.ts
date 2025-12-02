/**
 * Agent Mode Types
 * Defines how the agent processes messages based on different operational modes
 */

/**
 * Available agent modes for message processing
 * Each mode loads a specific set of plugins optimized for that use case
 */
export enum AgentMode {
  /** Chat mode - Fast single-shot responses for playground/simple conversations */
  CHAT = "chat",

  /** Build mode - Agent assists in creating/modifying character files */
  BUILD = "build",

  /** Assistant mode - Planning-based with action execution and knowledge access */
  ASSISTANT = "assistant",
}

/**
 * Agent mode configuration passed with messages
 */
export interface AgentModeConfig {
  /** The operational mode for this interaction */
  mode: AgentMode;

  /** Optional metadata for mode-specific parameters */
  metadata?: Record<string, unknown>;
}

/**
 * Default agent mode configuration
 */
export const DEFAULT_AGENT_MODE: AgentModeConfig = {
  mode: AgentMode.CHAT,
};

/**
 * Type guard to check if a value is a valid AgentMode
 */
export function isValidAgentMode(mode: unknown): mode is AgentMode {
  return (
    typeof mode === "string" &&
    Object.values(AgentMode).includes(mode as AgentMode)
  );
}

/**
 * Type guard to check if a value is a valid AgentModeConfig
 */
export function isValidAgentModeConfig(
  config: unknown,
): config is AgentModeConfig {
  if (!config || typeof config !== "object") {
    return false;
  }

  const cfg = config as Record<string, unknown>;

  // Check if mode is valid
  if (!cfg.mode || !isValidAgentMode(cfg.mode)) {
    return false;
  }

  // Check metadata if present
  if (cfg.metadata !== undefined) {
    if (
      typeof cfg.metadata !== "object" ||
      cfg.metadata === null ||
      Array.isArray(cfg.metadata)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Plugin sets for each agent mode
 * These define which plugins are loaded for each operational mode
 */
export const AGENT_MODE_PLUGINS = {
  [AgentMode.CHAT]: [
    "@elizaos/plugin-elizacloud",
    "@eliza-cloud/plugin-chat-playground",
    "@elizaos/plugin-memory",
    "@elizaos/plugin-mcp",
  ],
  [AgentMode.BUILD]: [
    "@elizaos/plugin-elizacloud",
    "@eliza-cloud/plugin-character-builder",
    "@elizaos/plugin-memory",
  ],
  [AgentMode.ASSISTANT]: [
    "@elizaos/plugin-elizacloud",
    "@eliza-cloud/plugin-assistant",
    "@elizaos/plugin-memory",
    "@elizaos/plugin-knowledge",
    "@elizaos/plugin-mcp",
  ],
} as const;
