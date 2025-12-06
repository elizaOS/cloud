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
    
    // Get runtime and ElizaOS instance
    const runtime = await runtimeFactory.createRuntimeForUser(systemContext);
    const elizaOS = runtimeFactory.getElizaOS();

    // Send message
    const result = await sendMessageWithSideEffects(
      elizaOS,
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
    const responseContent = result.processing?.responseContent;
    const agentMessage: Memory = {
      id: result.messageId as UUID,
      entityId: runtime.agentId,
      roomId: stringToUuid(roomId) as UUID,
      content: responseContent || { text: "", source: "agent" },
      createdAt: result.userMessage.createdAt || Date.now(),
    };

    // Extract usage if available
    const usage = result.processing?.usage
      ? {
          inputTokens: result.processing.usage.inputTokens || 0,
          outputTokens: result.processing.usage.outputTokens || 0,
          model: result.processing.usage.model || "eliza-agent",
        }
      : undefined;

    return {
      message: agentMessage,
      usage,
    };
  }
}

export const agentRuntime = new AgentRuntime();

