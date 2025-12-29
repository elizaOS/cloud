/**
 * Room Title Service - Generates AI-powered titles for chat rooms
 * 
 * Uses the first few messages of a conversation to generate a concise,
 * descriptive title that summarizes the topic of discussion.
 */

import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { roomsRepository, memoriesRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

const TITLE_GENERATION_PROMPT = `Generate a very short, concise title (3-6 words max) for this conversation based on the messages below. 
The title should capture the main topic or intent of the conversation.
Do NOT use quotes around the title.
Do NOT include "Chat about" or similar prefixes.
Just return the title, nothing else.

Messages:
`;

/**
 * Generate a title for a room based on its conversation content.
 * Only generates if room currently has default title ("New Chat").
 * 
 * @param roomId - The room ID to generate title for
 * @returns The generated title, or null if title generation was skipped
 */
export async function generateRoomTitle(roomId: string): Promise<string | null> {
  const room = await roomsRepository.findById(roomId);
  
  if (!room) {
    logger.warn(`[RoomTitle] Room not found: ${roomId}`);
    return null;
  }

  // Only generate if room has default title
  if (room.name && room.name !== "New Chat") {
    logger.debug(`[RoomTitle] Room already has custom title: ${room.name}`);
    return null;
  }

  // Get recent messages from the room
  const messages = await memoriesRepository.findMessages(roomId, { limit: 6 });
  
  if (messages.length < 2) {
    logger.debug(`[RoomTitle] Not enough messages to generate title: ${messages.length}`);
    return null;
  }

  // Build context from messages
  const messageTexts = messages
    .reverse() // Chronological order
    .map(msg => {
      const content = msg.content;
      const text = typeof content === "string" ? content : content?.text || "";
      const role = msg.entityId === msg.agentId ? "Agent" : "User";
      return `${role}: ${text.substring(0, 200)}`; // Truncate long messages
    })
    .filter(text => text.length > 7) // Filter out empty/short messages
    .slice(0, 4); // Use first 4 meaningful messages

  if (messageTexts.length < 2) {
    logger.debug(`[RoomTitle] Not enough meaningful messages for title`);
    return null;
  }

  const prompt = TITLE_GENERATION_PROMPT + messageTexts.join("\n");

  // External AI API call - must handle errors to prevent breaking chat flow
  let generatedTitle: string;
  try {
    const result = await generateText({
      model: gateway.languageModel("gpt-4o-mini"),
      prompt,
    });

    generatedTitle = result.text.trim()
      .replace(/^["']|["']$/g, "") // Remove surrounding quotes
      .replace(/^(Chat about|Conversation about|Discussion about|Talk about)\s*/i, "") // Remove common prefixes
      .substring(0, 50); // Limit length
  } catch (error) {
    logger.error(`[RoomTitle] AI generation failed for room ${roomId}:`, error);
    return null;
  }

  if (!generatedTitle || generatedTitle.length < 3) {
    logger.warn(`[RoomTitle] Generated title too short or empty`);
    return null;
  }

  // Update room with new title
  await roomsRepository.update(roomId, { name: generatedTitle });
  
  logger.info(`[RoomTitle] Generated title for room ${roomId}: "${generatedTitle}"`);
  
  return generatedTitle;
}
