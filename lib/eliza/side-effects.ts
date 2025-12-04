/**
 * Cloud-specific side effects for message processing
 * These are fire-and-forget operations that don't affect the main message flow
 */

import { elizaLogger, type UUID } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { anonymousSessionsService } from "@/lib/services";
import { discordService } from "@/lib/services/discord";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { generateRoomTitle } from "@/lib/ai/generate-room-title";
import type { UserContext } from "./user-context";

/**
 * Execute all cloud-specific side effects after message processing.
 * All side effects are fire-and-forget to not block the response.
 */
export function executeSideEffects(
  roomId: UUID,
  userText: string,
  agentResponse: string,
  userContext: UserContext,
  characterId?: string,
): void {
  // Discord integration
  sendToDiscordThread(roomId, userText, agentResponse, userContext, characterId).catch(
    (err) => logger.debug("[SideEffects] Discord side effect failed:", err),
  );

  // Room title generation (first message only)
  generateRoomTitleIfNeeded(roomId, userText).catch((err) =>
    logger.debug("[SideEffects] Room title side effect failed:", err),
  );

  // Anonymous session tracking
  if (userContext.isAnonymous && userContext.sessionToken) {
    incrementAnonymousMessageCount(userContext.sessionToken).catch((err) =>
      logger.debug("[SideEffects] Anonymous tracking failed:", err),
    );
  }
}

/**
 * Send messages to Discord thread if configured
 */
export async function sendToDiscordThread(
  roomId: UUID,
  userText: string,
  agentResponse: string,
  userContext: UserContext,
  characterId?: string,
): Promise<void> {
  try {
    // Get Discord thread ID from room metadata
    const roomData = await db.execute<{ metadata: Record<string, unknown> }>(
      sql`SELECT metadata FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
    );

    const threadId = roomData.rows[0]?.metadata?.discordThreadId as string | undefined;

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
        `**${userContext.name || userContext.email || userContext.entityId}:** ${userText}`,
      );

      // Send agent response
      await discordService.sendToThread(
        threadId,
        `**${characterName}:** ${agentResponse}`,
      );

      logger.info(`[SideEffects] Sent messages to Discord thread ${threadId}`);
    }
  } catch (err) {
    // Silently fail - this is a nice-to-have feature
    logger.debug("[SideEffects] Discord integration not configured or failed:", err);
  }
}

/**
 * Generate room title from first message if needed
 */
export async function generateRoomTitleIfNeeded(
  roomId: UUID,
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
      elizaLogger.debug("[SideEffects] Room has no title, generating from first message...");

      // Generate title from the user's message
      const title = await generateRoomTitle(userText);

      // Update room with the generated title
      await db.execute(
        sql`UPDATE rooms SET name = ${title} WHERE id = ${roomId}::uuid`,
      );

      logger.info(`[SideEffects] Generated and saved room title: ${title}`);
    }
  } catch (err) {
    logger.debug("[SideEffects] Room title generation failed:", err);
  }
}

/**
 * Increment anonymous session message count
 */
export async function incrementAnonymousMessageCount(
  sessionToken: string,
): Promise<void> {
  try {
    // Find session by token and increment count
    const sessions = await db.execute<{ id: string }>(
      sql`SELECT id FROM anonymous_sessions WHERE session_token = ${sessionToken} LIMIT 1`,
    );

    if (sessions.rows.length > 0) {
      await anonymousSessionsService.incrementMessageCount(sessions.rows[0].id);
      logger.debug("[SideEffects] Incremented anonymous message count");
    }
  } catch (err) {
    logger.debug("[SideEffects] Failed to increment anonymous message count:", err);
  }
}