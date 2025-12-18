/**
 * Build mode assistant component for AI-assisted character building.
 * Provides chat interface for refining character properties with markdown support and quick prompts.
 *
 * Two modes:
 * - Creator mode (isCreatorMode=true): Chat with default Eliza to create a new character
 * - Build mode (isCreatorMode=false): Chat with the actual character to edit it
 *
 * @param props - Build mode assistant configuration
 * @param props.character - Character being edited (required for build mode)
 * @param props.onCharacterUpdate - Callback when character is updated
 * @param props.onCharacterRefresh - Optional callback to refresh character from database
 * @param props.onRoomIdChange - Optional callback when room ID changes (for parent to track)
 * @param props.userId - User ID for conversation management
 * @param props.isCreatorMode - Whether this is blank state creator (chat with Eliza) or editing existing character
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  Copy,
  Check,
  MessageSquare,
  Lock,
  Zap,
  Sparkles,
  Crown,
} from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import {
  createConversationAction,
  listUserConversationsAction,
} from "@/app/actions/conversations";
import { ElizaAvatar } from "./eliza-avatar";
import { DEFAULT_AVATAR } from "@/lib/utils/default-avatar";
import Link from "next/link";
import { useChatStore } from "@/lib/stores/chat-store";

// Default Eliza configuration for creator mode
const DEFAULT_ELIZA = {
  name: "Eliza",
  avatarUrl: DEFAULT_AVATAR,
} as const;

interface BuildModeAssistantProps {
  character?: ElizaCharacter;
  onCharacterUpdate: (updates: Partial<ElizaCharacter>) => void;
  onCharacterRefresh?: () => Promise<void>;
  onRoomIdChange?: (roomId: string) => void;
  onCharacterCreated?: (characterId: string, characterName: string) => void;
  userId: string;
  isCreatorMode?: boolean;
}

interface MessageAttachment {
  id: string;
  url: string;
  title?: string;
  contentType?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
}

interface LockedRoomInfo {
  characterId: string;
  characterName: string;
}

export function BuildModeAssistant({
  character,
  onCharacterUpdate,
  onCharacterRefresh,
  onRoomIdChange,
  onCharacterCreated,
  userId,
  isCreatorMode = false,
}: BuildModeAssistantProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const roomInitKeyRef = useRef<string | null>(null); // Track which room key we've initialized
  const messagesLoadedRef = useRef<string | null>(null); // Track which room we've loaded messages for
  const [inputText, setInputText] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Get store method to update character avatar in sidebar/dropdown
  const updateCharacterAvatar = useChatStore(
    (state) => state.updateCharacterAvatar,
  );
  const [isLoading, setIsLoading] = useState(false);

  // Build mode specific model tiers (different from chat)
  const buildModeTiers = [
    {
      id: "fast" as const,
      name: "Fast",
      modelId: "moonshotai/kimi-k2-0905",
      recommended: false,
    },
    {
      id: "pro" as const,
      name: "Pro",
      modelId: "google/gemini-3-flash",
      recommended: true,
    },
    {
      id: "ultra" as const,
      name: "Ultra",
      modelId: "anthropic/claude-sonnet-4.5",
      recommended: false,
    },
  ];

  const [selectedTier, setSelectedTier] = useState<"fast" | "pro" | "ultra">(
    "pro",
  );
  const selectedModelId =
    buildModeTiers.find((t) => t.id === selectedTier)?.modelId ??
    "google/gemini-3-flash";

  const tierIcons: Record<string, React.ReactNode> = {
    fast: <Zap className="h-3.5 w-3.5" />,
    pro: <Sparkles className="h-3.5 w-3.5" />,
    ultra: <Crown className="h-3.5 w-3.5" />,
  };
  const [isInitializing, setIsInitializing] = useState(true); // Loading state for initial welcome
  const [builderRoomId, setBuilderRoomId] = useState<string>("");
  const [lockedRoom, setLockedRoom] = useState<LockedRoomInfo | null>(null); // Track if room is locked after character creation

  // Determine display info based on mode
  // In creator mode, always show Eliza (we're creating a new character)
  // In build mode, show the character being edited (even if not fully saved yet)
  const shouldShowCharacter = !isCreatorMode && character?.id;
  const displayName = shouldShowCharacter
    ? character?.name || "Build Assistant"
    : DEFAULT_ELIZA.name;
  const displayAvatar = shouldShowCharacter
    ? character?.avatarUrl || character?.avatar_url
    : DEFAULT_ELIZA.avatarUrl;

  // Create builder room ID
  // - Creator mode: single room for creating new characters (fresh start each time)
  // - Build mode: room per character for editing
  useEffect(() => {
    if (!userId) return;

    // Create a unique key for this room configuration
    const roomKey = isCreatorMode ? "creator" : `build-${character?.id}`;

    // Skip if we've already initialized this room
    if (roomInitKeyRef.current === roomKey) return;
    roomInitKeyRef.current = roomKey;

    const initializeBuilderRoom = async () => {
      // Clear messages and locked state when switching rooms
      setMessages([]);
      setLockedRoom(null);
      messagesLoadedRef.current = null;

      // Room title based on mode - for creator mode, always create fresh
      const timestamp = isCreatorMode ? Date.now() : "";
      const builderTitle = isCreatorMode
        ? `[CREATOR] New Character Builder ${timestamp}`
        : `[BUILD] ${character?.name || "Character"} (${character?.id})`;

      // For build mode, try to find existing room
      if (!isCreatorMode) {
        const { success, conversations } = await listUserConversationsAction();

        if (success && conversations) {
          const existingRoom = conversations.find(
            (conv) =>
              conv.title.startsWith(
                `[BUILD] ${character?.name || "Character"}`,
              ) &&
              character?.id &&
              conv.title.includes(`(${character.id})`),
          );

          if (existingRoom) {
            setBuilderRoomId(existingRoom.id);
            onRoomIdChange?.(existingRoom.id);
            return;
          }
        }
      }

      // Create new builder room (always fresh for creator mode)
      const { success: createSuccess, conversation } =
        await createConversationAction({
          title: builderTitle,
          model: "gpt-4o",
        });

      if (createSuccess && conversation) {
        setBuilderRoomId(conversation.id);
        onRoomIdChange?.(conversation.id);
      } else {
        toast.error("Failed to create builder room");
      }
    };

    initializeBuilderRoom();
  }, [isCreatorMode, character?.id, character?.name, userId, onRoomIdChange]);

  // Load persisted messages when room is initialized
  useEffect(() => {
    if (!builderRoomId) return;

    // Prevent duplicate loads for the same room
    if (messagesLoadedRef.current === builderRoomId) return;
    messagesLoadedRef.current = builderRoomId;

    const loadMessages = async () => {
      setIsInitializing(true);

      const response = await fetch(`/api/eliza/rooms/${builderRoomId}`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const loadedMessages = data.messages || [];
        const metadata = data.metadata as
          | {
              locked?: boolean;
              createdCharacterId?: string;
              createdCharacterName?: string;
            }
          | undefined;

        // Check if room is locked (character was created)
        if (metadata?.locked && metadata.createdCharacterId) {
          setLockedRoom({
            characterId: metadata.createdCharacterId,
            characterName: metadata.createdCharacterName || "your agent",
          });
        }

        // Convert Eliza messages to our Message format
        const convertedMessages: Message[] = loadedMessages
          .map(
            (msg: {
              id: string;
              content: {
                text?: string;
                source?: string;
                metadata?: { type?: string };
                attachments?: Array<{
                  id?: string;
                  url: string;
                  title?: string;
                  contentType?: string;
                }>;
              };
              createdAt: number;
              isAgent: boolean;
            }) => {
              const text = msg.content?.text;
              const attachments = msg.content?.attachments;

              // Allow messages with text OR attachments
              if (
                (!text || typeof text !== "string") &&
                (!attachments || attachments.length === 0)
              ) {
                return null;
              }

              // Skip action result messages
              if (msg.content?.metadata?.type === "action_result") return null;

              const source = msg.content?.source;
              const isAgentMessage =
                source === "agent" ||
                source === "action" ||
                (source === undefined && msg.isAgent);

              return {
                id: msg.id,
                role: isAgentMessage
                  ? ("assistant" as const)
                  : ("user" as const),
                content: text || "",
                timestamp: msg.createdAt,
                attachments: attachments?.map((att) => ({
                  id: att.id || `att-${msg.id}`,
                  url: att.url,
                  title: att.title,
                  contentType: att.contentType,
                })),
              };
            },
          )
          .filter((msg: Message | null): msg is Message => msg !== null);

        setMessages(convertedMessages);
      }

      setIsInitializing(false);
    };

    loadMessages();
  }, [builderRoomId]);

  // Send message to ElizaOS stream endpoint with BUILD workflow
  const sendElizaMessage = async (text: string) => {
    if (!text.trim() || !builderRoomId) return;

    setIsLoading(true);

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Build metadata based on mode
    // Include current client-side character state so the agent knows what user sees
    const clientCharacterState = character
      ? {
          name: character.name || "",
          bio: character.bio || "",
          system: character.system || "",
          adjectives: character.adjectives || [],
          topics: character.topics || [],
          style: character.style || { all: [], chat: [], post: [] },
          messageExamples: character.messageExamples || [],
          avatarUrl: character.avatarUrl || character.avatar_url || "",
        }
      : null;

    const metadata: Record<string, unknown> = isCreatorMode
      ? {
          isCreatorMode: true,
          clientCharacterState,
          isUnsaved: true, // Creator mode is always unsaved
        }
      : {
          targetCharacterId: character?.id,
          clientCharacterState,
          isUnsaved: !character?.id, // Unsaved if no ID yet
        };

    try {
      const response = await fetch(
        `/api/eliza/rooms/${builderRoomId}/messages/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            text,
            model: selectedModelId,
            agentMode: {
              mode: AgentMode.BUILD,
              metadata,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let assistantMessageId = "";

      if (reader) {
        let buffer = "";
        let detectedApplyAction = false;
        let detectedCharacterCreated = false;
        let createdCharacterId: string | null = null;
        let proposedCharacterUpdate: Partial<ElizaCharacter> | null = null;
        let messageAttachments: MessageAttachment[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue;

            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }

            if (eventData) {
              try {
                const data = JSON.parse(eventData);

                if (
                  data.type === "agent" &&
                  (data.content?.text || data.content?.attachments?.length)
                ) {
                  // Skip action result messages from UI but process metadata
                  if (data.content?.metadata?.type === "action_result") {
                    // Check for character creation in action results
                    if (data.content?.metadata?.characterId) {
                      detectedCharacterCreated = true;
                      createdCharacterId = data.content.metadata.characterId;
                    }
                    // Check for SAVE_CHANGES action
                    if (
                      data.content?.actions &&
                      Array.isArray(data.content.actions)
                    ) {
                      if (data.content.actions.includes("SAVE_CHANGES")) {
                        detectedApplyAction = true;
                      }
                    }
                    continue;
                  }

                  assistantMessage = data.content.text || "";
                  assistantMessageId = data.id;

                  // Capture attachments (images, etc.)
                  if (data.content?.attachments?.length) {
                    messageAttachments = data.content.attachments.map(
                      (att: {
                        id?: string;
                        url: string;
                        title?: string;
                        contentType?: string;
                      }) => ({
                        id: att.id || `att-${Date.now()}`,
                        url: att.url,
                        title: att.title,
                        contentType: att.contentType,
                      }),
                    );
                  }

                  // Check for SAVE_CHANGES action
                  if (
                    data.content?.actions &&
                    Array.isArray(data.content.actions)
                  ) {
                    if (data.content.actions.includes("SAVE_CHANGES")) {
                      detectedApplyAction = true;
                    }
                  }

                  // Check for CREATE_CHARACTER metadata
                  if (
                    data.content?.metadata?.action === "CREATE_CHARACTER" &&
                    data.content?.metadata?.characterCreated
                  ) {
                    detectedCharacterCreated = true;
                    createdCharacterId =
                      data.content.metadata.characterId || null;
                  }

                  // Check for SUGGEST_CHANGES with partial field updates
                  if (
                    data.content?.metadata?.action === "SUGGEST_CHANGES" &&
                    data.content?.metadata?.changes
                  ) {
                    proposedCharacterUpdate = data.content.metadata.changes;
                  }

                  // Check for GENERATE_AVATAR with avatar URL
                  if (
                    data.content?.metadata?.action === "GENERATE_AVATAR" &&
                    data.content?.metadata?.changes?.avatarUrl
                  ) {
                    proposedCharacterUpdate = data.content.metadata.changes;
                    // Track if avatar was auto-saved
                    if (data.content?.metadata?.avatarSaved) {
                      (
                        proposedCharacterUpdate as Record<string, unknown>
                      ).__avatarSaved = true;
                    }
                  }
                }
              } catch {
                // Silently ignore parse errors during streaming
              }
            }

            // Handle done event
            if (eventType === "done") {
              if (assistantMessage || messageAttachments.length > 0) {
                const newAssistantMessage: Message = {
                  id: assistantMessageId || `assistant-${Date.now()}`,
                  role: "assistant",
                  content: assistantMessage,
                  timestamp: Date.now(),
                  attachments:
                    messageAttachments.length > 0
                      ? messageAttachments
                      : undefined,
                };
                setMessages((prev) => [...prev, newAssistantMessage]);

                // Apply character updates to editor
                if (proposedCharacterUpdate) {
                  // Check for avatar saved flag and remove it before updating
                  const updateWithMeta = proposedCharacterUpdate as Record<
                    string,
                    unknown
                  >;
                  const avatarWasSaved = updateWithMeta.__avatarSaved;
                  delete updateWithMeta.__avatarSaved;

                  onCharacterUpdate(proposedCharacterUpdate);
                  const isAvatarUpdate = "avatarUrl" in proposedCharacterUpdate;

                  if (isAvatarUpdate) {
                    // Update sidebar/dropdown avatar if saved in build mode (not creator mode)
                    if (avatarWasSaved && !isCreatorMode && character?.id) {
                      updateCharacterAvatar(
                        character.id,
                        updateWithMeta.avatarUrl as string,
                      );
                    }

                    toast.success(
                      avatarWasSaved
                        ? "Avatar generated and saved!"
                        : "Avatar preview updated!",
                      { duration: 4000 },
                    );
                  } else {
                    toast.success("Character preview updated!", {
                      duration: 4000,
                    });
                  }
                }

                // Handle character creation in creator mode - lock the room
                if (
                  isCreatorMode &&
                  detectedCharacterCreated &&
                  createdCharacterId
                ) {
                  const createdName =
                    (proposedCharacterUpdate?.name as string) ||
                    character?.name ||
                    "your agent";

                  // Lock the room and show link to chat with the created agent
                  setLockedRoom({
                    characterId: createdCharacterId,
                    characterName: createdName,
                  });

                  // Notify parent that character was created (clears unsaved changes)
                  onCharacterCreated?.(createdCharacterId, createdName);

                  toast.success(
                    "Character created! You can now chat with your agent.",
                    { duration: 4000 },
                  );
                }

                // Refresh character data after apply action
                if (detectedApplyAction && onCharacterRefresh) {
                  toast.success("Character saved!", { duration: 3000 });
                  await onCharacterRefresh();
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[BuildMode] Error sending message:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send message. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Robust scroll to bottom function
  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (smooth) {
            viewport.scrollTo({
              top: viewport.scrollHeight,
              behavior: "smooth",
            });
          } else {
            viewport.scrollTop = viewport.scrollHeight;
          }
        });
      }
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Additional scroll after a delay to handle late-loading content
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  // Extract and apply character updates in real-time
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.id !== "welcome"
    ) {
      const content = lastMessage.content;

      const jsonMatch = content.match(/```json\n([\s\S]*?)(\n```|$)/);
      if (jsonMatch) {
        const jsonText = jsonMatch[1].trim();

        try {
          const updates = JSON.parse(jsonText);
          onCharacterUpdate(updates);
        } catch {
          try {
            const fieldMatches = jsonText.matchAll(
              /"(\w+)":\s*("(?:[^"\\]|\\.)*"|true|false|null|\d+(?:\.\d+)?|\[[^\]]*\])/g,
            );
            const partialUpdates: Record<string, unknown> = {};

            for (const match of fieldMatches) {
              const [, key, value] = match;
              try {
                const parsedValue = JSON.parse(value);
                if (parsedValue !== null && parsedValue !== undefined) {
                  partialUpdates[key] = parsedValue;
                }
              } catch {
                // Skip invalid values
              }
            }

            if (Object.keys(partialUpdates).length > 0) {
              onCharacterUpdate(partialUpdates);
            }
          } catch {
            // Silently ignore parsing errors during streaming
          }
        }
      }
    }
    // Note: If onCharacterUpdate causes too many re-runs, wrap it in useCallback in the parent
  }, [messages, onCharacterUpdate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText;
    setInputText("");
    await sendElizaMessage(userMessage);
  };

  // Pre-prompts for quick start - different for creator vs build mode
  const quickPrompts = isCreatorMode
    ? [
        {
          label: "Build a companion",
          prompt: "Help me build a companion with personality",
        },
        {
          label: "Build an assistant",
          prompt: "Help me create a personal AI assistant",
        },
        {
          label: "I have an idea",
          prompt: "I have an idea for an agent, let me tell you about it",
        },
        {
          label: "What can I build?",
          prompt: "What types of agents can I create here?",
        },
      ]
    : [
        {
          label: "Make it funnier",
          prompt: "Make my character's personality more witty and humorous",
        },
        {
          label: "Improve the bio",
          prompt: "Help me write a better bio for this character",
        },
        {
          label: "Add knowledge",
          prompt: "How can I add knowledge to this character?",
        },
        {
          label: "Test a response",
          prompt: "Show me how this character would respond to a greeting",
        },
      ];

  const handleQuickPrompt = async (prompt: string) => {
    if (isLoading) return;
    await sendElizaMessage(prompt);
  };

  // Show empty state with quick prompts when no messages
  const showEmptyState = messages.length === 0 && !isLoading && !isInitializing;

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedMessageId(messageId);
    toast.success("Message copied to clipboard");
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-[#0A0A0A]">
      {/* Messages Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full py-6 px-2" ref={scrollAreaRef}>
          <div className="space-y-6 max-w-3xl mx-auto px-4 sm:px-6">
            {/* Empty State with Quick Prompts */}
            {showEmptyState && (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] animate-in fade-in duration-500">
                <div className="flex flex-col items-center gap-6 max-w-md text-center">
                  <ElizaAvatar
                    avatarUrl={displayAvatar}
                    name={displayName}
                    className="w-16 h-16"
                    iconClassName="h-8 w-8"
                    fallbackClassName="bg-[#FF5800]"
                  />
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-white">
                      {isCreatorMode
                        ? "Create your agent"
                        : `Edit ${character?.name || "character"}`}
                    </h2>
                    <p className="text-sm text-white/50">
                      {isCreatorMode
                        ? "I'll help you build a companion, assistant, or both."
                        : "Chat with me to refine personality, knowledge, or capabilities."}
                    </p>
                  </div>

                  {/* Quick Prompts Grid */}
                  <div className="grid grid-cols-2 gap-2 w-full mt-2">
                    {quickPrompts.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleQuickPrompt(item.prompt)}
                        className="px-4 py-3 text-left text-sm text-white/80 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] hover:border-white/[0.12] transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message, index) => {
              const content = message.content;
              const isAgent = message.role === "assistant";

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isAgent ? "justify-start" : "justify-end"
                  } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {isAgent ? (
                    <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%] group/message">
                      {/* Agent Name Row with Avatar */}
                      <div className="flex items-center gap-2 pl-1">
                        <ElizaAvatar
                          avatarUrl={displayAvatar}
                          name={displayName}
                          className="flex-shrink-0 w-5 h-5"
                          iconClassName="h-3 w-3"
                          fallbackClassName="bg-[#FF5800]"
                        />
                        <span className="text-xs font-medium text-white/50">
                          {displayName}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {/* Message Attachments (Images) */}
                        {message.attachments &&
                          message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {message.attachments.map((attachment) => (
                                <div
                                  key={attachment.id}
                                  className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-white/[0.02]"
                                >
                                  <img
                                    src={attachment.url}
                                    alt={attachment.title || "Generated image"}
                                    className="max-w-[280px] max-h-[280px] object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        {/* Message Text */}
                        {content && (
                          <div className="py-3 px-4 bg-white/[0.03] border border-white/[0.06] rounded-lg transition-colors hover:bg-white/[0.05] hover:border-white/[0.08] overflow-hidden">
                            <style jsx>{`
                              .build-mode-content :global(pre) {
                                background: rgba(0, 0, 0, 0.4) !important;
                                padding: 12px !important;
                                border-radius: 8px !important;
                                overflow-x: auto !important;
                                margin: 8px 0 !important;
                              }
                              .build-mode-content
                                :global(pre)::-webkit-scrollbar {
                                height: 8px;
                              }
                              .build-mode-content
                                :global(pre)::-webkit-scrollbar-track {
                                background: rgba(0, 0, 0, 0.2);
                              }
                              .build-mode-content
                                :global(pre)::-webkit-scrollbar-thumb {
                                background: rgba(255, 88, 0, 0.4);
                                border-radius: 4px;
                              }
                              .build-mode-content
                                :global(pre)::-webkit-scrollbar-thumb:hover {
                                background: rgba(255, 88, 0, 0.6);
                              }
                              .build-mode-content :global(pre code) {
                                font-family:
                                  "Monaco", "Menlo", "Ubuntu Mono", "Consolas",
                                  monospace !important;
                                font-size: 13px !important;
                                white-space: pre-wrap !important;
                                word-break: break-word !important;
                              }
                              .build-mode-content :global(code) {
                                font-family:
                                  "Monaco", "Menlo", "Ubuntu Mono", "Consolas",
                                  monospace !important;
                                font-size: 13px !important;
                              }
                              /* JSON property keys */
                              .build-mode-content :global(.token.property),
                              .build-mode-content :global(.token.key) {
                                color: #fe9f6d !important;
                              }
                              /* JSON punctuation (brackets, braces, commas, colons) */
                              .build-mode-content :global(.token.punctuation) {
                                color: #e434bb !important;
                              }
                              /* JSON string values */
                              .build-mode-content :global(.token.string) {
                                color: #d4d4d4 !important;
                              }
                              /* JSON numbers */
                              .build-mode-content :global(.token.number) {
                                color: #d4d4d4 !important;
                              }
                              /* JSON booleans and null */
                              .build-mode-content :global(.token.boolean),
                              .build-mode-content :global(.token.null) {
                                color: #d4d4d4 !important;
                              }
                              /* Remove prose margins for tighter spacing */
                              .build-mode-content :global(p) {
                                margin: 0 !important;
                                word-break: break-word !important;
                              }
                              .build-mode-content :global(p + p) {
                                margin-top: 8px !important;
                              }
                              .build-mode-content :global(ul),
                              .build-mode-content :global(ol) {
                                margin: 8px 0 !important;
                                padding-left: 20px !important;
                              }
                              .build-mode-content :global(li) {
                                margin: 2px 0 !important;
                              }
                              .build-mode-content :global(h1),
                              .build-mode-content :global(h2),
                              .build-mode-content :global(h3),
                              .build-mode-content :global(h4) {
                                margin: 12px 0 4px 0 !important;
                                font-weight: 600 !important;
                              }
                              .build-mode-content :global(h1) {
                                font-size: 18px !important;
                              }
                              .build-mode-content :global(h2) {
                                font-size: 16px !important;
                              }
                              .build-mode-content :global(h3),
                              .build-mode-content :global(h4) {
                                font-size: 14px !important;
                              }
                            `}</style>
                            <div className="text-[15px] leading-relaxed text-white/90 build-mode-content break-words">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                                components={{
                                  code: ({ className, children, ...props }) => {
                                    const isInline = !className;
                                    return isInline ? (
                                      <code
                                        className="bg-white/10 px-1.5 py-0.5 rounded text-xs break-all"
                                        {...props}
                                      >
                                        {children}
                                      </code>
                                    ) : (
                                      <code className={className} {...props}>
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre: ({ children }) => (
                                    <pre className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto my-2">
                                      {children}
                                    </pre>
                                  ),
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#FF5800] hover:text-[#FF5800]/80 underline break-all"
                                    >
                                      {children}
                                    </a>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="list-disc list-inside my-2">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal list-inside my-2">
                                      {children}
                                    </ol>
                                  ),
                                  p: ({ children }) => (
                                    <p className="my-2 first:mt-0 last:mb-0">
                                      {children}
                                    </p>
                                  ),
                                }}
                              >
                                {content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {/* Time and Actions */}
                        <div className="flex items-center gap-2 pl-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                          <span className="text-xs text-white/40">
                            {formatTimestamp(message.timestamp)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                            onClick={() => copyToClipboard(content, message.id)}
                            title="Copy message"
                          >
                            {copiedMessageId === message.id ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%] group/message">
                      {/* User Message */}
                      <div className="py-3 px-4 bg-[#FF5800]/10 border border-[#FF5800]/20 rounded-lg transition-colors hover:bg-[#FF5800]/15 hover:border-[#FF5800]/30">
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/95">
                          {content}
                        </div>
                      </div>
                      {/* Time and Actions */}
                      <div className="flex items-center gap-2 justify-end pr-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                        <span className="text-xs text-white/40">
                          {formatTimestamp(message.timestamp)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                          onClick={() => copyToClipboard(content, message.id)}
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%]">
                  <div className="flex items-center gap-2 pl-1">
                    <ElizaAvatar
                      avatarUrl={displayAvatar}
                      name={displayName}
                      className="flex-shrink-0 w-5 h-5"
                      iconClassName="h-3 w-3"
                      fallbackClassName="bg-[#FF5800]"
                      animate={true}
                    />
                    <span className="text-xs font-medium text-white/50">
                      {displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 py-3 px-4 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                    <span className="text-sm text-white/40">thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Locked Room Banner - Shows when character was created */}
      {lockedRoom && (
        <div className="border-t border-white/[0.06] p-4">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/[0.08] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20">
                  <Lock className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    Build session complete
                  </p>
                  <p className="text-xs text-white/50">
                    {lockedRoom.characterName} has been created successfully
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard/chat?characterId=${lockedRoom.characterId}`}
                className="flex items-center gap-2 px-4 py-2 bg-[#FF5800] hover:bg-[#FF5800]/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Chat with {lockedRoom.characterName}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Input Area - Hidden when room is locked */}
      {!lockedRoom && (
        <form
          onSubmit={handleSubmit}
          className="border-t border-white/[0.06] p-4"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="space-y-3">
              {/* Input Container */}
              <div className="relative rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-colors focus-within:border-white/[0.15] focus-within:bg-white/[0.03]">
                {/* Robot Eye Visor Scanner - Only show when loading */}
                {isLoading && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                    <div
                      className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                      style={{
                        animation:
                          "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                        boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                        filter: "blur(0.5px)",
                      }}
                    />
                    <div
                      className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
                      style={{
                        animation:
                          "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
                        boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.5)",
                        filter: "blur(1px)",
                      }}
                    />
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!isLoading) {
                        handleSubmit(e);
                      }
                    }
                  }}
                  onInput={(e) => {
                    const target = e.currentTarget;
                    target.style.height = "44px";
                    target.style.height =
                      Math.min(target.scrollHeight, 140) + "px";
                  }}
                  placeholder="Describe your character or ask for help..."
                  className="w-full bg-transparent px-4 py-3 text-[15px] text-white placeholder:text-white/40 focus:outline-none resize-none leading-relaxed"
                  style={{
                    minHeight: "44px",
                    maxHeight: "140px",
                  }}
                />
              </div>

              {/* Bottom Row: Model Selector (left) and Send Button (right) */}
              <div className="flex items-center justify-between">
                {/* Model Tier Selector */}
                <Select
                  value={selectedTier}
                  onValueChange={(value) => {
                    setSelectedTier(value as "fast" | "pro" | "ultra");
                    const tier = buildModeTiers.find((t) => t.id === value);
                    if (tier) {
                      toast.success(`Model: ${tier.name}`);
                    }
                  }}
                >
                  <SelectTrigger className="w-[120px] h-9 border-white/[0.08] bg-white/[0.02] rounded-lg text-sm hover:bg-white/[0.05] transition-colors">
                    <SelectValue placeholder="Select model">
                      <span className="flex items-center gap-2">
                        {tierIcons[selectedTier]}
                        {buildModeTiers.find((t) => t.id === selectedTier)
                          ?.name || "Pro"}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border-white/[0.08]">
                    {buildModeTiers.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id}>
                        <div className="flex items-center gap-2">
                          {tierIcons[tier.id]}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{tier.name}</span>
                              {tier.recommended && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-[#FF5800]/20 text-[#FF5800]">
                                  recommended
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-white/40 font-mono">
                              {tier.modelId}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Send Button */}
                <Button
                  type="submit"
                  disabled={isLoading || !inputText.trim()}
                  size="icon"
                  className="h-9 w-9 rounded-lg bg-[#FF5800]/20 border border-[#FF5800]/30 hover:bg-[#FF5800]/30 disabled:opacity-40 transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                  ) : (
                    <Send className="h-4 w-4 text-[#FF5800]" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
