import { eq, desc } from "drizzle-orm";
import { db } from "../client";
import {
  conversations,
  conversationMessages,
  type Conversation,
  type NewConversation,
  type ConversationMessage,
  type NewConversationMessage,
} from "../schemas/conversations";

export type {
  Conversation,
  NewConversation,
  ConversationMessage,
  NewConversationMessage,
};

/**
 * Conversation with associated messages.
 */
export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

/**
 * Repository for conversation database operations.
 */
export class ConversationsRepository {
  /**
   * Finds a conversation by ID.
   */
  async findById(id: string): Promise<Conversation | undefined> {
    return await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
  }

  /**
   * Finds a conversation with all associated messages.
   */
  async findWithMessages(
    id: string,
  ): Promise<ConversationWithMessages | undefined> {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: {
        messages: {
          orderBy: desc(conversationMessages.sequence_number),
        },
      },
    });

    return conversation as ConversationWithMessages | undefined;
  }

  /**
   * Lists conversations for a user.
   */
  async listByUser(userId: string, limit?: number): Promise<Conversation[]> {
    return await db.query.conversations.findMany({
      where: eq(conversations.user_id, userId),
      orderBy: desc(conversations.updated_at),
      limit,
    });
  }

  /**
   * Lists conversations for an organization.
   */
  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<Conversation[]> {
    return await db.query.conversations.findMany({
      where: eq(conversations.organization_id, organizationId),
      orderBy: desc(conversations.updated_at),
      limit,
    });
  }

  /**
   * Creates a new conversation.
   */
  async create(data: NewConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return conversation;
  }

  /**
   * Updates an existing conversation.
   */
  async update(
    id: string,
    data: Partial<NewConversation>,
  ): Promise<Conversation | undefined> {
    const [updated] = await db
      .update(conversations)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  /**
   * Deletes a conversation by ID.
   */
  async delete(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  /**
   * Adds a message to a conversation.
   */
  async addMessage(data: NewConversationMessage): Promise<ConversationMessage> {
    const [message] = await db
      .insert(conversationMessages)
      .values(data)
      .returning();
    return message;
  }

  /**
   * Gets all messages for a conversation, ordered by sequence number.
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    return await db.query.conversationMessages.findMany({
      where: eq(conversationMessages.conversation_id, conversationId),
      orderBy: desc(conversationMessages.sequence_number),
    });
  }

  /**
   * Gets the next sequence number for a conversation.
   */
  async getNextSequenceNumber(conversationId: string): Promise<number> {
    const lastMessage = await db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.conversation_id, conversationId),
      orderBy: desc(conversationMessages.sequence_number),
    });

    return lastMessage ? lastMessage.sequence_number + 1 : 1;
  }

  /**
   * Adds a message with automatic sequence number and updates conversation stats.
   * 
   * Performs all operations atomically in a transaction.
   */
  async addMessageWithSequence(
    conversationId: string,
    data: Omit<NewConversationMessage, "sequence_number" | "conversation_id">,
  ): Promise<ConversationMessage> {
    return await db.transaction(async (tx) => {
      const lastMessage = await tx.query.conversationMessages.findFirst({
        where: eq(conversationMessages.conversation_id, conversationId),
        orderBy: desc(conversationMessages.sequence_number),
      });

      const nextSequence = lastMessage ? lastMessage.sequence_number + 1 : 1;

      const [message] = await tx
        .insert(conversationMessages)
        .values({
          ...data,
          conversation_id: conversationId,
          sequence_number: nextSequence,
        })
        .returning();

      const conversation = await tx.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
      });

      if (conversation) {
        await tx
          .update(conversations)
          .set({
            message_count: conversation.message_count + 1,
            last_message_at: new Date(),
            total_cost: String(
              Number(conversation.total_cost) + Number(data.cost || 0),
            ),
            updated_at: new Date(),
          })
          .where(eq(conversations.id, conversationId));
      }

      return message;
    });
  }
}

/**
 * Singleton instance of ConversationsRepository.
 */
export const conversationsRepository = new ConversationsRepository();
