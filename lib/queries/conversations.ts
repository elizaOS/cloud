import { db, schema, eq, and, desc, asc } from "@/lib/db";
import type {
  Conversation,
  NewConversation,
  ConversationMessage,
  NewConversationMessage,
  ConversationWithMessages,
} from "@/lib/types";

export async function createConversation(
  data: NewConversation,
): Promise<Conversation> {
  const [conversation] = await db
    .insert(schema.conversations)
    .values(data)
    .returning();
  return conversation;
}

export async function getConversationById(
  id: string,
): Promise<Conversation | undefined> {
  return await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, id),
  });
}

export async function getConversationWithMessages(
  id: string,
): Promise<ConversationWithMessages | undefined> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, id),
    with: {
      messages: {
        orderBy: asc(schema.conversationMessages.sequence_number),
      },
    },
  });

  if (!conversation) return undefined;

  return conversation as ConversationWithMessages;
}

export async function listConversationsByUser(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
  },
): Promise<Conversation[]> {
  const { limit = 50, offset = 0, status } = options || {};

  const conditions = [eq(schema.conversations.user_id, userId)];

  if (status) {
    conditions.push(eq(schema.conversations.status, status));
  }

  return await db.query.conversations.findMany({
    where: and(...conditions),
    orderBy: desc(schema.conversations.updated_at),
    limit,
    offset,
  });
}

export async function updateConversation(
  id: string,
  data: Partial<NewConversation>,
): Promise<Conversation | undefined> {
  const [updated] = await db
    .update(schema.conversations)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(schema.conversations.id, id))
    .returning();
  return updated;
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
}

export async function addMessageWithSequence(
  conversationId: string,
  data: Omit<NewConversationMessage, "sequence_number" | "conversation_id">,
): Promise<ConversationMessage> {
  return await db.transaction(async (tx) => {
    const lastMessage = await tx.query.conversationMessages.findFirst({
      where: eq(schema.conversationMessages.conversation_id, conversationId),
      orderBy: desc(schema.conversationMessages.sequence_number),
    });

    const nextSequence = lastMessage ? lastMessage.sequence_number + 1 : 1;

    const [message] = await tx
      .insert(schema.conversationMessages)
      .values({
        ...data,
        conversation_id: conversationId,
        sequence_number: nextSequence,
      })
      .returning();

    const conversation = await tx.query.conversations.findFirst({
      where: eq(schema.conversations.id, conversationId),
    });

    if (conversation) {
      await tx
        .update(schema.conversations)
        .set({
          message_count: conversation.message_count + 1,
          last_message_at: new Date(),
          total_cost: conversation.total_cost + (data.cost || 0),
          updated_at: new Date(),
        })
        .where(eq(schema.conversations.id, conversationId));
    }

    return message;
  });
}



