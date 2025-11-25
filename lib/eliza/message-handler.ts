/**
 * Message Handler - Processes messages with user context
 * Handles message flow, connection management, and usage tracking
 */

import { v4 as uuidv4 } from "uuid";
import {
  AgentRuntime,
  ChannelType,
  EventType,
  Memory,
  stringToUuid,
  elizaLogger,
  type UUID,
} from "@elizaos/core";
import { connectionCache } from "@/lib/cache/connection-cache";
import type { UserContext } from "./user-context";
import { logger } from "@/lib/utils/logger";
import { creditsService, anonymousSessionsService } from "@/lib/services";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
import { discordService } from "@/lib/services/discord";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { generateRoomTitle } from "@/lib/ai/generate-room-title";

export interface MessageResult {
  message: Memory;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
}

export interface MessageOptions {
  roomId: string;
  entityId: string;
  text: string;
  attachments?: unknown[];
  characterId?: string;
  model?: string;
}

export class MessageHandler {
  constructor(
    private runtime: AgentRuntime,
    private userContext: UserContext
  ) {
    // Runtime already has all settings including API key
    // No need for additional context injection
  }
  
  /**
   * Process a message through the ElizaOS runtime
   * Returns the agent's response and usage information
   */
  async process(options: MessageOptions): Promise<MessageResult> {
    const { roomId, entityId, text, attachments } = options;
    
    elizaLogger.info(
      `[MessageHandler] Processing message for user ${this.userContext.userId} in room ${roomId}`
    );
    
    // 1. Ensure connection exists (with caching)
    await this.ensureConnection(roomId, entityId);
    
    // 2. Create user message
    const userMessage = this.createMessage(roomId, entityId, { text, attachments });
    
    // 3. Process through runtime (API key already configured in runtime)
    let responseText: string | undefined;
    let responseAttachments: unknown[] | undefined;
    let usage: MessageResult["usage"];
    
    try {
      // Process message through event pipeline
      await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime: this.runtime,
        message: userMessage,
        callback: async (result: {
          text?: string;
          attachments?: unknown[];
          usage?: {
            inputTokens: number;
            outputTokens: number;
            model: string;
          };
        }) => {
          elizaLogger.debug("[MessageHandler] Message processed, received response");
          
          if (result.text) {
            responseText = result.text;
          }
          if (result.attachments) {
            responseAttachments = result.attachments;
          }
          if (result.usage) {
            usage = result.usage;
          }
          
          return [];
        },
      });
    } catch (error) {
      elizaLogger.error("[MessageHandler] Error during message processing:", error instanceof Error ? error.message : String(error));
      
      // Check if it's an API key error
      if (error instanceof Error && error.message.includes("API key")) {
        responseText = "⚠️ Configuration error: ElizaCloud API key is missing or invalid. Please try logging out and back in.";
      } else {
        responseText = "I apologize, but I encountered an error processing your message. Please try again.";
      }
    }
    
    // 4. Create response memory object
    const responseMemory = this.createResponseMemory(
      roomId,
      responseText || "I'm sorry, I couldn't generate a response.",
      responseAttachments
    );
    
    // 5. Track usage and credits (if not anonymous)
    if (!this.userContext.isAnonymous && usage) {
      await this.trackUsage(usage);
    }
    
    // 6. Handle anonymous session tracking
    if (this.userContext.isAnonymous && this.userContext.sessionToken) {
      await this.incrementAnonymousMessageCount();
    }
    
    // 7. Fire-and-forget side effects (Discord, room title generation)
    this.handleSideEffects(roomId, text, responseText || "", options.characterId);
    
    elizaLogger.success(
      `[MessageHandler] Message processed successfully for user ${this.userContext.userId}`
    );

    console.log("FINAL USAGE ************\n", usage);
    
    return {
      message: responseMemory,
      usage,
    };
  }
  
  /**
   * Ensure connection exists between user and room
   * Uses connection cache to avoid redundant database calls
   */
  private async ensureConnection(roomId: string, entityId: string): Promise<void> {
    const cached = await connectionCache.isEstablished(roomId, entityId);
    
    if (!cached) {
      elizaLogger.debug(
        `[MessageHandler] Establishing connection for room ${roomId}, entity ${entityId}`
      );
      
      const entityUuid = stringToUuid(entityId) as UUID;
      const worldId = stringToUuid("eliza-world") as UUID;
      
      // Use ensureConnections (plural) for more robust entity/room creation
      await this.runtime.ensureConnections(
        [
          {
            id: entityUuid,
            names: [entityId],
            metadata: {
              name: entityId,
              web: {
                userName: entityId,
                userId: this.userContext.userId,
                organizationId: this.userContext.organizationId,
              },
            },
          },
        ],
        [
          {
            id: roomId as UUID,
            name: entityId,
            type: ChannelType.DM,
            channelId: roomId,
          },
        ],
        "web",
        {
          id: worldId,
          name: "eliza-world",
          serverId: "eliza-server",
        },
      );
      
      await connectionCache.markEstablished(roomId, entityId);
      elizaLogger.debug("[MessageHandler] Connection established and cached");
    } else {
      elizaLogger.debug("[MessageHandler] Using cached connection");
    }
  }
  
  /**
   * Create a message memory object
   */
  private createMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: unknown[] }
  ): Memory {
    const entityUuid = stringToUuid(entityId) as UUID;
    
    return {
      id: uuidv4() as UUID,
      roomId: roomId as UUID,
      entityId: entityUuid,
      agentId: this.runtime.agentId as UUID,
      createdAt: Date.now(),
      content: {
        text: content.text || "",
        ...(content.attachments &&
        Array.isArray(content.attachments) &&
        content.attachments.length > 0
          ? {
              attachments: content.attachments as unknown as import("@elizaos/core").Media[],
            }
          : {}),
      },
    };
  }
  
  /**
   * Create response memory object
   */
  private createResponseMemory(
    roomId: string,
    text: string,
    attachments?: unknown[]
  ): Memory {
    const content: Record<string, unknown> = {
      text,
      type: "agent",
      source: "agent",
    };
    
    if (attachments && attachments.length > 0) {
      content.attachments = attachments;
      elizaLogger.debug(
        `[MessageHandler] Including ${attachments.length} attachment(s) in response`
      );
    }
    
    return {
      id: uuidv4() as UUID,
      roomId: roomId as UUID,
      entityId: this.runtime.agentId as UUID,
      agentId: this.runtime.agentId as UUID,
      createdAt: Date.now(),
      content: content as Memory["content"],
    };
  }
  
  /**
   * Deduct credits for message processing
   * Note: Token usage tracking is now handled by MODEL_USED events in plugin-assistant
   */
  private async trackUsage(usage: MessageResult["usage"]): Promise<void> {
    console.log("********* received USAGE ************\n", usage);
    if (!usage || !this.userContext.organizationId) return;
    
    try {
      const model = usage.model || "gpt-4o";
      const provider = getProviderFromModel(model);
      const costResult = await calculateCost(
        model,
        provider,
        usage.inputTokens,
        usage.outputTokens
      );
      
      // Deduct credits from organization balance
      const deductResult = await creditsService.deductCredits({
        organizationId: this.userContext.organizationId,
        amount: costResult.totalCost,
        description: "Eliza chat message",
        metadata: {
          model,
          provider,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          userId: this.userContext.userId,
        },
      });
      
      // Note: Usage records are created by MODEL_USED event listener in plugin-assistant
      // No need to duplicate that here
      
      // Check if credits are running low
      if (deductResult.newBalance < 1.0) {
        logger.warn(
          `[MessageHandler] Low credits for org ${this.userContext.organizationId}: ${deductResult.newBalance}`
        );
      }
      
      logger.info(
        `[MessageHandler] Deducted credits - tokens: ${usage.inputTokens}/${usage.outputTokens}, cost: ${costResult.totalCost}, balance: ${deductResult.newBalance}`
      );
    } catch (error) {
      logger.error("[MessageHandler] Credit deduction error:", error);
      // Don't fail the message if credit deduction fails
    }
  }
  
  /**
   * Increment anonymous message count
   */
  private async incrementAnonymousMessageCount(): Promise<void> {
    if (!this.userContext.sessionToken) return;
    
    try {
      // Find session by token and increment count
      const sessions = await db.execute<{ id: string }>(
        sql`SELECT id FROM anonymous_sessions WHERE session_token = ${this.userContext.sessionToken} LIMIT 1`
      );
      
      if (sessions.rows.length > 0) {
        await anonymousSessionsService.incrementMessageCount(sessions.rows[0].id);
      }
    } catch (error) {
      logger.error("[MessageHandler] Failed to increment anonymous message count:", error);
      // Don't fail the message if tracking fails
    }
  }
  
  /**
   * Handle side effects (fire-and-forget)
   * Includes Discord integration and room title generation
   */
  private handleSideEffects(
    roomId: string,
    userText: string,
    agentResponse: string,
    characterId?: string
  ): void {
    // Send to Discord thread (if configured)
    this.sendToDiscordThread(roomId, userText, agentResponse, characterId).catch((err) => {
      logger.error("[MessageHandler] Failed to send to Discord:", err);
    });
    
    // Generate room title (if needed)
    this.generateRoomTitleIfNeeded(roomId, userText).catch((err) => {
      logger.error("[MessageHandler] Failed to generate room title:", err);
    });
  }
  
  /**
   * Send messages to Discord thread if configured
   */
  private async sendToDiscordThread(
    roomId: string,
    userText: string,
    agentResponse: string,
    characterId?: string
  ): Promise<void> {
    try {
      // Get Discord thread ID from room metadata
      const roomData = await db.execute<{ metadata: any }>(
        sql`SELECT metadata FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`
      );
      
      const threadId = roomData.rows[0]?.metadata?.discordThreadId;
      
      if (threadId) {
        // Get character name
        let characterName = "Agent";
        if (characterId) {
          const character = await db.execute<{ name: string }>(
            sql`SELECT name FROM characters WHERE id = ${characterId}::uuid LIMIT 1`
          );
          characterName = character.rows[0]?.name || "Agent";
        }
        
        // Send user message
        await discordService.sendToThread(
          threadId,
          `**${this.userContext.name || this.userContext.email || this.userContext.entityId}:** ${userText}`
        );
        
        // Send agent response
        await discordService.sendToThread(
          threadId,
          `**🤖 ${characterName}:** ${agentResponse}`
        );
        
        logger.info(
          `[MessageHandler] Sent messages to Discord thread ${threadId}`
        );
      }
    } catch (err) {
      // Silently fail - this is a nice-to-have feature
      logger.debug("[MessageHandler] Discord integration not configured or failed:", err);
    }
  }
  
  /**
   * Generate room title from first message if needed
   */
  private async generateRoomTitleIfNeeded(roomId: string, userText: string): Promise<void> {
    try {
      // Check if room already has a title
      const roomCheck = await db.execute<{ name: string | null }>(
        sql`SELECT name FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`
      );
      
      const currentRoomName = roomCheck.rows[0]?.name;
      
      // Only generate title if room doesn't have one yet
      if (!currentRoomName) {
        logger.debug("[MessageHandler] Room has no title, generating from first message...");
        
        // Generate title from the user's message
        const title = await generateRoomTitle(userText);
        
        // Update room with the generated title
        await db.execute(
          sql`UPDATE rooms SET name = ${title} WHERE id = ${roomId}::uuid`
        );
        
        logger.info(`[MessageHandler] Generated and saved room title: ${title}`);
      }
    } catch (err) {
      // Non-critical error, don't interrupt the message flow
      logger.debug("[MessageHandler] Room title generation not available:", err);
    }
  }
}

// Export convenience function for creating a message handler
export function createMessageHandler(
  runtime: AgentRuntime,
  userContext: UserContext
): MessageHandler {
  return new MessageHandler(runtime, userContext);
}
