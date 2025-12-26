/**
 * Eliza chat interface component providing full-featured chat functionality.
 * Supports text and voice messages, streaming responses, knowledge base integration,
 * model tier selection, audio playback, and room management.
 *
 * @param props - Chat interface configuration
 * @param props.onMessageSent - Optional callback when a message is sent
 * @param props.character - Optional character data for the chat session
 */

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useThrottledStreamingUpdate } from "@/lib/hooks/use-throttled-streaming";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Send,
  Mic,
  Square,
  Plus,
  Zap,
  Sparkles,
  Crown,
  Globe,
  Volume2,
  Check,
  FileText,
} from "lucide-react";
import { ElizaAvatar } from "./eliza-avatar";
import { useAudioRecorder } from "./hooks/use-audio-recorder";
import { useAudioPlayer } from "./hooks/use-audio-player";
import { useModelTier } from "./hooks/use-model-tier";
import { sendStreamingMessage } from "@/lib/hooks/use-streaming-message";
import type { StreamingMessage, StreamChunkData } from "@/lib/hooks/use-streaming-message";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ensureAudioFormat } from "@/lib/utils/audio";
import { useChatStore } from "@/lib/stores/chat-store";
import { MemoizedChatMessage } from "./memoized-chat-message";
import "highlight.js/styles/github-dark.css";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ADDITIONAL_MODELS } from "@/lib/models";
import { usePrivy } from "@privy-io/react-auth";
import { useKnowledgeProcessingStatus } from "@/components/chat/hooks/use-knowledge-processing-status";
import { ContentType, type Media } from "@elizaos/core";

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
    attachments?: Media[];
  };
  isAgent: boolean;
  createdAt: number;
}

/**
 * Display version of AgentInfo with UI-specific fields.
 * Used for chat interface display (simplified from full AgentInfo).
 */
interface AgentInfoDisplay {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

interface CharacterData {
  id: string;
  name: string;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  character_data?: {
    bio?: string | string[];
    personality?: string;
    description?: string;
    avatarUrl?: string | null;
    avatar_url?: string | null;
  };
}

interface ElizaChatInterfaceProps { 
  onMessageSent?: () => void | Promise<void>;
  character?: CharacterData;
  expectedCharacterId?: string; // Used to validate room belongs to expected character during navigation
}

import type { Voice as CustomVoice } from "@/components/voices/types";

const tierIcons: Record<string, React.ReactNode> = {
  fast: <Zap className="h-3.5 w-3.5" />,
  pro: <Sparkles className="h-3.5 w-3.5" />,
  ultra: <Crown className="h-3.5 w-3.5" />,
};

export function ElizaChatInterface({
  onMessageSent,
  character,
  expectedCharacterId,
}: ElizaChatInterfaceProps) {
  // Use chat store for room and character management
  const {
    roomId,
    loadRooms,
    createRoom: createRoomInStore,
    selectedCharacterId,
    availableCharacters,
    setAvailableCharacters,
    pendingMessage,
    setPendingMessage,
    anonymousSessionToken,
  } = useChatStore();

  // Check authentication status for features that require it
  const { authenticated } = usePrivy();

  const [messages, setMessages] = useState<Message[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfoDisplay | null>(null);
  const [inputText, setInputText] = useState("");
  const inputTextRef = useRef(inputText);
  const isPendingMessageProcessingRef = useRef(false);
  const pendingMessageToSendRef = useRef<string | null>(null);
  const isCreatingRoomRef = useRef(false);
  // Promise-based room creation tracking to avoid race conditions
  const roomCreationPromiseRef = useRef<Promise<string | null> | null>(null);
  // Ref to hold sendMessage function - avoids TDZ error when used in effects before definition
  const sendMessageRef = useRef<
    ((textOverride?: string) => Promise<void>) | null
  >(null);
  // Track newly created rooms to skip unnecessary loading (prevents flicker)
  const justCreatedRoomIdRef = useRef<string | null>(null);
  // Track if we're in the middle of sending to prevent loading state flicker
  const isSendingRef = useRef(false);

  // Get character name from prop (preferred), store, or agentInfo (memoized)
  const selectedCharacter = useMemo(
    () => availableCharacters.find((char) => char.id === selectedCharacterId),
    [availableCharacters, selectedCharacterId],
  );
  const characterName = useMemo(
    () =>
      character?.name || selectedCharacter?.name || agentInfo?.name || "Agent",
    [character?.name, selectedCharacter?.name, agentInfo?.name],
  );

  // Fetch shared character data if not available in store (for shared links)
  // This is a client-side fallback in case server-side fetch wasn't performed
  const fetchedCharacterRef = useRef<string | null>(null);
  useEffect(() => {
    const targetId = expectedCharacterId || selectedCharacterId;
    
    // Skip if no character ID or already fetched or character is in store
    if (!targetId || fetchedCharacterRef.current === targetId) return;
    if (availableCharacters.some((c) => c.id === targetId)) return;

    // Track this fetch to prevent race conditions
    const currentTargetId = targetId;
    fetchedCharacterRef.current = targetId;
    
    const controller = new AbortController();

    // Fetch character data from public API
    fetch(`/api/characters/${targetId}/public`, { signal: controller.signal })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch character");
      })
      .then((data) => {
        // Check if this is still the current target (prevents race condition)
        if (fetchedCharacterRef.current !== currentTargetId) return;
        
        if (data.success && data.data) {
          const charData = data.data;
          // Add to available characters in store
          setAvailableCharacters([
            ...availableCharacters,
            {
              id: charData.id,
              name: charData.name,
              username: charData.username || undefined,
              avatarUrl: charData.avatarUrl || undefined,
            },
          ]);
        }
      })
      .catch((err) => {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn("[ElizaChat] Could not fetch shared character:", err);
      });

    return () => {
      controller.abort();
    };
  }, [expectedCharacterId, selectedCharacterId, availableCharacters, setAvailableCharacters]);

  // Get avatar URL from prop (preferred), store, or agentInfo
  // Check both top-level and nested character_data properties
  const characterAvatarUrl = useMemo(
    () =>
      character?.avatarUrl ||
      character?.avatar_url ||
      character?.character_data?.avatarUrl ||
      character?.character_data?.avatar_url ||
      selectedCharacter?.avatarUrl ||
      agentInfo?.avatarUrl,
    [
      character?.avatarUrl,
      character?.avatar_url,
      character?.character_data?.avatarUrl,
      character?.character_data?.avatar_url,
      selectedCharacter?.avatarUrl,
      agentInfo?.avatarUrl,
    ],
  );

  // Consolidated loading states
  const [loadingState, setLoadingState] = useState({
    isSending: false,
    isLoadingMessages: false,
    isProcessingSTT: false,
  });

  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Throttled streaming updates (reduces re-renders from ~100/sec to ~60/sec)
  const {
    accumulateChunk,
    clearAll: clearAllStreaming,
    scheduleUpdate,
  } = useThrottledStreamingUpdate();
  // Track rendered message keys to prevent re-animation
  const renderedMessagesRef = useRef<Set<string>>(new Set());

  const [audioState, setAudioState] = useState<{
    autoPlayTTS: boolean;
    currentPlayingId: string | null;
    selectedVoiceId: string | null;
    customVoices: CustomVoice[];
  }>(() => ({
    autoPlayTTS: false,
    currentPlayingId: null,
    selectedVoiceId:
      typeof window !== "undefined"
        ? localStorage.getItem("eliza-selected-voice-id")
        : null,
    customVoices: [],
  }));

  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  
  // Custom model selection (when user picks from "More models")
  const [customModel, setCustomModel] = useState<{ id: string; name: string; modelId: string } | null>(null);

  const messageAudioUrls = useRef<Map<string, string>>(new Map());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const voicesFetchedRef = useRef(false);

  // Clear audio cache when voice changes (so messages regenerate with new voice)
  useEffect(() => {
    if (messageAudioUrls.current.size > 0) {
      messageAudioUrls.current.clear();
    }
  }, [audioState.selectedVoiceId]);

  // Cleanup refs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
      clearAllStreaming();
      renderedMessagesRef.current.clear();
    };
  }, [clearAllStreaming]);

  const recorder = useAudioRecorder();
  const player = useAudioPlayer();

  const {
    selectedTier,
    selectedModelId,
    tiers,
    setTier,
    isLoading: isLoadingModels,
  } = useModelTier();

  // Poll knowledge processing status and show toast when complete
  useKnowledgeProcessingStatus(selectedCharacterId || null);

  const loadMessages = useCallback(async (targetRoomId: string, skipLoadingState = false) => {
    // Don't show loading state if we're sending (prevents flicker) or explicitly skipped
    if (!skipLoadingState && !isSendingRef.current) {
      setLoadingState((prev) => ({ ...prev, isLoadingMessages: true }));
    }
    try {
      const response = await fetch(`/api/eliza/rooms/${targetRoomId}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        // Only update messages if we're not in the middle of sending
        // This prevents overwriting optimistic messages with stale data
        if (!isSendingRef.current) {
          setMessages(data.messages || []);
        }
        if (data.agent) {
          setAgentInfo(data.agent);
        }
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      if (!skipLoadingState && !isSendingRef.current) {
        setLoadingState((prev) => ({ ...prev, isLoadingMessages: false }));
      }
    }
  }, []); // Stable - no dependencies needed

  // Load messages when roomId from context changes
  useEffect(() => {
    // Use expectedCharacterId (from URL/props) as source of truth, fallback to store's selectedCharacterId
    const targetCharacterId = expectedCharacterId || selectedCharacterId;
    
    if (roomId) {
      // CRITICAL: Validate room belongs to expected character before loading
      // This prevents loading stale room data during navigation race conditions
      const rooms = useChatStore.getState().rooms;
      const room = rooms.find(r => r.id === roomId);
      if (room && room.characterId && targetCharacterId && room.characterId !== targetCharacterId) {
        return; // Skip loading - room belongs to different character
      }
      
      // Skip loading for rooms we just created (they're empty, prevents flicker)
      if (justCreatedRoomIdRef.current === roomId) {
        justCreatedRoomIdRef.current = null; // Clear the flag
        return; // Skip loading - room is empty and we have optimistic messages
      }
      // Skip loading if we're currently sending (prevents flicker)
      if (isSendingRef.current) {
        return;
      }
      loadMessages(roomId);
    } else {
      // Room was deleted or cleared - reset to empty state
      setMessages([]);
      setAgentInfo(null);
      setError(null);
      setLoadingState((prev) => ({ ...prev, isLoadingMessages: false }));
    }
  }, [roomId, selectedCharacterId, expectedCharacterId, loadMessages]);

  const createRoom = useCallback(
    async (characterId?: string | null, skipLoadRooms = false) => {
      const charIdToUse =
        characterId !== undefined ? characterId : selectedCharacterId;
      setError(null);
      // Use store's createRoom which handles the API call
      // Pass skipLoadRooms to prevent unnecessary room list reload during message send
      const newRoomId = await createRoomInStore(charIdToUse, skipLoadRooms);

      if (!newRoomId) {
        throw new Error("Failed to create room");
      }

      // New rooms are empty - skip loading to avoid race with optimistic messages
      return newRoomId;
    },
    [createRoomInStore, selectedCharacterId],
  );

  const handleStreamMessage = useCallback((messageData: StreamingMessage) => {
    setMessages((prev) => {
      // Handle agent response - update streaming message in place to avoid flash
      if (messageData.type === "agent") {
        // Clean up streaming state
        clearAllStreaming();

        // Clear thinking timeout
        if (thinkingTimeoutRef.current) {
          clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }

        // Check for duplicates
        if (prev.some((m) => m.id === messageData.id)) {
          return prev;
        }

        // Find streaming message by prefix
        const streamingIndex = prev.findIndex(
          (m) => m.id === `streaming-${messageData.id}`
        );
        if (streamingIndex !== -1) {
          const updated = [...prev];
          updated[streamingIndex] = {
            ...updated[streamingIndex],
            id: messageData.id,
            content: {
              ...messageData.content,
              text: updated[streamingIndex].content.text || messageData.content.text,
            },
          };
          // Also remove any thinking/temp messages
          return updated.filter(
            (m) => !m.id.startsWith("thinking-") && !m.id.startsWith("temp-"),
          );
        }

        // No streaming message found - fallback to normal add
        const filtered = prev.filter(
          (m) =>
            !m.id.startsWith("thinking-") &&
            !m.id.startsWith("temp-") &&
            !m.id.startsWith("streaming-"),
        );

        return [...filtered, messageData];
      }

      // Handle thinking indicator
      if (messageData.type === "thinking") {
        const withoutThinking = prev.filter(
          (m) => !m.id.startsWith("thinking-"),
        );
        return [...withoutThinking, messageData];
      }

      // Handle user messages
      if (messageData.type === "user") {
        // Replace temp message with real one
        const tempIndex = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.content.text === messageData.content.text,
        );

        if (tempIndex !== -1) {
          const updated = [...prev];
          updated[tempIndex] = messageData;
          return updated;
        }

        // Check for duplicates
        if (prev.some((m) => m.id === messageData.id)) {
          return prev;
        }

        return [...prev, messageData];
      }

      return prev;
    });
  }, [clearAllStreaming]);

  // Handle real-time streaming chunks - updates message text incrementally
  const handleStreamChunk = useCallback((chunkData: StreamChunkData) => {
    const { messageId, chunk } = chunkData;

    // Accumulate text in hook (no re-render)
    accumulateChunk(messageId, chunk);

    // Schedule throttled UI update
    scheduleUpdate(messageId, (newText) => {
      setMessages((prev) => {
        // Check if we already have a streaming message for this messageId
        const streamingMsgIndex = prev.findIndex(
          (m) => m.id === `streaming-${messageId}`
        );

        if (streamingMsgIndex !== -1) {
          // Update existing streaming message
          const updated = [...prev];
          updated[streamingMsgIndex] = {
            ...updated[streamingMsgIndex],
            content: { ...updated[streamingMsgIndex].content, text: newText },
          };
          return updated;
        }

        // First chunk - create a new streaming message and remove thinking indicator
        const withoutThinking = prev.filter(
          (m) => !m.id.startsWith("thinking-")
        );

        // Clear thinking timeout
        if (thinkingTimeoutRef.current) {
          clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }

        // Add new streaming message
        const streamingMessage: Message = {
          id: `streaming-${messageId}`,
          content: { text: newText },
          isAgent: true,
          createdAt: Date.now(),
        };

        return [...withoutThinking, streamingMessage];
      });
    });
  }, [accumulateChunk, scheduleUpdate]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const messageText = textOverride?.trim() || inputTextRef.current.trim();
      if (!messageText || loadingState.isSending) return;

      if (!textOverride) {
        setInputText("");
      }
      // Set both state and ref to track sending status
      setLoadingState((prev) => ({ ...prev, isSending: true }));
      isSendingRef.current = true;
      setError(null);

      // Track if we created a new room (to skip loadRooms later)
      let didCreateNewRoom = false;

      try {
        // If no room exists, create one first
        let currentRoomId = roomId;
        if (!currentRoomId) {
          // If room creation is already in progress, await the existing promise
          if (isCreatingRoomRef.current && roomCreationPromiseRef.current) {
            const existingRoomId = await roomCreationPromiseRef.current;
            if (!existingRoomId) {
              setError("Room creation failed");
              setLoadingState((prev) => ({ ...prev, isSending: false }));
              isSendingRef.current = false;
              return;
            }
            currentRoomId = existingRoomId;
          } else {
            // Start new room creation and store the promise
            // Pass skipLoadRooms=true to prevent unnecessary room list reload
            isCreatingRoomRef.current = true;
            roomCreationPromiseRef.current = createRoom(selectedCharacterId, true)
              .then((newRoomId) => {
                isCreatingRoomRef.current = false;
                roomCreationPromiseRef.current = null;
                return newRoomId;
              })
              .catch((err) => {
                isCreatingRoomRef.current = false;
                roomCreationPromiseRef.current = null;
                console.error("[ElizaChat] Room creation error:", err);
                return null;
              });

            const newRoomId = await roomCreationPromiseRef.current;
            if (!newRoomId) {
              setError("Room creation returned empty ID");
              setLoadingState((prev) => ({ ...prev, isSending: false }));
              isSendingRef.current = false;
              return;
            }
            currentRoomId = newRoomId;
            didCreateNewRoom = true;
            // Mark this room as just created to skip loading in the useEffect
            justCreatedRoomIdRef.current = newRoomId;
          }
        }

        // Add optimistic temp user message
        const clientMessageId = `temp-${crypto.randomUUID()}`;
        const now = Date.now();
        const tempUserMessage: Message = {
          id: clientMessageId,
          content: { text: messageText },
          isAgent: false,
          createdAt: now,
        };
        
        // Add optimistic thinking indicator immediately for instant feedback
        const optimisticThinkingMessage: Message = {
          id: `thinking-${Date.now()}`,
          content: { text: "" },
          isAgent: true,
          createdAt: now + 1, // Slightly after user message to ensure ordering
        };
        
        setMessages((prev) => [...prev, tempUserMessage, optimisticThinkingMessage]);
        // Clear loading state immediately so chat interface shows right away
        setLoadingState((prev) => ({ ...prev, isLoadingMessages: false }));

        // Safety timeout: remove thinking indicator after 30 seconds if no response
        thinkingTimeoutRef.current = setTimeout(() => {
          setMessages((prev) =>
            prev.filter((m) => !m.id.startsWith("thinking-")),
          );
          console.warn(
            "[Chat] Thinking indicator timeout - agent took too long to respond",
          );
        }, 30000);

        // Stream the response using single endpoint
        await sendStreamingMessage({
          roomId: currentRoomId,
          text: messageText,
          model: customModel?.modelId || selectedModelId, // Use custom model if selected, otherwise tier model
          sessionToken: anonymousSessionToken || undefined, // Pass session token for anonymous users
          webSearchEnabled, // Pass web search toggle state
          onMessage: handleStreamMessage,
          onChunk: handleStreamChunk, // Handle real-time streaming chunks
          onError: (errorMsg) => {
            setError(errorMsg);
            toast.error(errorMsg);
            // Remove temp, thinking, and streaming messages on error
            clearAllStreaming();
            setMessages((prev) =>
              prev.filter(
                (msg) =>
                  msg.id !== tempUserMessage.id &&
                  !msg.id.startsWith("thinking-") &&
                  !msg.id.startsWith("streaming-"),
              ),
            );
            if (thinkingTimeoutRef.current) {
              clearTimeout(thinkingTimeoutRef.current);
              thinkingTimeoutRef.current = null;
            }
          },
          onComplete: () => {
            // Always reload rooms to update lastText and lastTime
            // Use longer delay for newly created rooms to ensure server-side processing is complete
            const delay = didCreateNewRoom ? 500 : 100;
            setTimeout(() => {
              loadRooms();
            }, delay);
            // Notify parent that a message was sent successfully (for anonymous message counting)
            if (onMessageSent) {
              onMessageSent();
            }
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        console.error("Error sending message:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to send message",
        );
        // Remove temp, thinking, and streaming messages on error
        clearAllStreaming();
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              !msg.id.startsWith("temp-") &&
              !msg.id.startsWith("thinking-") &&
              !msg.id.startsWith("streaming-"),
          ),
        );
        if (thinkingTimeoutRef.current) {
          clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }
      } finally {
        setLoadingState((prev) => ({ ...prev, isSending: false }));
        isSendingRef.current = false;
      }
    },
    [
      loadingState.isSending,
      roomId,
      createRoom,
      selectedCharacterId,
      selectedModelId,
      customModel,
      anonymousSessionToken,
      webSearchEnabled,
      handleStreamMessage,
      handleStreamChunk,
      loadRooms,
      onMessageSent,
      clearAllStreaming,
    ],
  );

  // Handle pending message from landing page
  useEffect(() => {
    // Guard: Only process if we have a pending message and not already processing
    if (
      !pendingMessage ||
      isPendingMessageProcessingRef.current ||
      loadingState.isSending
    ) {
      return;
    }

    // If no roomId exists, create one first
    if (!roomId) {
      isPendingMessageProcessingRef.current = true;

      // Store the message in ref so we can send it after room is created
      pendingMessageToSendRef.current = pendingMessage;

      // Clear from Zustand immediately to prevent re-triggering
      setPendingMessage(null);

      createRoom()
        .then(() => {
          // Room creation will update roomId, which will trigger sending logic
        })
        .catch(() => {
          isPendingMessageProcessingRef.current = false;
        });
      return;
    }

    // If we have a roomId and a pending message in ref (after room creation), send it
    if (
      roomId &&
      pendingMessageToSendRef.current &&
      !loadingState.isLoadingMessages
    ) {
      const messageToSend = pendingMessageToSendRef.current;

      // Clear the ref
      pendingMessageToSendRef.current = null;

      // Auto-send after a short delay (wait for room to be fully ready)
      setTimeout(() => {
        setInputText(messageToSend);
        setTimeout(() => {
          // Use ref to avoid TDZ - sendMessage is defined later in the component
          sendMessageRef.current?.(messageToSend).finally(() => {
            // Reset processing flag after message is sent
            isPendingMessageProcessingRef.current = false;
          });
        }, 100);
      }, 500);
    }
  }, [
    roomId,
    loadingState.isSending,
    pendingMessage,
    loadingState.isLoadingMessages,
    createRoom,
    setPendingMessage,
  ]);

  // Extract stable values from audioState to prevent callback recreation
  const selectedVoiceIdRef = useRef(audioState.selectedVoiceId);
  const autoPlayTTSRef = useRef(audioState.autoPlayTTS);

  // Keep refs in sync with state
  useEffect(() => {
    selectedVoiceIdRef.current = audioState.selectedVoiceId;
    autoPlayTTSRef.current = audioState.autoPlayTTS;
  }, [audioState.selectedVoiceId, audioState.autoPlayTTS]);

  const generateSpeech = useCallback(
    async (text: string, messageId: string) => {
      try {
        const currentVoiceId = selectedVoiceIdRef.current;
        const requestBody: { text: string; voiceId?: string } = { text };
        if (currentVoiceId) {
          requestBody.voiceId = currentVoiceId;
        }

        const response = await fetch("/api/elevenlabs/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error("Failed to generate speech");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        messageAudioUrls.current.set(messageId, audioUrl);

        if (autoPlayTTSRef.current) {
          setAudioState((prev) => ({ ...prev, currentPlayingId: messageId }));
          await player.playAudio(audioUrl);
        }

        return audioUrl;
      } catch (error) {
        console.error("TTS error:", error);
        toast.error("Failed to generate speech");
        throw error;
      }
    },
    [player], // Only player is needed, audioState values accessed via refs
  );

  // Load custom voices on mount (only for authenticated users)
  useEffect(() => {
    // Only fetch custom voices for authenticated users
    // This API requires authentication and will return 401 for anonymous users
    if (!authenticated) {
      return;
    }

    // Prevent duplicate fetches - only fetch once per component lifecycle
    if (voicesFetchedRef.current) {
      return;
    }
    voicesFetchedRef.current = true;

    const fetchCustomVoices = async () => {
      try {
        const response = await fetch("/api/elevenlabs/voices/user");
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.voices)) {
            setAudioState((prev) => ({ ...prev, customVoices: data.voices }));
          }
        }
      } catch {
        // 401 errors are expected for users without voice features
      }
    };

    fetchCustomVoices();
  }, [authenticated]);

  const handleVoiceInput = useCallback(() => {
    if (recorder.isRecording) {
      recorder.stopRecording();
    } else {
      recorder.startRecording();
      if (recorder.error) {
        toast.error(recorder.error);
      }
    }
  }, [recorder]);

  const handleFileUpload = useCallback(
    async (files: File[]) => {
      if (!selectedCharacterId || files.length === 0) return;

      setIsUploadingFiles(true);

      const formData = new FormData();
      formData.append("characterId", selectedCharacterId);

      for (const file of files) {
        formData.append("files", file, file.name);
      }

      const response = await fetch("/api/v1/knowledge/upload-file", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`${files.length} file(s) uploaded`, {
          description: "Files are now searchable",
        });
      } else {
        const data = await response.json();
        toast.error("Upload failed", {
          description: data.error || "Failed to upload files",
        });
      }

      setIsUploadingFiles(false);
    },
    [selectedCharacterId],
  );

  // Process audio blob when it becomes available after recording stops
  useEffect(() => {
    const processAudioBlob = async () => {
      // Guard: Don't process if no audio blob or already processing
      if (!recorder.audioBlob || loadingState.isProcessingSTT) return;

      setLoadingState((prev) => ({ ...prev, isProcessingSTT: true }));

      // Ensure the blob is in proper audio format (fix Safari/macOS video/webm issue)
      const audioBlob = await ensureAudioFormat(recorder.audioBlob);

      // Create FormData with audio file
      const formData = new FormData();
      const audioFile = new File([audioBlob], "recording.webm", {
        type: audioBlob.type || "audio/webm",
      });
      formData.append("audio", audioFile);

      // Call STT API
      const response = await fetch("/api/elevenlabs/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        recorder.clearRecording();
        setLoadingState((prev) => ({ ...prev, isProcessingSTT: false }));
        throw new Error(error.error || "Failed to transcribe audio");
      }

      const { transcript } = await response.json();

      if (!transcript || transcript.trim().length === 0) {
        recorder.clearRecording();
        setLoadingState((prev) => ({ ...prev, isProcessingSTT: false }));
        toast.error("No speech detected. Please try again.");
        console.warn("[ElizaChat STT] Empty transcript received");
        return;
      }

      // Auto-send the transcribed message (will create room if needed)
      // Use ref to avoid TDZ - sendMessage is defined later in the component
      await sendMessageRef.current?.(transcript);

      // Cleanup: Clear recording and reset processing state
      recorder.clearRecording();
      setLoadingState((prev) => ({ ...prev, isProcessingSTT: false }));
    };

    processAudioBlob();
  }, [recorder.audioBlob, loadingState.isProcessingSTT, recorder]);

  // Auto-generate TTS for new agent messages (only if autoPlayTTS is enabled)
  useEffect(() => {
    // Only generate TTS if auto-play is enabled
    if (!autoPlayTTSRef.current) return;

    const newAgentMessages = messages.filter(
      (msg) =>
        msg.isAgent &&
        !msg.id.startsWith("thinking-") &&
        !messageAudioUrls.current.has(msg.id),
    );

    newAgentMessages.forEach((msg) => {
      if (msg.content.text) {
        void generateSpeech(msg.content.text, msg.id);
      }
    });
  }, [messages, generateSpeech]); // generateSpeech is now stable

  // Handle streaming messages from the single endpoint

  // Robust scroll to bottom function
  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollAreaRef.current) {
      // ScrollArea wraps content in a viewport div with data-radix-scroll-area-viewport
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

  // Keep inputTextRef in sync with inputText
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  // Auto-scroll to bottom when messages change (with delayed scroll for late-loading content)
  useEffect(() => {
    scrollToBottom();
    const timer = setTimeout(() => scrollToBottom(), 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]); // scrollToBottom is stable

  // Keep sendMessageRef in sync - allows effects defined before sendMessage to call it
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

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

  const copyToClipboard = async (
    text: string,
    messageId: string,
    attachments?: Media[],
  ) => {
    // Check if there are image attachments
    const imageAttachment = attachments?.find(
      (att) => att.contentType === ContentType.IMAGE,
    );

    if (imageAttachment) {
      // Copy the actual image to clipboard
      const response = await fetch(imageAttachment.url);
      const blob = await response.blob();

      // Ensure the blob is an image type
      const imageBlob = blob.type.startsWith("image/")
        ? blob
        : new Blob([blob], { type: "image/png" });

      const clipboardItem = new ClipboardItem({
        [imageBlob.type]: imageBlob,
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopiedMessageId(messageId);
      toast.success("Image copied to clipboard");
      setTimeout(() => setCopiedMessageId(null), 2000);
      return;
    }

    // Fall back to copying text if no image
    await navigator.clipboard.writeText(text);
    setCopiedMessageId(messageId);
    toast.success("Message copied to clipboard");
    // Reset after 2 seconds
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  return (
    <div className="flex h-full w-full min-h-0 justify-center">
      {/* Main Chat Area - Centered with max width for readability */}
      <div className="flex flex-col flex-1 min-h-0 max-w-7xl w-full px-4 sm:px-6 lg:px-8">
        {/* Messages Area - No Header */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full py-6 px-2" ref={scrollAreaRef}>
            <div className="space-y-6">
              {error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {loadingState.isLoadingMessages && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-6">
                  <ElizaAvatar
                    avatarUrl={characterAvatarUrl}
                    name={characterName}
                    className="h-16 w-16 mb-4"
                    fallbackClassName="bg-muted"
                    iconClassName="h-8 w-8 text-muted-foreground"
                    animate={true}
                  />
                  <div className="space-y-2">
                    <p className="text-base font-semibold">
                      Loading conversation...
                    </p>
                  </div>
                  {/* Message Skeletons */}
                  <div className="w-full max-w-2xl space-y-4 mt-8">
                    {/* Agent message skeleton */}
                    <div className="flex justify-start animate-pulse">
                      <div className="flex flex-col gap-2 max-w-[70%]">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-white/10" />
                          <div className="h-4 w-20 bg-white/10 rounded" />
                        </div>
                        <div className="h-16 bg-white/5 rounded" />
                      </div>
                    </div>
                    {/* User message skeleton */}
                    <div className="flex justify-end animate-pulse">
                      <div className="flex flex-col gap-2 max-w-[70%]">
                        <div className="h-12 bg-white/10 rounded" />
                      </div>
                    </div>
                    {/* Agent message skeleton */}
                    <div className="flex justify-start animate-pulse">
                      <div className="flex flex-col gap-2 max-w-[70%]">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-white/10" />
                          <div className="h-4 w-20 bg-white/10 rounded" />
                        </div>
                        <div className="h-20 bg-white/5 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!loadingState.isLoadingMessages &&
                messages.length === 0 &&
                !error && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <ElizaAvatar
                      avatarUrl={characterAvatarUrl}
                      name={characterName}
                      className="h-16 w-16 mb-4"
                      fallbackClassName="bg-muted"
                      iconClassName="h-8 w-8 text-muted-foreground"
                    />
                    <h3 className="text-lg font-semibold mb-2">
                      Send the first message to {characterName}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {(() => {
                        // Get character description from character data
                        const charData = character?.character_data;
                        // Check for personality traits first (stored in bio)
                        if (charData?.bio) {
                          const bioArray = Array.isArray(charData.bio)
                            ? charData.bio
                            : [charData.bio];
                          // Look for personality line first, then use first bio line
                          const personalityLine = bioArray.find(
                            (line) =>
                              typeof line === "string" &&
                              line.toLowerCase().includes("personality"),
                          );
                          if (personalityLine) {
                            // Remove "Personality traits: " prefix for cleaner display
                            return personalityLine.replace(
                              /^personality traits?:\s*/i,
                              "",
                            );
                          }
                          return bioArray[0];
                        }
                        if (charData?.personality) {
                          return charData.personality;
                        }
                        if (charData?.description) {
                          return charData.description;
                        }
                        return ``;
                      })()}
                    </p>
                  </div>
                )}

              {!loadingState.isLoadingMessages &&
                messages.map((message, index) => {
                  const isStreaming = message.id.startsWith("streaming-");
                  // Use stable key that doesn't change when streaming message becomes final
                  // This prevents React from remounting the component (avoids flash)
                  const stableKey = isStreaming
                    ? message.id.replace("streaming-", "")
                    : message.id;
                  return (
                    <MemoizedChatMessage
                      key={stableKey}
                      message={message}
                      index={index}
                      characterName={characterName}
                      characterAvatarUrl={characterAvatarUrl}
                      copiedMessageId={copiedMessageId}
                      currentPlayingId={audioState.currentPlayingId}
                      isPlaying={player.isPlaying}
                      hasAudioUrl={messageAudioUrls.current.has(message.id)}
                      isStreaming={isStreaming}
                      formatTimestamp={formatTimestamp}
                      onCopy={copyToClipboard}
                      onPlayAudio={(messageId) => {
                        const url = messageAudioUrls.current.get(messageId);
                        if (url) {
                          if (
                            audioState.currentPlayingId === messageId &&
                            player.isPlaying
                          ) {
                            player.stopAudio();
                            setAudioState((prev) => ({
                              ...prev,
                              currentPlayingId: null,
                            }));
                          } else {
                            setAudioState((prev) => ({
                              ...prev,
                              currentPlayingId: messageId,
                            }));
                            player.playAudio(url);
                          }
                        }
                      }}
                      onImageLoad={scrollToBottom}
                    />
                  );
                })}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area - Buttons inside input like Gemini/ChatGPT */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t border-white/[0.06] p-4"
        >
          <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-colors focus-within:border-white/[0.15] focus-within:bg-white/[0.03]">
            {/* Robot Eye Visor Scanner */}
            {loadingState.isSending && (
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                <div
                  className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                  style={{
                    animation: "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                    filter: "blur(0.5px)",
                  }}
                />
                <div
                  className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
                  style={{
                    animation: "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
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
                  if (!loadingState.isSending && !recorder.isRecording) {
                    sendMessage();
                  }
                }
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "52px";
                target.style.height = Math.min(target.scrollHeight, 200) + "px";
              }}
              placeholder={
                recorder.isRecording
                  ? "Recording... Click stop when done"
                  : "Type your message..."
              }
              disabled={recorder.isRecording}
              className="w-full bg-transparent px-4 pt-3 pb-3 text-[15px] text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
              style={{ minHeight: "52px", maxHeight: "200px" }}
            />

            {/* Bottom bar with buttons inside input */}
            <div className="flex items-center justify-between px-2 py-2">
              {/* Left side - Plus menu and Mic */}
              <div className="flex items-center gap-1.5">
                <input
                  type="file"
                  id="chat-file-upload"
                  multiple
                  accept=".pdf,.txt,.md,.doc,.docx,.json,.xml,.yaml,.yml,.csv"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      handleFileUpload(Array.from(files));
                      e.target.value = "";
                    }
                  }}
                  className="hidden"
                />

                {/* Plus Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg hover:bg-white/[0.06] transition-colors"
                    >
                      <Plus className="h-4 w-4 text-white/60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-56 rounded-xl border-white/[0.08] bg-[#1a1a1a]/95 backdrop-blur-xl p-1"
                    align="start"
                    side="top"
                    sideOffset={8}
                  >
                    <DropdownMenuItem
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
                      disabled={isUploadingFiles || loadingState.isSending}
                      onSelect={() => {
                        document.getElementById("chat-file-upload")?.click();
                      }}
                    >
                      {isUploadingFiles ? (
                        <Loader2 className="h-4 w-4 text-white/50 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 text-white/50" />
                      )}
                      <span className="text-sm">Upload files</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        setWebSearchEnabled(!webSearchEnabled);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Globe className={`h-4 w-4 ${webSearchEnabled ? "text-[#FF5800]" : "text-white/50"}`} />
                        <span className="text-sm">Web search</span>
                      </div>
                      {webSearchEnabled && <Check className="h-4 w-4 text-[#FF5800]" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        setAudioState((prev) => ({ ...prev, autoPlayTTS: !prev.autoPlayTTS }));
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Volume2 className={`h-4 w-4 ${audioState.autoPlayTTS ? "text-[#FF5800]" : "text-white/50"}`} />
                        <span className="text-sm">Auto-play voice</span>
                      </div>
                      {audioState.autoPlayTTS && <Check className="h-4 w-4 text-[#FF5800]" />}
                    </DropdownMenuItem>

                    {audioState.customVoices.length > 0 && (
                      <div className="px-3 py-2">
                        <Select
                          value={audioState.selectedVoiceId || "default"}
                          onValueChange={(value) => {
                            const newVoiceId = value === "default" ? null : value;
                            setAudioState((prev) => ({ ...prev, selectedVoiceId: newVoiceId }));
                            if (typeof window !== "undefined") {
                              if (newVoiceId) {
                                localStorage.setItem("eliza-selected-voice-id", newVoiceId);
                              } else {
                                localStorage.removeItem("eliza-selected-voice-id");
                              }
                            }
                            const voiceName = newVoiceId
                              ? audioState.customVoices.find((v) => v.elevenlabsVoiceId === newVoiceId)?.name || "Custom"
                              : "Default";
                            toast.success(`Voice: ${voiceName}`);
                          }}
                        >
                          <SelectTrigger className="w-full h-8 rounded-lg border-white/[0.08] bg-white/[0.02] text-sm">
                            <SelectValue placeholder="Select voice" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border-white/[0.08]">
                            <SelectItem value="default">Default Voice</SelectItem>
                            {audioState.customVoices.map((voice) => (
                              <SelectItem key={voice.id} value={voice.elevenlabsVoiceId}>
                                {voice.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mic Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loadingState.isSending}
                  onClick={handleVoiceInput}
                  className={`h-8 w-8 rounded-lg transition-colors ${
                    recorder.isRecording ? "bg-red-500/10 hover:bg-red-500/20" : "hover:bg-white/[0.06]"
                  } disabled:opacity-40`}
                >
                  {recorder.isRecording ? (
                    <Square className="h-4 w-4 text-red-400" />
                  ) : (
                    <Mic className="h-4 w-4 text-white/60" />
                  )}
                </Button>
              </div>

              {/* Right side - Model selector and Send */}
              <div className="flex items-center gap-1">
                {/* Model Selector - Claude style */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isLoadingModels}
                      className="h-8 gap-1.5 px-2.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-sm text-white/50">
                        {!customModel && tierIcons[selectedTier]}
                        {customModel ? customModel.name : tiers.find((t) => t.id === selectedTier)?.name || "Pro"}
                      </span>
                      <svg className="h-3.5 w-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-72 rounded-xl border-white/[0.08] bg-[#252525] p-1.5"
                    align="end"
                    side="top"
                    sideOffset={8}
                  >
                    {tiers.map((tier) => (
                      <DropdownMenuItem
                        key={tier.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer"
                        onSelect={() => {
                          setTier(tier.id as "fast" | "pro" | "ultra");
                          setCustomModel(null);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 text-white/50">{tierIcons[tier.id]}</span>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-medium text-white">{tier.name}</span>
                              <span className="text-[11px] text-white/30 font-mono">{tier.modelId.split("/")[1]}</span>
                            </div>
                            <span className="text-[12px] text-white/40">{tier.description}</span>
                          </div>
                        </div>
                        {!customModel && selectedTier === tier.id && <Check className="h-4 w-4 text-[#FF5800]" />}
                      </DropdownMenuItem>
                    ))}

                    {/* More models submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-[14px] text-white/70">
                        More models
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        className="w-64 rounded-xl border-white/[0.08] bg-[#252525] p-1.5 max-h-80 overflow-y-auto"
                        sideOffset={8}
                      >
                        {ADDITIONAL_MODELS.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer"
                            onSelect={() => {
                              setCustomModel({ id: model.id, name: model.name, modelId: model.modelId });
                            }}
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-white">{model.name}</span>
                                <span className="text-[10px] text-white/30 font-mono">{model.modelId.split("/")[1]}</span>
                              </div>
                              <span className="text-[11px] text-white/40">{model.description}</span>
                            </div>
                            {customModel?.id === model.id && <Check className="h-4 w-4 text-[#FF5800]" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Send Button */}
                <Button
                  type="submit"
                  disabled={loadingState.isSending || !inputText.trim() || recorder.isRecording}
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-transparent hover:bg-white/[0.06] disabled:opacity-40 border-0 transition-colors"
                >
                  {loadingState.isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                  ) : (
                    <Send className="h-4 w-4 text-[#FF5800]" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
