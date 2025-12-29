/**
 * Conversations actions.
 *
 * This module re-exports client API functions for conversation operations.
 * Previously used "use server" directives, now uses client API routes.
 */

import { conversationsApi } from "@/lib/api/client";

/**
 * Creates a new conversation for the authenticated user.
 */
export async function createConversationAction(data: {
  title: string;
  model: string;
}) {
  const response = await conversationsApi.create(data);
  return { success: response.success, conversation: response.data.conversation };
}

/**
 * Updates the title of an existing conversation.
 */
export async function updateConversationTitleAction(
  conversationId: string,
  title: string,
) {
  const response = await conversationsApi.updateTitle(conversationId, title);
  return { success: response.success, conversation: response.data?.conversation };
}

/**
 * Deletes a conversation.
 */
export async function deleteConversationAction(conversationId: string) {
  const response = await conversationsApi.delete(conversationId);
  return { success: response.success };
}

/**
 * Lists all conversations for the authenticated user.
 */
export async function listUserConversationsAction() {
  const response = await conversationsApi.list(50);
  return { success: response.success, conversations: response.data.conversations };
}

/**
 * Gets a conversation with its messages.
 */
export async function getConversationAction(conversationId: string) {
  const response = await conversationsApi.get(conversationId);
  return { success: response.success, conversation: response.data?.conversation };
}
