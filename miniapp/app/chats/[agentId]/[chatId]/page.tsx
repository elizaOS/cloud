"use client";

import {
  AlertCircle,
  Bot,
  ChevronLeft,
  Loader2,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type AgentDetails,
  type Chat,
  createChat,
  getAgent,
  getChat,
  listChats,
  type Message,
  sendMessage,
} from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.agentId as string;
  const chatId = params.chatId as string;
  const { ready, authenticated } = useAuth();

  const [agent, setAgent] = useState<AgentDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isThinking]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch agent, chat history, and current chat messages
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentData, chatData, historyData] = await Promise.all([
        getAgent(agentId),
        getChat(agentId, chatId),
        listChats(agentId, { limit: 20 }),
      ]);
      setAgent(agentData);
      setMessages(chatData.messages);
      setChatHistory(historyData.chats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [agentId, chatId]);

  useEffect(() => {
    if (authenticated && agentId && chatId) {
      fetchData();
    }
  }, [authenticated, agentId, chatId, fetchData]);

  // Create new chat
  const handleNewChat = async () => {
    setCreatingChat(true);
    try {
      const newChat = await createChat(agentId);
      setSidebarOpen(false);
      router.push(`/chats/${agentId}/${newChat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat");
    } finally {
      setCreatingChat(false);
    }
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const messageText = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    setStreamingContent("");
    setIsThinking(false);

    // Add user message optimistically
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      content: messageText,
      role: "user",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      await sendMessage(chatId, messageText, {
        onStart: () => {
          // Connection established - show thinking indicator
          setIsThinking(true);
        },
        onUserMessage: (msg) => {
          // Update user message with actual ID
          setMessages((prev) =>
            prev.map((m) => (m.id === userMessage.id ? { ...msg } : m))
          );
        },
        onThinking: () => {
          // Agent is thinking/processing
          setIsThinking(true);
          setStreamingContent("");
        },
        onChunk: (chunk) => {
          // Receiving streamed content
          setIsThinking(false);
          setStreamingContent((prev) => prev + chunk);
        },
        onComplete: (msg) => {
          setIsThinking(false);
          setStreamingContent("");
          setMessages((prev) => [...prev, msg]);
        },
        onError: (err) => {
          setError(err);
          setIsThinking(false);
          setStreamingContent("");
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setIsThinking(false);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Format chat title - use name if available, otherwise last message preview
  const formatChatTitle = (chat: Chat) => {
    // Use generated name if available
    if (chat.name) {
      return chat.name;
    }
    // Fall back to last message preview
    if (chat.lastMessage?.content) {
      const content = chat.lastMessage.content;
      return content.length > 35 ? content.substring(0, 35) + "..." : content;
    }
    return "New conversation";
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 top-14 z-50 w-72 transform border-r border-white/10 bg-[#0a0512] transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-pink-500/20">
                {agent?.avatarUrl ? (
                  <Image
                    src={agent.avatarUrl}
                    alt={agent.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <Bot className="h-5 w-5 text-pink-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium text-white">
                  {agent?.name}
                </h2>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-white/60 hover:bg-white/5 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* New Chat Button */}
          <div className="p-3">
            <button
              onClick={handleNewChat}
              disabled={creatingChat}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pink-600 disabled:opacity-50"
            >
              {creatingChat ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              New Chat
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2">
              <h3 className="px-2 text-xs font-medium uppercase tracking-wider text-white/40">
                Chat History
              </h3>
            </div>
            <nav className="space-y-1 px-3 pb-3">
              {chatHistory.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chats/${agentId}/${chat.id}`}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    chat.id === chatId
                      ? "bg-pink-500/20 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{formatChatTitle(chat)}</p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {formatRelativeTime(chat.updatedAt)}
                    </p>
                  </div>
                </Link>
              ))}
              {chatHistory.length === 0 && (
                <p className="px-3 py-2 text-sm text-white/40">No chats yet</p>
              )}
            </nav>
          </div>

          {/* Sidebar Footer - Edit Character & Back */}
          <div className="border-t border-white/10 p-3 space-y-2">
            <Link
              href={`/agents/${agentId}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Pencil className="h-4 w-4" />
              Edit Character
            </Link>
            <Link
              href="/chats"
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm text-white/60 transition-colors hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Characters
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-pink-500/20">
              {agent?.avatarUrl ? (
                <Image
                  src={agent.avatarUrl}
                  alt={agent.name}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <Bot className="h-4 w-4 text-pink-400" />
              )}
            </div>
            <span className="font-medium text-white">{agent?.name}</span>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.length === 0 && !streamingContent && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-pink-500/20">
                  {agent?.avatarUrl ? (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <Bot className="h-8 w-8 text-pink-400" />
                  )}
                </div>
                <p className="mt-4 text-sm text-white/60">
                  Start a conversation with {agent?.name}
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pink-500/20">
                    {agent?.avatarUrl ? (
                      <Image
                        src={agent.avatarUrl}
                        alt={agent.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    ) : (
                      <Bot className="h-4 w-4 text-pink-400" />
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-pink-500 text-white"
                      : "bg-white/10 text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                </div>
                {message.role === "user" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <User className="h-4 w-4 text-white/60" />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator - shown when waiting for response */}
            {isThinking && !streamingContent && (
              <div className="flex gap-3 animate-in fade-in duration-300">
                <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pink-500/20">
                  {agent?.avatarUrl ? (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-lg object-cover"
                    />
                  ) : (
                    <Bot className="h-4 w-4 text-pink-400" />
                  )}
                  {/* Subtle pulsing glow */}
                  <span className="absolute inset-0 animate-pulse rounded-lg bg-pink-500/30" />
                </div>
                <div className="rounded-lg bg-gradient-to-r from-pink-500/10 to-purple-500/10 px-4 py-3 text-white border border-pink-500/20">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 animate-pulse text-pink-400" />
                    <span className="text-sm text-white/70">
                      {agent?.name} is thinking
                    </span>
                    <span className="flex gap-1 ml-1">
                      <span className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-pink-400" />
                      <span className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-pink-400" />
                      <span className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-pink-400" />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Streaming message - shown when receiving response content */}
            {streamingContent && (
              <div className="flex gap-3 animate-in fade-in duration-200">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pink-500/20">
                  {agent?.avatarUrl ? (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-lg object-cover"
                    />
                  ) : (
                    <Bot className="h-4 w-4 text-pink-400" />
                  )}
                </div>
                <div className="max-w-[80%] rounded-lg bg-white/10 px-4 py-2 text-white">
                  <p className="whitespace-pre-wrap text-sm">
                    {streamingContent}
                    {/* Typing cursor */}
                    <span className="animate-typing-cursor ml-0.5 inline-block h-4 w-0.5 bg-pink-400 align-middle" />
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-white/5 px-4 py-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="flex items-center justify-center rounded-lg bg-pink-500 px-4 py-2 text-white transition-colors hover:bg-pink-600 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
