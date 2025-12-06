/**
 * Agent Runtime - Simplified interface for MCP tool compatibility
 * Provides getRuntime() and handleMessage() for agent operations
 */

import { stringToUuid, type UUID, type Memory } from "@elizaos/core";
import { runtimeFactory } from "./runtime-factory";
import { sendMessageWithSideEffects } from "./send-message";
import { userContextService } from "./user-context";
import { AgentMode } from "./agent-mode-types";
import { participantsRepository } from "@/db/repositories";

interface HandleMessageInput {
  text: string;
  attachments?: Array<{
    type: "image" | "file";
    url: string;
    filename?: string;
    mimeType?: string;
  }>;
}

interface HandleMessageResult {
  message: Memory;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
}

class AgentRuntime {
  /**
   * Get a system runtime for operations
   */
  async getRuntime() {
    return await runtimeFactory.getSystemRuntime();
  }

  /**
   * Handle a message in a room
   * Used for MCP tool compatibility
   */
  async handleMessage(
    roomId: string,
    input: HandleMessageInput,
  ): Promise<HandleMessageResult> {
    // Get entity IDs from room
    const entityIds = await participantsRepository.getEntityIdsByRoomId(roomId);
    const entityId = entityIds.find((id) => id !== "system") || entityIds[0];
    
    if (!entityId) {
      throw new Error(`No entity found in room ${roomId}`);
    }

    // Create system context for the operation
    const systemContext = userContextService.createSystemContext(AgentMode.CHAT);
    
    // Get runtime (plugins loaded based on agentMode)
    const runtime = await runtimeFactory.createRuntimeForUser(systemContext);

    // Send message via plugin event handlers
    const result = await sendMessageWithSideEffects(
      runtime,
      stringToUuid(roomId) as UUID,
      stringToUuid(entityId) as UUID,
      {
        text: input.text,
        attachments: input.attachments || [],
        source: "mcp",
      },
      systemContext,
    );

    // Extract response message
    const responseContent = result.result?.responseContent;
    const agentMessage: Memory = {
      id: result.messageId as UUID,
      entityId: runtime.agentId,
      roomId: stringToUuid(roomId) as UUID,
      content: responseContent || { text: "", source: "agent" },
      createdAt: result.userMessage.createdAt || Date.now(),
    };

    // Note: Usage tracking is handled by MODEL_USED events in plugin-elizacloud,
    // which routes through the billing gateway. Usage isn't passed through the callback,
    // so this will always be undefined. Kept for interface compatibility.
    const usage = undefined;

    return {
      message: agentMessage,
      usage,
    };
  }
}

export const agentRuntime = new AgentRuntime();

