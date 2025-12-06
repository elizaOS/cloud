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
  createUniqueUuid,
  type UUID,
  type Content,
  type Media,
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
import type { AgentModeConfig } from "./agent-mode-types";
import { DEFAULT_AGENT_MODE } from "./agent-mode-types";

/**
 * Usage information for token tracking and billing
 */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface MessageResult {
  message: Memory;
  usage?: UsageInfo;
}

export interface MessageOptions {
  roomId: string;
  text: string;
  attachments?: unknown[];
  characterId?: string;
  model?: string;
  agentModeConfig?: AgentModeConfig;
}

/**
 * MESSAGE PROCESSING FLOW:
 * 
 * 1. ensureConnectionForCloud()
 *    - Sets up ElizaOS infrastructure (world, room, entities, participants)
 *    - Follows runtime.ts:ensureConnection pattern exactly
 *    - Critical: Sets entity.names array (required by providers)
 *    - Uses cache to avoid redundant DB calls
 * 
 * 2. createMessage()
 *    - Creates user message Memory object
 *    - Converts content to ElizaOS format
 * 
 * 3. runtime.emitEvent(MESSAGE_RECEIVED)
 *    - Triggers ElizaOS event pipeline
 *    - Providers inject context (recent messages, facts, etc.)
 *    - Actions/evaluators process the message
 *    - Callback stores agent's response
 * 
 * 4. trackUsage()
 *    - Deducts credits from organization
 *    - Creates usage records
 * 
 * 5. handleSideEffects()
 *    - Discord integration (fire-and-forget)
 *    - Room title generation (fire-and-forget)
 */
export class MessageHandler {
  constructor(
    private runtime: AgentRuntime,
    private userContext: UserContext,
  ) {
    // Runtime already has all settings including API key
    // No need for additional context injection
  }

  /**
   * Process a message through the ElizaOS runtime
   * Returns the agent's response and usage information
   */
  async process(options: MessageOptions): Promise<MessageResult> {
    const { roomId, text, attachments, agentModeConfig } = options;

    // IMPORTANT: Always use the authenticated user's ID as entityId
    const entityId = this.userContext.userId;

    // Use provided agent mode config or default to CHAT mode
    const modeConfig = agentModeConfig || DEFAULT_AGENT_MODE;

    elizaLogger.info(
      `[MessageHandler] Processing message for user ${this.userContext.userId} in room ${roomId} (mode: ${modeConfig.mode})`,
    );

    // 1. Ensure connection exists (with caching)
    // This sets up world, room, entities, and participants following ElizaOS patterns
    await this.ensureConnectionForCloud(roomId, entityId);

    // 3. Create user message
    const userMessage = this.createMessage(roomId, entityId, {
      text,
      attachments,
    });

    // 4. Process through runtime (API key already configured in runtime)
    let responseContent: Content | undefined;
    let usage: MessageResult["usage"];

    try {
      // Process message through event pipeline
      // The agent mode config will be picked up by the appropriate plugin
      await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime: this.runtime,
        message: userMessage,
        agentModeConfig: modeConfig, // Pass agent mode config to event handlers
        callback: async (content: Content) => {
          elizaLogger.info(
            "[MessageHandler] Callback invoked with content:",
            JSON.stringify(content).substring(0, 200),
          );

          if (content.text) {
            responseContent = content;
            elizaLogger.info(
              `[MessageHandler] Captured response text (${content.text.length} chars): ${content.text.substring(0, 100)}...`,
            );

            // Store the response memory when callback is invoked
            // This ensures all agent responses (including action responses) are persisted
            const responseMemory: Memory = {
              id: createUniqueUuid(
                this.runtime,
                (userMessage.id ?? uuidv4()) as UUID,
              ),
              entityId: this.runtime.agentId,
              agentId: this.runtime.agentId,
              roomId: roomId as UUID,
              content: {
                ...content,
                source: content.source || "agent",
                inReplyTo: userMessage.id,
              },
              metadata: {
                type: "agent_response_message",
              },
            };

            await this.runtime.createMemory(responseMemory, "messages");
            elizaLogger.info(
              `[MessageHandler] Stored response memory: ${responseMemory.id}`,
            );
          } else {
            elizaLogger.warn(
              "[MessageHandler] Callback received but no text in content",
            );
          }

          // Extract usage if passed via dynamic property (for billing)
          if ("usage" in content && content.usage) {
            usage = content.usage as UsageInfo;
          }

          return [];
        },
      });

      elizaLogger.info(
        `[MessageHandler] After emitEvent - responseText: ${responseContent?.text ? `"${responseContent.text.substring(0, 100)}..."` : "EMPTY/UNDEFINED"}`,
      );
    } catch (error) {
      elizaLogger.error(
        "[MessageHandler] Error during message processing:",
        error instanceof Error ? error.message : String(error),
      );

      // Check if it's an API key error
      if (error instanceof Error && error.message.includes("API key")) {
        responseContent = {
          text: "⚠️ Configuration error: ElizaCloud API key is missing or invalid. Please try logging out and back in.",
          source: "agent",
        };
      } else {
        responseContent = {
          text: "I apologize, but I encountered an error processing your message. Please try again.",
          source: "agent",
        };
      }
    }

    elizaLogger.debug(
      `*** RESPONSE CONTENT ***\n${JSON.stringify(responseContent, null, 2)}`,
    );

    // 5. Create response memory object for return (using stored content)
    const responseMemory = this.createResponseMemoryFromContent(
      roomId,
      responseContent || {
        text: "I'm sorry, I couldn't generate a response.",
        source: "agent",
      },
    );

    // 6. Track usage and credits (if not anonymous)
    if (!this.userContext.isAnonymous && usage) {
      await this.trackUsage(usage);
    }

    // 7. Handle anonymous session tracking
    logger.info("[MessageHandler] 📊 Checking anonymous session tracking:", {
      isAnonymous: this.userContext.isAnonymous,
      hasSessionToken: !!this.userContext.sessionToken,
      sessionTokenPreview: this.userContext.sessionToken?.slice(0, 8) + "...",
      userId: this.userContext.userId,
    });
    if (this.userContext.isAnonymous && this.userContext.sessionToken) {
      await this.incrementAnonymousMessageCount();
    } else {
      logger.info("[MessageHandler] ℹ️ Skipping message count increment:", {
        reason: !this.userContext.isAnonymous
          ? "Not anonymous user"
          : "No session token",
        isAnonymous: this.userContext.isAnonymous,
        hasSessionToken: !!this.userContext.sessionToken,
      });
    }

    // 8. Fire-and-forget side effects (Discord, room title generation)
    this.handleSideEffects(
      roomId,
      text,
      responseContent?.text || "",
      options.characterId,
    );

    elizaLogger.success(
      `[MessageHandler] Message processed successfully for user ${this.userContext.userId}`,
    );

    elizaLogger.debug(`FINAL USAGE: ${JSON.stringify(usage)}`);

    return {
      message: responseMemory,
      usage,
    };
  }

  /**
   * ElizaCloud-specific connection setup
   * 
   * This implements the ElizaOS framework's connection pattern with CloudDB-specific optimizations:
   * 
   * PATTERN (from core/runtime.ts:ensureConnection):
   * 1. Create/ensure world (server context)
   * 2. Create/ensure room with worldId + serverId
   * 3. Create/ensure user entity with names array
   * 4. Add user + agent as participants
   * 
   * CRITICAL: Entity names array
   * - Required by providers like recent-messages (line 140: entity.names[0])
   * - Must contain at least one non-empty string
   * - ElizaOS uses: [name, userName].filter(Boolean)
   * 
   * CRITICAL: Room fields
   * - worldId: required for room queries
   * - serverId: required for multi-server setups
   * - Without these, room operations will fail
   * 
   * OPTIMIZATION: Connection caching
   * - After first setup, subsequent calls use cache
   * - Avoids redundant DB queries for same room+user
   */
  private async ensureConnectionForCloud(
    roomId: string,
    entityId: string,
  ): Promise<void> {
    // Check cache first - most messages will hit this path
    const cached = await connectionCache.isEstablished(roomId, entityId);
    if (cached) {
      elizaLogger.debug(`[MessageHandler] Using cached connection: ${roomId}`);
      return;
    }

    elizaLogger.debug(
      `[MessageHandler] Setting up new connection: room=${roomId}, entity=${entityId}`,
    );

    // Convert string IDs to UUIDs for ElizaOS compatibility
    const entityUuid = stringToUuid(entityId) as UUID;
    const roomUuid = roomId as UUID;
    const worldId = stringToUuid("eliza-world") as UUID;
    const serverId = stringToUuid("eliza-server") as UUID;

    // Build names array - CRITICAL for providers
    // Pattern from runtime.ts:ensureConnection (line 1411)
    const displayName =
      this.userContext.name ||
      this.userContext.email ||
      this.userContext.userId ||
      "User";
    
    const names = [
      this.userContext.name,
      this.userContext.email,
      displayName,
    ].filter(Boolean) as string[];

    // Step 1: Ensure world exists
    // World is the top-level container (like a Discord server)
    await this.ensureWorldExists(worldId, serverId);

    // Step 2: Ensure agent entity exists
    // Agent must be an entity BEFORE creating the room (ElizaOS requirement)
    await this.ensureAgentEntity();

    // Step 3: Ensure room exists with proper fields
    // Room must have worldId + serverId or queries will fail
    await this.ensureRoomExistsWithFields(roomUuid, worldId, serverId, displayName);

    // Step 4: Ensure user entity exists or update it
    // This is where we set the critical names array
    await this.ensureUserEntity(entityUuid, names, displayName);

    // Step 5: Add both agent and user as participants
    await this.ensureParticipants(roomUuid, entityUuid);

    // Step 6: Verify setup is correct (helps debug provider issues)
    await this.verifyEntitySetup(entityUuid, names);

    // Cache the connection for future messages
    await connectionCache.markEstablished(roomId, entityId);
    elizaLogger.success(
      `[MessageHandler] Connection established: ${displayName} → room ${roomId}`,
    );
  }

  /**
   * Step 1: Ensure world exists
   * World = top-level container (like Discord server)
   */
  private async ensureWorldExists(
    worldId: UUID,
    serverId: UUID,
  ): Promise<void> {
    try {
      await this.runtime.ensureWorldExists({
        id: worldId,
        name: "ElizaCloud Web",
        agentId: this.runtime.agentId,
        serverId: serverId,
      } as any); // Type assertion for messageServerId vs serverId inconsistency
      elizaLogger.debug(`[MessageHandler] ✓ World exists: ${worldId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Ignore duplicate key errors (world already exists)
      if (
        !msg.toLowerCase().includes("duplicate") &&
        !msg.toLowerCase().includes("unique constraint")
      ) {
        elizaLogger.error(`[MessageHandler] Failed to ensure world:`, msg);
        throw error;
      }
    }
  }

  /**
   * Step 2: Ensure room exists with all required fields
   * CRITICAL: Room MUST have worldId and serverId set
   * 
   * The /api/eliza/rooms endpoint creates minimal room records.
   * We complete the setup here by ensuring worldId + serverId are set.
   * This follows runtime.ts:ensureRoomExists pattern (line 1571)
   */
  private async ensureRoomExistsWithFields(
    roomId: UUID,
    worldId: UUID,
    serverId: UUID,
    displayName: string,
  ): Promise<void> {
    try {
      // Check if room already exists to avoid duplicate creation
      const existingRoom = await this.runtime.getRoom(roomId);
      
      if (existingRoom) {
        // Room exists - update it with worldId/serverId if needed
        if (!existingRoom.worldId || !existingRoom.serverId) {
          await this.runtime.updateRoom({
            ...existingRoom,
            worldId,
            serverId,
            name: displayName || existingRoom.name,
          });
        }
      } else {
        // Room doesn't exist - create it
        await this.runtime.ensureRoomExists({
          id: roomId,
          name: displayName,
          type: ChannelType.DM,
          channelId: roomId,
          worldId: worldId,
          serverId: serverId,
          agentId: this.runtime.agentId,
          source: "web",
        });
      }
      
      elizaLogger.debug(`[MessageHandler] ✓ Room exists: ${roomId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      elizaLogger.error(`[MessageHandler] Failed to ensure room:`, msg);
      throw new Error(`Failed to ensure room exists: ${msg}`);
    }
  }

  /**
   * Step 3: Ensure agent entity exists
   * Agent must be an entity before it can be a participant
   */
  private async ensureAgentEntity(): Promise<void> {
    const agentEntity = await this.runtime.getEntityById(this.runtime.agentId);
    
    if (!agentEntity) {
      try {
        await this.runtime.createEntity({
          id: this.runtime.agentId,
          agentId: this.runtime.agentId,
          names: [this.runtime.character?.name || "Agent"],
          metadata: {
            name: this.runtime.character?.name || "Agent",
            type: "agent",
          },
        });
        elizaLogger.debug(`[MessageHandler] ✓ Created agent entity`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Ignore duplicate errors (race condition with other requests)
        if (
          !msg.toLowerCase().includes("duplicate") &&
          !msg.toLowerCase().includes("unique constraint")
        ) {
          elizaLogger.error(`[MessageHandler] Failed to create agent entity:`, msg);
        }
      }
    }
  }

  /**
   * Step 4: Ensure user entity exists with proper names array
   * 
   * CRITICAL OPERATION:
   * - Creates entity if missing
   * - Updates entity if exists (merges names to avoid data loss)
   * - Ensures names array has at least one value (required by providers)
   * 
   * Pattern from runtime.ts:ensureConnection (lines 1420-1458)
   */
  private async ensureUserEntity(
    entityUuid: UUID,
    names: string[],
    displayName: string,
  ): Promise<void> {
    const existingEntity = await this.runtime.getEntityById(entityUuid);

    if (!existingEntity) {
      // Create new entity with proper structure
      const entityMetadata = {
        web: {
          id: this.userContext.userId,
          name: this.userContext.name,
          userName: displayName,
          email: this.userContext.email,
          organizationId: this.userContext.organizationId,
        },
      };

      try {
        await this.runtime.createEntity({
          id: entityUuid,
          agentId: this.runtime.agentId,
          names: names,
          metadata: entityMetadata,
        });
        elizaLogger.debug(
          `[MessageHandler] ✓ Created user entity with names: [${names.join(", ")}]`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Ignore duplicate errors (race condition)
        if (
          !msg.toLowerCase().includes("duplicate") &&
          !msg.toLowerCase().includes("unique constraint")
        ) {
          elizaLogger.error(`[MessageHandler] Failed to create user entity:`, msg);
          throw new Error(`Failed to create user entity: ${msg}`);
        }
      }
    } else {
      // Update existing entity - merge names to preserve historical data
      // This follows runtime.ts:ensureConnection pattern (line 1444)
      const mergedNames = [
        ...new Set([...(existingEntity.names || []), ...names]),
      ].filter(Boolean) as string[];

      const mergedMetadata = {
        ...existingEntity.metadata,
        web: {
          ...(existingEntity.metadata?.web as Record<string, any>),
          id: this.userContext.userId,
          name: this.userContext.name,
          userName: displayName,
          email: this.userContext.email,
          organizationId: this.userContext.organizationId,
        },
      };

      try {
        await this.runtime.updateEntity({
          id: entityUuid,
          agentId: this.runtime.agentId,
          names: mergedNames,
          metadata: mergedMetadata,
        });
        elizaLogger.debug(
          `[MessageHandler] ✓ Updated user entity with names: [${mergedNames.join(", ")}]`,
        );
      } catch (error) {
        // Non-critical - entity exists, update failed but we can continue
        elizaLogger.warn(
          `[MessageHandler] Failed to update entity (non-critical):`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Step 5: Ensure both agent and user are participants
   * Uses runtime.ensureParticipantInRoom which handles existence checks
   */
  private async ensureParticipants(
    roomId: UUID,
    entityUuid: UUID,
  ): Promise<void> {
    // Add agent as participant
    try {
      await this.runtime.ensureParticipantInRoom(this.runtime.agentId, roomId);
      elizaLogger.debug(`[MessageHandler] ✓ Agent is participant`);
    } catch (error) {
      elizaLogger.error(
        `[MessageHandler] Failed to add agent as participant:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Add user as participant
    try {
      await this.runtime.ensureParticipantInRoom(entityUuid, roomId);
      elizaLogger.debug(`[MessageHandler] ✓ User is participant`);
    } catch (error) {
      elizaLogger.error(
        `[MessageHandler] Failed to add user as participant:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Verify entity setup is correct
   * 
   * This helps catch issues early before they break providers.
   * Common issue: Entity with empty names array will crash recent-messages provider
   * at line 140: entity.names[0]
   */
  private async verifyEntitySetup(
    entityUuid: UUID,
    expectedNames: string[],
  ): Promise<void> {
    try {
      const entity = await this.runtime.getEntityById(entityUuid);

      if (!entity) {
        elizaLogger.error(
          `[MessageHandler] 🚨 Entity not found after creation! This will break message processing.`,
        );
        return;
      }

      // Check names array - CRITICAL for providers
      if (!entity.names || entity.names.length === 0) {
        elizaLogger.error(
          `[MessageHandler] 🚨 Entity has no names! This will break recent-messages provider. Entity: ${entity.id}, Expected: [${expectedNames.join(", ")}], Actual: ${entity.names}`,
        );
      } else {
        elizaLogger.debug(
          `[MessageHandler] ✓ Entity verified: names=[${entity.names.join(", ")}]`,
        );
      }
    } catch (error) {
      elizaLogger.error(
        `[MessageHandler] Failed to verify entity:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create a message memory object
   */
  private createMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: unknown[] },
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
        source: "user",
        ...(content.attachments &&
        Array.isArray(content.attachments) &&
        content.attachments.length > 0
          ? {
              attachments: content.attachments.filter(
                (att): att is Media =>
                  typeof att === "object" &&
                  att !== null &&
                  ("url" in att || "mimeType" in att || "data" in att),
              ) as Media[],
            }
          : {}),
      },
      metadata: {
        type: "user_message",
      },
    };
  }

  /**
   * Create response memory object from Content
   * Used for building the return value with full Content structure
   */
  private createResponseMemoryFromContent(
    roomId: string,
    content: Content,
  ): Memory {
    if (content.attachments && content.attachments.length > 0) {
      elizaLogger.debug(
        `[MessageHandler] Including ${content.attachments.length} attachment(s) in response`,
      );
    }

    return {
      id: uuidv4() as UUID,
      roomId: roomId as UUID,
      entityId: this.runtime.agentId as UUID,
      agentId: this.runtime.agentId as UUID,
      createdAt: Date.now(),
      content: {
        ...content,
        source: content.source || "agent",
      },
    };
  }

  /**
   * Deduct credits for message processing
   * Note: Token usage tracking is now handled by MODEL_USED events in plugin-assistant
   */
  private async trackUsage(usage: MessageResult["usage"]): Promise<void> {
    if (!usage || !this.userContext.organizationId) return;

    try {
      const model = usage.model || "gpt-4o";
      const provider = getProviderFromModel(model);
      const costResult = await calculateCost(
        model,
        provider,
        usage.inputTokens,
        usage.outputTokens,
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
          `[MessageHandler] Low credits for org ${this.userContext.organizationId}: ${deductResult.newBalance}`,
        );
      }

      logger.info(
        `[MessageHandler] Deducted credits - tokens: ${usage.inputTokens}/${usage.outputTokens}, cost: ${costResult.totalCost}, balance: ${deductResult.newBalance}`,
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
    logger.info("[MessageHandler] 📊 incrementAnonymousMessageCount called:", {
      hasSessionToken: !!this.userContext.sessionToken,
      sessionTokenPreview: this.userContext.sessionToken?.slice(0, 8) + "...",
      isAnonymous: this.userContext.isAnonymous,
    });

    if (!this.userContext.sessionToken) {
      logger.warn(
        "[MessageHandler] ⚠️ No session token, skipping message count increment",
      );
      return;
    }

    try {
      // Find session by token and increment count
      const sessions = await db.execute<{ id: string }>(
        sql`SELECT id FROM anonymous_sessions WHERE session_token = ${this.userContext.sessionToken} LIMIT 1`,
      );

      logger.info("[MessageHandler] 📊 Session lookup result:", {
        found: sessions.rows.length > 0,
        sessionId: sessions.rows[0]?.id,
        tokenUsed: this.userContext.sessionToken?.slice(0, 8) + "...",
      });

      if (sessions.rows.length > 0) {
        const updatedSession =
          await anonymousSessionsService.incrementMessageCount(
            sessions.rows[0].id,
          );
        logger.info("[MessageHandler] ✅ Message count incremented:", {
          sessionId: sessions.rows[0].id,
          newCount: updatedSession?.message_count,
        });
      } else {
        logger.warn(
          "[MessageHandler] ⚠️ No session found for token:",
          this.userContext.sessionToken?.slice(0, 8) + "...",
        );
      }
    } catch (error) {
      logger.error(
        "[MessageHandler] ❌ Failed to increment anonymous message count:",
        error,
      );
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
    characterId?: string,
  ): void {
    // Send to Discord thread (if configured)
    this.sendToDiscordThread(
      roomId,
      userText,
      agentResponse,
      characterId,
    ).catch((err) => {
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
    characterId?: string,
  ): Promise<void> {
    try {
      // Get Discord thread ID from room metadata
      const roomData = await db.execute<{ metadata: any }>(
        sql`SELECT metadata FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
      );

      const threadId = roomData.rows[0]?.metadata?.discordThreadId;

      if (threadId) {
        // Get character name
        let characterName = "Agent";
        if (characterId) {
          const character = await db.execute<{ name: string }>(
            sql`SELECT name FROM characters WHERE id = ${characterId}::uuid LIMIT 1`,
          );
          characterName = character.rows[0]?.name || "Agent";
        }

        // Send user message
        await discordService.sendToThread(
          threadId,
          `**${this.userContext.name || this.userContext.email || this.userContext.entityId}:** ${userText}`,
        );

        // Send agent response
        await discordService.sendToThread(
          threadId,
          `**🤖 ${characterName}:** ${agentResponse}`,
        );

        logger.info(
          `[MessageHandler] Sent messages to Discord thread ${threadId}`,
        );
      }
    } catch (err) {
      // Silently fail - this is a nice-to-have feature
      logger.debug(
        "[MessageHandler] Discord integration not configured or failed:",
        err,
      );
    }
  }

  /**
   * Generate room title after 2 rounds of conversation (4+ messages)
   * This ensures we have enough context to generate a meaningful title
   */
  private async generateRoomTitleIfNeeded(
    roomId: string,
    userText: string,
  ): Promise<void> {
    try {
      // Check if room already has a title
      const roomCheck = await db.execute<{ name: string | null }>(
        sql`SELECT name FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
      );

      const currentRoomName = roomCheck.rows[0]?.name;

      // Only generate title if room doesn't have one yet
      if (!currentRoomName) {
        // Count messages in this room to check if we have 2 rounds (4+ messages)
        const messageCount = await db.execute<{ count: string }>(
          sql`SELECT COUNT(*)::text as count FROM memories WHERE "roomId" = ${roomId}::uuid AND type = 'messages'`,
        );

        const count = parseInt(messageCount.rows[0]?.count || "0", 10);

        // Only generate title after 2 rounds of back and forth (4+ messages)
        // This gives us user1, agent1, user2, agent2 - enough context
        if (count >= 4) {
          logger.debug(
            `[MessageHandler] Room has ${count} messages and no title, generating...`,
          );

          // Get first few messages for context
          const recentMessages = await db.execute<{ content: string }>(
            sql`SELECT content FROM memories 
                WHERE "roomId" = ${roomId}::uuid AND type = 'messages' 
                ORDER BY "createdAt" ASC LIMIT 4`,
          );

          // Combine user messages for better context
          const context = recentMessages.rows
            .map((m) => {
              const content = m.content;
              if (typeof content === "string") return content;
              if (
                typeof content === "object" &&
                content !== null &&
                "text" in content
              ) {
                const text = (content as { text: unknown }).text;
                if (typeof text === "string") {
                  return text;
                }
              }
              return "";
            })
            .filter(Boolean)
            .join(" | ");

          // Generate title from the conversation context
          const title = await generateRoomTitle(context || userText);

          // Update room with the generated title
          await db.execute(
            sql`UPDATE rooms SET name = ${title} WHERE id = ${roomId}::uuid`,
          );

          logger.info(
            `[MessageHandler] Generated and saved room title: ${title}`,
          );
        } else {
          logger.debug(
            `[MessageHandler] Room has ${count} messages, waiting for 4+ to generate title`,
          );
        }
      }
    } catch (err) {
      // Non-critical error, don't interrupt the message flow
      logger.debug(
        "[MessageHandler] Room title generation not available:",
        err,
      );
    }
  }
}

// Export convenience function for creating a message handler
export function createMessageHandler(
  runtime: AgentRuntime,
  userContext: UserContext,
): MessageHandler {
  return new MessageHandler(runtime, userContext);
}
