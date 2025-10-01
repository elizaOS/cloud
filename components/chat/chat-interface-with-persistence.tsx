'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat, type UIMessage } from '@ai-sdk/react';
import type { Conversation, ConversationMessage } from '@/lib/types';
import { Send, Loader2, Bot, User, Clock, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createConversationAction } from '@/app/actions/conversations';

interface ChatInterfaceWithPersistenceProps {
  conversation?: Conversation | null;
  initialMessages?: ConversationMessage[];
  onConversationCreated?: (conversation: Conversation) => void;
}

export function ChatInterfaceWithPersistence({
  conversation,
  initialMessages = [],
  onConversationCreated,
}: ChatInterfaceWithPersistenceProps) {
  const [input, setInput] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; provider?: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState(conversation?.model || 'gpt-4o');
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversation?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: selectedModel,
  });

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setAvailableModels(data.models);
        }
      })
      .catch(err => console.error('Failed to fetch models:', err));
  }, []);

  useEffect(() => {
    const conversationId = conversation?.id || null;
    const hasConversationChanged = conversationId !== activeConversationId;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setActiveConversationId(conversationId);

      if (initialMessages.length > 0) {
        const formattedMessages: UIMessage[] = initialMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: [{ type: 'text', text: msg.content }],
        }));
        setMessages(formattedMessages);
      }
      return;
    }

    if (hasConversationChanged) {
      setActiveConversationId(conversationId);

      if (initialMessages.length > 0) {
        const formattedMessages: UIMessage[] = initialMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: [{ type: 'text', text: msg.content }],
        }));
        setMessages(formattedMessages);
      } else if (conversationId === null) {
        setMessages([]);
      }
    }
  }, [conversation?.id, initialMessages, setMessages, activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isCreatingConversation) return;

    let conversationId = conversation?.id;

    if (!conversationId) {
      setIsCreatingConversation(true);
      try {
        const result = await createConversationAction({
          title: 'New Conversation',
          model: selectedModel,
        });

        if (!result.success || !result.conversation) {
          console.error('Failed to create conversation');
          setIsCreatingConversation(false);
          return;
        }

        conversationId = result.conversation.id;
        setActiveConversationId(conversationId);

        if (onConversationCreated) {
          onConversationCreated(result.conversation);
        }
      } catch (error) {
        console.error('Error creating conversation:', error);
        setIsCreatingConversation(false);
        return;
      } finally {
        setIsCreatingConversation(false);
      }
    }

    const messageText = input;
    setInput('');

    sendMessage({
      text: messageText,
      metadata: { conversationId }
    });
  };

  const isLoading = status === 'streaming' || isCreatingConversation;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isWaitingForResponse = lastMessage?.role === 'user' && status === 'submitted';

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center justify-between bg-gradient-to-r from-background to-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {conversation?.title || 'New Conversation'}
            </h3>
            <p className="text-xs text-muted-foreground">Powered by ElizaOS</p>
          </div>
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="gap-2 shadow-sm"
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs font-medium">{selectedModel}</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {messages.length}
            </Badge>
          </Button>

          {showModelSelector && availableModels.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border bg-popover shadow-lg z-50">
              <div className="p-2 border-b">
                <p className="text-xs font-semibold text-muted-foreground">
                  Select Model
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelector(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-accent transition-colors ${selectedModel === model.id ? 'bg-accent' : ''
                      }`}
                  >
                    <div className="font-medium">{model.name}</div>
                    {model.provider && (
                      <div className="text-xs text-muted-foreground">
                        {model.provider}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!conversation && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Start a new conversation</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Type your message below to begin. A new conversation will be created automatically.
            </p>
          </div>
        )}

        {conversation && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Ask me anything about AI, development, or how ElizaOS can help you
              build intelligent agents.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-in fade-in slide-in-from-bottom-4 duration-500`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-sm transition-transform hover:scale-110">
                <Bot className="h-5 w-5 text-white" />
              </div>
            )}

            <div
              className={`rounded-2xl px-4 py-3 max-w-[80%] shadow-sm transform transition-all hover:scale-[1.02] hover:shadow-md ${message.role === 'user'
                  ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground'
                  : 'bg-card border'
                }`}
            >
              <div className="text-sm whitespace-pre-wrap mb-2">
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      return <div key={`${message.id}-${i}`}>{part.text}</div>;
                    default:
                      return null;
                  }
                })}
              </div>

              <div className={`flex items-center gap-2 text-xs mt-2 pt-2 border-t ${message.role === 'user'
                  ? 'border-primary-foreground/20 text-primary-foreground/80'
                  : 'border-border text-muted-foreground'
                }`}>
                <Clock className="h-3 w-3" />
                <span>{formatTimestamp(Date.now())}</span>
              </div>
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm transition-transform hover:scale-110">
                <User className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
        ))}

        {isWaitingForResponse && (
          <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Bot className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-card border shadow-sm max-w-[80%]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </div>
                <span>Eliza Agent is thinking</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t p-4 bg-gradient-to-r from-background to-muted/20">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder={conversation ? "Type your message..." : "Type your message to start a new conversation..."}
              disabled={isLoading}
              className="w-full rounded-xl border bg-background px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-all"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl shadow-sm hover:shadow-md transition-all"
            size="lg"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
