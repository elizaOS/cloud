/**
 * Room Title Service - Generates titles for chat rooms
 * 
 * Uses the first user message to create a descriptive title.
 */

import { roomsRepository, memoriesRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

/**
 * Generate a title for a room based on the first user message.
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
    return null;
  }

  // Get recent messages from the room
  const messages = await memoriesRepository.findMessages(roomId, { limit: 6 });
  
  if (messages.length < 1) {
    return null;
  }

  // Find the first user message (messages are in descending order by createdAt)
  const userMessage = messages
    .reverse() // Chronological order
    .find(msg => {
      const content = msg.content;
      const source = typeof content === "object" ? content?.source : undefined;
      return source === "user";
    });

  if (!userMessage) {
    return null;
  }

  const content = userMessage.content;
  const text = typeof content === "string" ? content : content?.text || "";
  
  if (!text || text.length < 3) {
    return null;
  }

  // Create title from first user message
  const title = text
    .replace(/\n/g, " ") // Remove newlines
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .substring(0, 40) // Limit to 40 chars
    .trim();

  // Add ellipsis if truncated
  const finalTitle = text.length > 40 ? `${title}...` : title;

  if (!finalTitle || finalTitle.length < 3) {
    return null;
  }

  // Update room with new title
  await roomsRepository.update(roomId, { name: finalTitle });
  
  logger.info(`[RoomTitle] Generated title for room ${roomId}: "${finalTitle}"`);
  
  return finalTitle;
}
