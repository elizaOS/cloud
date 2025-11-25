/**
 * Workflow Types - Defines different message processing workflows
 * 
 * This module defines the different ways messages can be processed by the agent.
 * Each workflow has its own prompts, behaviors, and capabilities.
 */

/**
 * Available workflow modes for message processing
 */
export enum WorkflowMode {
  /** Chat mode - Single-shot fast response for playground/simple conversations */
  CHAT = "chat",
  
  /** Assistant mode - Planning-based with action execution capabilities */
  ASSISTANT = "assistant",
  
  /** Build mode - Agent assists in upgrading/modifying its own character file */
  BUILD = "build",
  
  /** Future workflow modes can be added here */
  // ANALYZE = "analyze",
  // DEBUG = "debug",
  // TEACH = "teach",
}

/**
 * Workflow configuration passed through the message pipeline
 */
export interface WorkflowConfig {
  mode: WorkflowMode;
  
  /** Additional workflow-specific metadata */
  metadata?: {
    /** For BUILD mode: which character is being edited */
    targetCharacterId?: string;
    
    /** For BUILD mode: current character file content */
    currentCharacterFile?: string;
    
    /** Generic key-value pairs for future workflows */
    [key: string]: unknown;
  };
}

/**
 * Default workflow configuration (standard chat)
 */
export const DEFAULT_WORKFLOW: WorkflowConfig = {
  mode: WorkflowMode.CHAT,
};

/**
 * Helper to check if a workflow is in chat mode (fast, single-shot)
 */
export function isChatMode(config: WorkflowConfig): boolean {
  return config.mode === WorkflowMode.CHAT;
}

/**
 * Helper to check if a workflow is in assistant mode (planning + actions)
 */
export function isAssistantMode(config: WorkflowConfig): boolean {
  return config.mode === WorkflowMode.ASSISTANT;
}

/**
 * Helper to check if a workflow is in build mode
 */
export function isBuildMode(config: WorkflowConfig): boolean {
  return config.mode === WorkflowMode.BUILD;
}

/**
 * Type guard to validate workflow config
 */
export function isValidWorkflowConfig(config: unknown): config is WorkflowConfig {
  if (!config || typeof config !== "object") return false;
  
  const wc = config as WorkflowConfig;
  return (
    typeof wc.mode === "string" &&
    Object.values(WorkflowMode).includes(wc.mode as WorkflowMode)
  );
}
