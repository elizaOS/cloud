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
  const messageTimestamps = useRef<Map<string, Date>>(new Map());

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
        initialMessages.forEach(msg => {
          messageTimestamps.current.set(msg.id, new Date(msg.created_at));
        });

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
      messageTimestamps.current.clear();

      if (initialMessages.length > 0) {
        initialMessages.forEach(msg => {
          messageTimestamps.current.set(msg.id, new Date(msg.created_at));
        });

        const formattedMessages: UIMessage[] = initialMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: [{ type: 'text', text: msg.content }],
        }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    }
  }, [conversation?.id, initialMessages, setMessages, activeConversationId]);

  useEffect(() => {
    messages.forEach(msg => {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, new Date());
      }
    });
  }, [messages]);

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

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return timeStr;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }

    const isSameYear = date.getFullYear() === now.getFullYear();
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(isSameYear ? {} : { year: 'numeric' })
    });

    return `${dateStr}, ${timeStr}`;
  };

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="border-b px-6 py-4 flex items-center justify-between bg-gradient-to-r from-background to-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-md">
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
            className="gap-2 shadow-sm rounded-lg border-muted-foreground/20"
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs font-medium">{selectedModel}</span>
            <Badge variant="secondary" className="ml-1 text-xs rounded-md">
              {messages.length}
            </Badge>
          </Button>

          {showModelSelector && availableModels.length > 0 && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border bg-popover shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-all ${selectedModel === model.id ? 'bg-accent border border-primary/20' : ''
                      }`}
                  >
                    <div className="font-medium">{model.name}</div>
                    {model.provider && (
                      <div className="text-xs text-muted-foreground mt-0.5">
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

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-gradient-to-b from-background/50 to-muted/10">
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
            className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-in fade-in slide-in-from-bottom-4 duration-500`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-md transition-transform hover:scale-105">
                <Bot className="h-5 w-5 text-white" />
              </div>
            )}

            <div
              className={`rounded-2xl px-5 py-4 max-w-[75%] shadow-sm transform transition-all ${message.role === 'user'
                  ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-md hover:shadow-lg'
                  : 'bg-card border border-muted-foreground/10 hover:border-muted-foreground/20 hover:shadow-md'
                }`}
            >
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      return <div key={`${message.id}-${i}`}>{part.text}</div>;
                    default:
                      return null;
                  }
                })}
              </div>

              <div className={`flex items-center gap-1.5 text-[11px] mt-3 pt-2.5 border-t ${message.role === 'user'
                  ? 'border-primary-foreground/15 text-primary-foreground/70'
                  : 'border-muted-foreground/10 text-muted-foreground/70'
                }`}>
                <Clock className="h-3 w-3" />
                <span>{formatTimestamp(messageTimestamps.current.get(message.id)?.getTime() || Date.now())}</span>
              </div>
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md transition-transform hover:scale-105">
                <User className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
        ))}

        {isWaitingForResponse && (
          <div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-md">
              <Bot className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div className="rounded-2xl px-5 py-4 bg-card border border-muted-foreground/10 shadow-sm max-w-[75%]">
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

      <form onSubmit={handleSubmit} className="border-t px-6 py-4 bg-gradient-to-r from-background to-muted/20">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder={conversation ? "Type your message..." : "Type your message to start a new conversation..."}
              disabled={isLoading}
              className="w-full rounded-xl border border-muted-foreground/20 bg-background px-5 py-3.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-50 transition-all placeholder:text-muted-foreground/60"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl shadow-sm hover:shadow-md transition-all px-5"
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
