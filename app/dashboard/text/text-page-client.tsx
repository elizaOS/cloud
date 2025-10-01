'use client';

import { useRouter } from 'next/navigation';
import type { Conversation, ConversationMessage } from '@/lib/types';
import { ConversationList } from '@/components/chat/conversation-list';
import { ChatInterfaceWithPersistence } from '@/components/chat/chat-interface-with-persistence';

interface TextPageClientProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  initialMessages: ConversationMessage[];
}

export function TextPageClient({
  conversations,
  currentConversation,
  initialMessages,
}: TextPageClientProps) {
  const router = useRouter();

  const handleSelectConversation = (id: string) => {
    router.push(`/dashboard/text?conversationId=${id}`);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12rem)]">
      <div>
        <h1 className="text-3xl font-bold">Text & Chat</h1>
        <p className="text-muted-foreground mt-2">
          Generate text and engage in AI conversations
        </p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-64 flex-shrink-0">
          <ConversationList
            conversations={conversations}
            currentConversationId={currentConversation?.id}
            onSelectConversation={handleSelectConversation}
          />
        </div>

        <div className="flex-1 border rounded-lg bg-card">
          <ChatInterfaceWithPersistence
            conversation={currentConversation}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  );
}
