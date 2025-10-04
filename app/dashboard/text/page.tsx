import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import {
  listConversationsByUser,
  getConversationWithMessages,
} from "@/lib/queries/conversations";
import { TextPageClient } from "../../../components/chat/text-page-client";
import type { ConversationMessage } from "@/lib/types";

export const metadata: Metadata = {
  title: "Text & Chat Generation",
  description:
    "Generate AI-powered text and engage in intelligent conversations with advanced language models",
};

export default async function TextPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  const conversations = await listConversationsByUser(user.id, {
    status: "active",
    limit: 50,
  });

  let currentConversation = null;
  let messages: ConversationMessage[] = [];

  if (params.conversationId) {
    const conv = await getConversationWithMessages(params.conversationId);
    if (conv) {
      currentConversation = conv;
      messages = conv.messages || [];
    }
  }

  return (
    <TextPageClient
      conversations={conversations}
      currentConversation={currentConversation}
      initialMessages={messages}
    />
  );
}
