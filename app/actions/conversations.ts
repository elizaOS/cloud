"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { conversationsService } from "@/lib/services";

export async function createConversationAction(data: {
  title: string;
  model: string;
}) {
  const user = await requireAuth();

  const conversation = await conversationsService.create({
    title: data.title,
    model: data.model,
    organization_id: user.organization_id,
    user_id: user.id,
    status: "active",
  });

  revalidatePath("/dashboard/chat");
  return { success: true, conversation };
}

export async function updateConversationTitleAction(
  conversationId: string,
  title: string,
) {
  await requireAuth();

  const conversation = await conversationsService.update(conversationId, {
    title,
  });

  if (!conversation) {
    return { success: false, error: "Conversation not found" };
  }

  revalidatePath("/dashboard/chat");
  return { success: true, conversation };
}

export async function deleteConversationAction(conversationId: string) {
  await requireAuth();

  await conversationsService.delete(conversationId);

  revalidatePath("/dashboard/chat");
  return { success: true };
}

export async function listUserConversationsAction() {
  const user = await requireAuth();

  const conversations = await conversationsService.listByUser(user.id, 50);

  return { success: true, conversations };
}

export async function getConversationAction(conversationId: string) {
  await requireAuth();

  const conversation =
    await conversationsService.getWithMessages(conversationId);

  if (!conversation) {
    return { success: false, error: "Conversation not found" };
  }

  return { success: true, conversation };
}
