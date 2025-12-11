"use client";

import {
  AlertCircle,
  Bot,
  ChevronLeft,
  ImageIcon,
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

// Helper to generate unique IDs without using Date.now() during render
const generateId = () => {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).substring(2, 15)}`;
};

// Image validation constants
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_COMPRESSED_SIZE = 1 * 1024 * 1024; // 1MB target after compression
const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_DIMENSION = 2048; // Max width/height after resize

/**
 * Compress and resize image for optimal upload
 * Returns a base64 data URL
 */
async function compressImage(file: File, maxSize: number = MAX_COMPRESSED_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels to meet size target
      let quality = 0.9;
      let result = canvas.toDataURL("image/jpeg", quality);

      // Reduce quality until under maxSize or minimum quality reached
      while (result.length > maxSize * 1.37 && quality > 0.3) { // 1.37 accounts for base64 overhead
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }

      resolve(result);
    };

    img.onerror = () => reject(new Error("Failed to load image"));

    // Read file as data URL for the Image element
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file
 * Returns error message or null if valid
 */
function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Please select an image file";
  }

  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    return `Unsupported format. Please use: ${VALID_IMAGE_TYPES.map(t => t.split('/')[1].toUpperCase()).join(', ')}`;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `Image too large (${sizeMB}MB). Maximum size is 5MB`;
  }

  return null;
}

import { OutOfCreditsPrompt } from "@/components/out-of-credits-prompt";
import {
  type AgentDetails,
  type Chat,
  createChat,
  getAgent,
  getBilling,
  getChat,
  listChats,
  type Message,
  type MessageAttachment,
  sendMessage,
} from "@/lib/cloud-api";
import { useRenderTracking } from "@/lib/dev/render-tracking";
import { useAuth } from "@/lib/use-auth";

function ChatPage() {
  // Development: Track renders for this complex component
  useRenderTracking("ChatPage", { threshold: 10 });

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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [showLowCredits, setShowLowCredits] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const [agentData, chatData, historyData, billingData] = await Promise.all([
      getAgent(agentId),
      getChat(agentId, chatId),
      listChats(agentId, { limit: 20 }),
      getBilling().catch(() => null),
    ]);
    
    setAgent(agentData);
    setMessages(chatData.messages);
    setChatHistory(historyData.chats);
    
    if (billingData) {
      // Use app-specific credits if monetization is enabled, otherwise use org credits
      let balance: number;
      if (billingData.appBilling?.monetizationEnabled && billingData.appBilling.creditBalance !== undefined) {
        balance = billingData.appBilling.creditBalance;
      } else {
        balance = parseFloat(billingData.billing.creditBalance);
      }
      setCreditBalance(balance);
      setShowLowCredits(balance < 0.5);
    }
    setLoading(false);
  }, [agentId, chatId]);

  useEffect(() => {
    if (authenticated && agentId && chatId) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        fetchData();
      }, 0);
    }
  }, [authenticated, agentId, chatId, fetchData]);

  // Create new chat
  const handleNewChat = async () => {
    setCreatingChat(true);
    const newChat = await createChat(agentId);
    setSidebarOpen(false);
    router.push(`/chats/${agentId}/${newChat.id}`);
    setCreatingChat(false);
  };

  // Send message
  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || sending) return;

    const messageText = input.trim();
    const imageToSend = selectedImage;
    
    setInput("");
    clearSelectedImage();
    setSending(true);
    setError(null);
    setStreamingContent("");
    setIsThinking(false);

    // Generate unique IDs without using Date.now() (avoiding purity issues)
    const messageId = generateId();
    const attachmentId = imageToSend ? generateId() : null;
    const createdAt = new Date().toISOString();

    // Add user message optimistically (with image if selected)
    const userAttachments: MessageAttachment[] = imageToSend && attachmentId
      ? [{ id: attachmentId, url: imageToSend, contentType: "image" }]
      : [];
    
    const userMessage: Message = {
      id: messageId,
      content: messageText || (imageToSend ? "[Image]" : ""),
      role: "user",
      createdAt,
      attachments: userAttachments.length > 0 ? userAttachments : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Pass attachments to the streaming endpoint for image uploads
    await sendMessage(
      chatId, 
      messageText || "What do you see in this image?", 
      {
      onStart: () => {
        // Connection established - show thinking indicator
        setIsThinking(true);
      },
      onUserMessage: (msg) => {
        // Update user message with actual ID, but preserve local attachments
        // (server may not include attachments in confirmation)
        setMessages((prev) =>
          prev.map((m) => (m.id === userMessage.id ? { 
            ...msg, 
            attachments: msg.attachments || m.attachments,
          } : m))
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
        // Refresh chat history to show updated title (generated after 4+ messages)
        listChats(agentId, { limit: 20 }).then((historyData) => {
          setChatHistory(historyData.chats);
        }).catch(() => {
          // Non-critical, ignore errors
        });
      },
      onError: (err) => {
        setError(err);
        setIsThinking(false);
        setStreamingContent("");
        // Check if error is credit-related
        if (err.toLowerCase().includes("credit") || err.toLowerCase().includes("insufficient") || err.toLowerCase().includes("balance")) {
          setShowLowCredits(true);
          setCreditBalance(0);
        }
      },
    },
    undefined, // model
    userAttachments.length > 0 ? userAttachments : undefined // attachments
  );
    setSending(false);
    inputRef.current?.focus();
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle image selection with compression
  const handleImageSelect = useCallback(async (file: File) => {
    // Validate file
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsProcessingImage(true);
    setError(null);

    try {
      // Compress image if it's larger than target size
      let imageDataUrl: string;
      if (file.size > MAX_COMPRESSED_SIZE || !file.type.includes("jpeg")) {
        imageDataUrl = await compressImage(file);
      } else {
        // Small JPEG files can be used directly
        imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      }

      setSelectedImageFile(file);
      setSelectedImage(imageDataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setIsProcessingImage(false);
    }
  }, []);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sending) {
      setIsDraggingOver(true);
    }
  }, [sending]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (sending) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        handleImageSelect(file);
      } else {
        setError("Please drop an image file");
      }
    }
  }, [sending, handleImageSelect]);

  // Handle paste from clipboard
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (sending) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleImageSelect(file);
        }
        break;
      }
    }
  }, [sending, handleImageSelect]);

  // Set up paste listener
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // Clear selected image
  const clearSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Open image in modal
  const openImageModal = (url: string) => {
    setImageModalUrl(url);
  };

  // Close image modal
  const closeImageModal = () => {
    setImageModalUrl(null);
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

  // Format relative time with safe date handling
  const formatRelativeTime = (dateValue: string | number | Date | null | undefined) => {
    if (!dateValue) return "Just now";

    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "Just now";

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
    } catch {
      return "Just now";
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
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
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-brand/20">
                {agent?.avatarUrl ? (
                  agent.avatarUrl.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <Image
                      src={agent.avatarUrl}
                      alt={agent.name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  )
                ) : (
                  <Bot className="h-5 w-5 text-brand-400" />
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
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
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
                      ? "bg-brand/20 text-white"
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
              Back to Friends
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
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-brand/20">
              {agent?.avatarUrl ? (
                agent.avatarUrl.startsWith("data:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.avatarUrl}
                    alt={agent.name}
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                ) : (
                  <Image
                    src={agent.avatarUrl}
                    alt={agent.name}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                )
              ) : (
                <Bot className="h-4 w-4 text-brand-400" />
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
            {messages.length === 0 && !streamingContent && !isThinking && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand/20">
                  {agent?.avatarUrl ? (
                    agent.avatarUrl.startsWith("data:") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agent.avatarUrl}
                        alt={agent.name}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <Image
                        src={agent.avatarUrl}
                        alt={agent.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    )
                  ) : (
                    <Bot className="h-8 w-8 text-brand-400" />
                  )}
                </div>
                <p className="mt-4 text-sm text-white/60">
                  Send the first message to {agent?.name}
                </p>
              </div>
            )}

            {messages.map((message) => {
              const hasAttachments = message.attachments && message.attachments.length > 0;
              const hasText = message.content && message.content !== "[Image]";
              const isAgentWithImage = message.role === "assistant" && hasAttachments;

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand/20">
                      {agent?.avatarUrl ? (
                        agent.avatarUrl.startsWith("data:") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={agent.avatarUrl}
                            alt={agent.name}
                            className="h-8 w-8 rounded-lg object-cover"
                          />
                        ) : (
                          <Image
                            src={agent.avatarUrl}
                            alt={agent.name}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-lg object-cover"
                          />
                        )
                      ) : (
                        <Bot className="h-4 w-4 text-brand-400" />
                      )}
                    </div>
                  )}
                  <div
                    className={`${
                      isAgentWithImage
                        ? "max-w-xs sm:max-w-sm"
                        : "max-w-[80%]"
                    } ${
                      message.role === "user"
                        ? "rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-white"
                        : isAgentWithImage
                        ? "overflow-hidden rounded-2xl rounded-bl-md bg-white/[0.08] backdrop-blur-sm"
                        : "rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-white"
                    }`}
                  >
                    {/* Agent message with image - card layout */}
                    {isAgentWithImage ? (
                      <>
                        <div className="relative">
                          {message.attachments!.map((attachment, idx) => (
                            <button
                              key={attachment.id}
                              onClick={() => openImageModal(attachment.url)}
                              className={`block w-full focus:outline-none focus:ring-2 focus:ring-brand focus:ring-inset ${
                                idx > 0 ? "mt-1" : ""
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={attachment.url}
                                alt={attachment.title || "Image"}
                                className="w-full object-cover hover:opacity-95 transition-opacity"
                                style={{ maxHeight: "280px" }}
                              />
                            </button>
                          ))}
                        </div>
                        {hasText && (
                          <div className="px-3.5 py-2.5">
                            <p className="whitespace-pre-wrap text-sm text-white leading-relaxed">
                              {message.content}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* User message with image */}
                        {hasAttachments && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {message.attachments!.map((attachment) => (
                              <button
                                key={attachment.id}
                                onClick={() => openImageModal(attachment.url)}
                                className="relative overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={attachment.url}
                                  alt={attachment.title || "Image"}
                                  className="h-32 w-32 rounded-lg object-cover hover:opacity-90 transition-opacity"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Display text content */}
                        {hasText && (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {message.content}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <User className="h-4 w-4 text-white/60" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Thinking indicator - shown when waiting for response */}
            {isThinking && !streamingContent && (
              <div className="flex gap-3 animate-in fade-in duration-300">
                <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand/20">
                  {agent?.avatarUrl ? (
                    agent.avatarUrl.startsWith("data:") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agent.avatarUrl}
                        alt={agent.name}
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    ) : (
                      <Image
                        src={agent.avatarUrl}
                        alt={agent.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    )
                  ) : (
                    <Bot className="h-4 w-4 text-brand-400" />
                  )}
                  {/* Subtle pulsing glow */}
                  <span className="absolute inset-0 animate-pulse rounded-lg bg-brand/30" />
                </div>
                <div className="rounded-lg bg-gradient-to-r from-brand/10 to-accent-brand/10 px-4 py-3 text-white border border-brand/20">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 animate-pulse text-brand-400" />
                    <span className="text-sm text-white/70">
                      {agent?.name} is thinking
                    </span>
                    <span className="flex gap-1 ml-1">
                      <span className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-brand-400" />
                      <span className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-brand-400" />
                      <span className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-brand-400" />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Streaming message - shown when receiving response content */}
            {streamingContent && (
              <div className="flex gap-3 animate-in fade-in duration-200">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand/20">
                  {agent?.avatarUrl ? (
                    agent.avatarUrl.startsWith("data:") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agent.avatarUrl}
                        alt={agent.name}
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    ) : (
                      <Image
                        src={agent.avatarUrl}
                        alt={agent.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    )
                  ) : (
                    <Bot className="h-4 w-4 text-brand-400" />
                  )}
                </div>
                <div className="max-w-[80%] rounded-lg bg-white/10 px-4 py-2 text-white">
                  <p className="whitespace-pre-wrap text-sm">
                    {streamingContent}
                    {/* Typing cursor */}
                    <span className="animate-typing-cursor ml-0.5 inline-block h-4 w-0.5 bg-brand-400 align-middle" />
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Low credits prompt */}
        {showLowCredits && (
          <div className="border-t border-white/5 px-4 py-3">
            <div className="mx-auto max-w-2xl">
              <OutOfCreditsPrompt
                currentBalance={creditBalance ?? 0}
              />
            </div>
          </div>
        )}

        {/* Input */}
        <div
          className={`border-t px-4 py-3 transition-colors ${
            isDraggingOver
              ? "border-brand bg-brand/5"
              : "border-white/5"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay hint */}
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-x-4 -mt-1 mb-2 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand/10 py-4">
              <span className="text-sm font-medium text-brand">Drop image here</span>
            </div>
          )}
          <div className="mx-auto max-w-2xl">
            {/* Selected image preview */}
            {selectedImage && (
              <div className="mb-2 flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedImage}
                    alt="Selected"
                    className="h-20 w-20 rounded-lg object-cover ring-2 ring-brand/30"
                    onClick={() => openImageModal(selectedImage)}
                  />
                  <button
                    onClick={clearSelectedImage}
                    disabled={sending}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 shadow-lg"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {/* Click to preview hint */}
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-xs text-white">Preview</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-white/60 truncate max-w-[150px]">
                    {selectedImageFile?.name}
                  </span>
                  <span className="text-xs text-white/40">
                    {selectedImageFile && `${(selectedImageFile.size / 1024).toFixed(0)}KB`}
                  </span>
                </div>
              </div>
            )}

            {/* Processing indicator */}
            {isProcessingImage && (
              <div className="mb-2 flex items-center gap-2 text-sm text-white/60 animate-in fade-in duration-200">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                <span>Processing image...</span>
              </div>
            )}
            
            <div className="flex gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={VALID_IMAGE_TYPES.join(",")}
                onChange={handleFileInputChange}
                className="hidden"
              />

              {/* Image upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || isProcessingImage}
                className={`flex items-center justify-center rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 ${
                  isDraggingOver
                    ? "border-brand bg-brand/20 text-brand"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
                title="Upload image (or paste/drag & drop)"
              >
                {isProcessingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
              </button>
              
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || sending}
              className="flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
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

      {/* Image modal for viewing full-size images */}
      {imageModalUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={closeImageModal}
        >
          <button
            onClick={closeImageModal}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageModalUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// Enable why-did-you-render tracking for this component
if (process.env.NODE_ENV === "development") {
  (ChatPage as React.FC & { whyDidYouRender?: boolean }).whyDidYouRender = true;
}

export default ChatPage;
