/**
 * Build Mode Workflow
 * 
 * Character self-upgrade assistance mode.
 * The agent becomes a collaborative assistant focused on helping
 * the user improve its own character configuration.
 * 
 * This workflow is activated when the user enters "build mode" to modify
 * or upgrade the agent's character file.
 * 
 * Key differences from CHAT/ASSISTANT modes:
 * - Different system prompts focused on character development
 * - Access to the current character file for reference
 * - Specialized tools for character validation and testing
 * - More technical, development-oriented responses
 * 
 * TODO: Implement this workflow with specialized prompts and tools
 * 
 * Suggested implementation approach:
 * 1. Load current character file from workflow.metadata.targetCharacterId
 * 2. Use specialized system prompt for character development assistance
 * 3. Provide character file context in the state
 * 4. Use specialized providers for:
 *    - Character schema validation
 *    - Best practices documentation
 *    - Example character files
 * 5. Add actions for:
 *    - Validating character JSON
 *    - Testing character changes
 *    - Generating character documentation
 * 6. Generate response focused on character improvement
 */

import {
  asUUID,
  createUniqueUuid,
  EventType,
  type IAgentRuntime,
  logger,
  type Memory,
  type HandlerCallback,
  type UUID,
} from "@elizaos/core";
import { v4 } from "uuid";
import type { WorkflowConfig } from "../../workflow-types";
import {
  setLatestResponseId,
  clearLatestResponseId,
  isResponseStillValid,
} from "../utils/response-tracking";

/**
 * Workflow parameters
 */
export interface BuildWorkflowParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
  workflow: WorkflowConfig;
}

/**
 * Build Mode Workflow Handler (Placeholder)
 * 
 * This is a placeholder implementation that returns a message
 * indicating build mode is coming soon.
 */
export async function handleBuildModeWorkflow({
  runtime,
  message,
  callback,
  workflow,
}: BuildWorkflowParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();

  logger.info("[BuildMode] 🔧 BUILD MODE - Character upgrade workflow");
  logger.debug(
    `[BuildMode] Build mode metadata:`,
    JSON.stringify(workflow.metadata),
  );
  logger.debug(`[BuildMode] Generated response ID: ${responseId.substring(0, 8)}`);
  logger.debug(`[BuildMode] Generated run ID: ${runId.substring(0, 8)}`);

  await setLatestResponseId(runtime, message.roomId, responseId);

  // Emit run started event
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime,
    runId,
    messageId: message.id,
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
    source: "buildModeWorkflow",
  });

  try {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // Save the incoming message
    logger.debug("[BuildMode] Saving message to memory");
    await runtime.createMemory(message, "messages");

    // TODO: Implement full build mode workflow
    // For now, respond with a placeholder message

    const responseContent = `🔧 **Build Mode Active**

I'm ready to help you upgrade and improve my character configuration! 

This is a specialized mode where I can assist you with:
- Analyzing and improving my personality traits
- Adding new knowledge and capabilities
- Refining my communication style
- Validating character file structure
- Testing changes before deployment

What aspect of my character would you like to work on?

*Note: Full build mode implementation coming soon. Current character ID: ${workflow.metadata?.targetCharacterId || runtime.character.id}*`;

    // Check if this is still the latest response ID for this room
    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) {
      logger.info(
        `[BuildMode] Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`,
      );
      return;
    }

    // Clean up the response ID
    await clearLatestResponseId(runtime, message.roomId);

    // Create response memory
    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: {
        text: responseContent,
        thought: "Build mode placeholder response",
        source: "agent",
        inReplyTo: message.id,
      } as Memory["content"],
    };

    // Save response
    logger.debug("[BuildMode] Saving build mode response to memory");
    await runtime.createMemory(responseMemory, "messages");

    // Trigger callback with response
    if (callback) {
      await callback({ text: responseContent });
    }

    logger.info(`[BuildMode] Run ${runId.substring(0, 8)} completed successfully`);

    const endTime = Date.now();
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id,
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "completed",
      endTime,
      duration: endTime - startTime,
      source: "buildModeWorkflow",
    });
  } catch (error) {
    // Emit run ended event with error
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id,
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "error",
      endTime: Date.now(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      source: "buildModeWorkflow",
    });
    throw error;
  }
}
