/**
 * Message Storage Service
 *
 * Provides reliable, explicit message storage for chat conversations.
 * This service bypasses ElizaOS's internal storage to ensure messages
 * are always persisted correctly.
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/client";
import { memoryTable } from "@/db/schemas/eliza";
import { eq, and, asc, desc } from "drizzle-orm";
import type { UUID } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";

export interface StoredMessage {
  id: string;
  roomId: string;
  entityId: string;
  agentId: string;
  content: MessageContent;
  type: string;
  createdAt: number;
}

/**
 * Message content structure for storage.
 * Extends Record<string, unknown> for JSONB column compatibility.
 */
export interface MessageContent extends Record<string, unknown> {
  text: string;
  source?: string;
  inReplyTo?: string;
  attachments?: Array<{
    id: string;
    url: string;
    title?: string;
    contentType?: string;
  }>;
  thought?: string;
  actions?: string[];
}

export interface StoreUserMessageParams {
  roomId: string;
  entityId: string;
  agentId: string;
  text: string;
  attachments?: MessageContent["attachments"];
}

export interface StoreAgentMessageParams {
  roomId: string;
  agentId: string;
  content: MessageContent;
  inReplyTo?: string;
}

export interface FetchMessagesParams {
  roomId: string;
  limit?: number;
  order?: "asc" | "desc";
}

class MessageStorageService {
  /**
   * Store a user message in the database
   */
  async storeUserMessage(params: StoreUserMessageParams): Promise<StoredMessage> {
    const { roomId, entityId, agentId, text, attachments } = params;

    const messageId = uuidv4();
    const now = new Date();
    const createdAt = now.getTime();

    const content: MessageContent = {
      text,
      source: "user",
    };

    if (attachments && attachments.length > 0) {
      content.attachments = attachments;
    }

    try {
      await db.insert(memoryTable).values({
        id: messageId as UUID,
        roomId: roomId as UUID,
        entityId: entityId as UUID,
        agentId: agentId as UUID,
        content,
        type: "messages",
        createdAt: now,
      });

      logger.info(`[MessageStorage] Stored user message: ${messageId} in room ${roomId}`);

      return {
        id: messageId,
        roomId,
        entityId,
        agentId,
        content,
        type: "messages",
        createdAt,
      };
    } catch (error) {
      logger.error("[MessageStorage] Failed to store user message:", error);
      throw error;
    }
  }

  /**
   * Store an agent message in the database
   */
  async storeAgentMessage(params: StoreAgentMessageParams): Promise<StoredMessage> {
    const { roomId, agentId, content, inReplyTo } = params;

    const messageId = uuidv4();
    const now = new Date();
    const createdAt = now.getTime();

    const messageContent: MessageContent = {
      ...content,
      source: "agent",
    };

    if (inReplyTo) {
      messageContent.inReplyTo = inReplyTo;
    }

    try {
      await db.insert(memoryTable).values({
        id: messageId as UUID,
        roomId: roomId as UUID,
        entityId: agentId as UUID,
        agentId: agentId as UUID,
        content: messageContent,
        type: "messages",
        createdAt: now,
      });

      logger.info(`[MessageStorage] Stored agent message: ${messageId} in room ${roomId}`);

      return {
        id: messageId,
        roomId,
        entityId: agentId,
        agentId,
        content: messageContent,
        type: "messages",
        createdAt,
      };
    } catch (error) {
      logger.error("[MessageStorage] Failed to store agent message:", error);
      throw error;
    }
  }

  /**
   * Fetch messages for a room
   */
  async fetchMessages(params: FetchMessagesParams): Promise<StoredMessage[]> {
    const { roomId, limit = 100, order = "asc" } = params;

    try {
      const orderFn = order === "asc" ? asc : desc;

      const messages = await db
        .select()
        .from(memoryTable)
        .where(
          and(
            eq(memoryTable.roomId, roomId as UUID),
            eq(memoryTable.type, "messages"),
          ),
        )
        .orderBy(orderFn(memoryTable.createdAt))
        .limit(limit);

      return messages.map((msg) => ({
        id: msg.id,
        roomId: msg.roomId,
        entityId: msg.entityId,
        agentId: msg.agentId ?? msg.entityId,
        content: (msg.content as MessageContent) || { text: "", source: "unknown" },
        type: msg.type ?? "messages",
        createdAt: msg.createdAt ?? Date.now(),
      }));
    } catch (error) {
      logger.error("[MessageStorage] Failed to fetch messages:", error);
      throw error;
    }
  }

  /**
   * Check if a message already exists (for deduplication)
   */
  async messageExists(messageId: string): Promise<boolean> {
    try {
      const result = await db
        .select({ id: memoryTable.id })
        .from(memoryTable)
        .where(eq(memoryTable.id, messageId as UUID))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      logger.error("[MessageStorage] Failed to check message existence:", error);
      return false;
    }
  }
}

export const messageStorage = new MessageStorageService();
