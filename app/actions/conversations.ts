'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import {
  createConversation,
  updateConversation,
  deleteConversation,
  listConversationsByUser,
  getConversationWithMessages,
} from '@/lib/queries/conversations';

export async function createConversationAction(data: {
  title: string;
  model: string;
}) {
  const user = await requireAuth();

  const conversation = await createConversation({
    title: data.title,
    model: data.model,
    organization_id: user.organization_id,
    user_id: user.id,
    status: 'active',
  });

  revalidatePath('/dashboard/text');
  return { success: true, conversation };
}

export async function updateConversationTitleAction(
  conversationId: string,
  title: string
) {
  await requireAuth();

  const conversation = await updateConversation(conversationId, {
    title,
  });

  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  revalidatePath('/dashboard/text');
  return { success: true, conversation };
}

export async function deleteConversationAction(conversationId: string) {
  await requireAuth();

  await deleteConversation(conversationId);

  revalidatePath('/dashboard/text');
  return { success: true };
}

export async function listUserConversationsAction() {
  const user = await requireAuth();

  const conversations = await listConversationsByUser(user.id, {
    status: 'active',
    limit: 50,
  });

  return { success: true, conversations };
}

export async function getConversationAction(conversationId: string) {
  await requireAuth();

  const conversation = await getConversationWithMessages(conversationId);

  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  return { success: true, conversation };
}
