'use client';

import { useState, useEffect } from 'react';
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
  conversations: initialConversations,
  currentConversation: initialCurrentConversation,
  initialMessages,
}: TextPageClientProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(initialCurrentConversation);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  useEffect(() => {
    setCurrentConversation(initialCurrentConversation);
  }, [initialCurrentConversation]);

  const handleSelectConversation = (id: string) => {
    router.push(`/dashboard/text?conversationId=${id}`);
  };

  const handleConversationCreated = (conversation: Conversation) => {
    setConversations(prev => [conversation, ...prev]);
    setCurrentConversation(conversation);
    router.push(`/dashboard/text?conversationId=${conversation.id}`);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12rem)]">
      <div>
        <h1 className="text-3xl font-bold">Text & Chat</h1>
        <p className="text-muted-foreground mt-2">
          Generate text and engage in AI conversations
        </p>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        <div className="w-64 flex-shrink-0">
          <ConversationList
            conversations={conversations}
            currentConversationId={currentConversation?.id}
            onSelectConversation={handleSelectConversation}
          />
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatInterfaceWithPersistence
            conversation={currentConversation}
            initialMessages={initialMessages}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}
