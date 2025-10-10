import {
  eq,
  desc,
  and,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
import { db } from "../client";
import {
  conversations,
  conversationMessages,
} from "../schemas/conversations";

export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;
export type ConversationMessage = InferSelectModel<typeof conversationMessages>;
export type NewConversationMessage = InferInsertModel<
  typeof conversationMessages
>;

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

export class ConversationsRepository {
  async findById(id: string): Promise<Conversation | undefined> {
    return await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
  }

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

  async listByUser(userId: string, limit?: number): Promise<Conversation[]> {
    return await db.query.conversations.findMany({
      where: eq(conversations.user_id, userId),
      orderBy: desc(conversations.updated_at),
      limit,
    });
  }

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

  async create(data: NewConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return conversation;
  }

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

  async delete(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Message operations
  async addMessage(
    data: NewConversationMessage,
  ): Promise<ConversationMessage> {
    const [message] = await db
      .insert(conversationMessages)
      .values(data)
      .returning();
    return message;
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    return await db.query.conversationMessages.findMany({
      where: eq(conversationMessages.conversation_id, conversationId),
      orderBy: desc(conversationMessages.sequence_number),
    });
  }

  async getNextSequenceNumber(conversationId: string): Promise<number> {
    const lastMessage = await db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.conversation_id, conversationId),
      orderBy: desc(conversationMessages.sequence_number),
    });

    return lastMessage ? lastMessage.sequence_number + 1 : 1;
  }
}

// Export singleton instance
export const conversationsRepository = new ConversationsRepository();
