import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { conversationsService } from "@/lib/services";
import { TextPageClient } from "../../../components/chat/text-page-client";
import type { ConversationMessage } from "@/lib/types";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.textGeneration,
  path: "/dashboard/text",
  noIndex: true,
});

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export default async function TextPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  const conversations = await conversationsService.listByUser(user.id, 50);

  let currentConversation = null;
  let messages: ConversationMessage[] = [];

  if (params.conversationId) {
    const conv = await conversationsService.getWithMessages(
      params.conversationId,
    );
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
