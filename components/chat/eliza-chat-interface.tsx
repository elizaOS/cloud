"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Send,
  Mic,
  Square,
  Volume2,
  Plus,
  Copy,
  Check,
  Zap,
  Sparkles,
  Crown,
} from "lucide-react";
import { ElizaAvatar } from "./eliza-avatar";
import { KnowledgeDrawer } from "./knowledge-drawer";
import { useAudioRecorder } from "./hooks/use-audio-recorder";
import { useAudioPlayer } from "./hooks/use-audio-player";
import { useModelTier } from "./hooks/use-model-tier";
import { sendStreamingMessage } from "@/hooks/use-streaming-message";
import type { StreamingMessage } from "@/hooks/use-streaming-message";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ensureAudioFormat } from "@/lib/utils/audio";
import { useChatStore } from "@/stores/chat-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRenderTracker } from "@/lib/debug/render-tracker";
import { usePrivy } from "@privy-io/react-auth";

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
    attachments?: Array<{
      id: string;
      url: string;
      title?: string;
      contentType: string;
    }>;
  };
  isAgent: boolean;
  createdAt: number;
}

interface AgentInfo {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

interface CharacterData {
  id: string;
  name: string;
  character_data?: {
    bio?: string | string[];
    personality?: string;
    description?: string;
  };
}

interface ElizaChatInterfaceProps {
  onMessageSent?: () => void | Promise<void>;
  character?: CharacterData;
}

interface CustomVoice {
  id: string;
  elevenlabsVoiceId: string;
  name: string;
  cloneType: string;
}

const tierIcons: Record<string, React.ReactNode> = {
  fast: <Zap className="h-3.5 w-3.5" />,
  pro: <Sparkles className="h-3.5 w-3.5" />,
  ultra: <Crown className="h-3.5 w-3.5" />,
};

export function ElizaChatInterface({
  onMessageSent,
  character,
}: ElizaChatInterfaceProps) {
  // Track renders in development
  useRenderTracker("ElizaChatInterface");

  // Use chat store for room and character management
  const {
    roomId,
    loadRooms,
    createRoom: createRoomInStore,
    selectedCharacterId,
    availableCharacters,
    pendingMessage,
    setPendingMessage,
    anonymousSessionToken,
  } = useChatStore();

  // Check authentication status for features that require it
  const { authenticated } = usePrivy();

  const [messages, setMessages] = useState<Message[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [inputText, setInputText] = useState("");
  const isPendingMessageProcessingRef = useRef(false);
  const pendingMessageToSendRef = useRef<string | null>(null);
  const isCreatingRoomRef = useRef(false);

  // Get character name from prop (preferred), store, or agentInfo
  const selectedCharacter = availableCharacters.find(
    (char) => char.id === selectedCharacterId,
  );
  const characterName =
    character?.name || selectedCharacter?.name || agentInfo?.name || "Agent";

  // Consolidated loading states
  const [loadingState, setLoadingState] = useState({
    isSending: false,
    isInitializing: false,
    isLoadingMessages: false,
    isProcessingSTT: false,
  });

  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const messageAudioUrls = useRef<Map<string, string>>(new Map());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Clear audio cache when voice changes (so messages regenerate with new voice)
  useEffect(() => {
    if (messageAudioUrls.current.size > 0) {
      messageAudioUrls.current.clear();
    }
  }, [audioState.selectedVoiceId]);

  const recorder = useAudioRecorder();
  const player = useAudioPlayer();

  const {
    selectedTier,
    selectedModelId,
    tiers,
    setTier,
    isLoading: isLoadingModels,
  } = useModelTier();

  const loadMessages = useCallback(async (targetRoomId: string) => {
    setLoadingState((prev) => ({ ...prev, isLoadingMessages: true }));
    try {
      const response = await fetch(`/api/eliza/rooms/${targetRoomId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        if (data.agent) {
          setAgentInfo(data.agent);
        }
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setLoadingState((prev) => ({ ...prev, isLoadingMessages: false }));
    }
  }, []);

  // Load messages when roomId from context changes
  useEffect(() => {
    if (roomId) {
      loadMessages(roomId);
    } else {
      // Room was deleted or cleared - reset to empty state
      setMessages([]);
      setAgentInfo(null);
      setError(null);
      setLoadingState((prev) => ({ ...prev, isLoadingMessages: false }));
    }
  }, [roomId, loadMessages]);

  const createRoom = useCallback(
    async (characterId?: string | null) => {
      const charIdToUse =
        characterId !== undefined ? characterId : selectedCharacterId;
      setLoadingState((prev) => ({ ...prev, isInitializing: true }));
      setError(null);
      try {
        // Use store's createRoom which handles the API call
        const newRoomId = await createRoomInStore(charIdToUse);

        if (!newRoomId) {
          throw new Error("Failed to create room");
        }

        // Load initial messages for the new room
        await loadMessages(newRoomId);

        return newRoomId;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create room");
        console.error("[ElizaChat] Error creating room:", err);
        throw err; // Re-throw so caller can handle
      } finally {
        setLoadingState((prev) => ({ ...prev, isInitializing: false }));
      }
    },
    [createRoomInStore, loadMessages, selectedCharacterId],
  );

  // Handle pending message from landing page
  useEffect(() => {
    // Guard: Only process if we have a pending message and not already processing
    if (
      !pendingMessage ||
      isPendingMessageProcessingRef.current ||
      loadingState.isSending ||
      loadingState.isInitializing
    ) {
      return;
    }

    // If no roomId exists, create one first
    if (!roomId) {
      console.log(
        "[ElizaChat] Pending message found but no room - creating room first",
      );
      isPendingMessageProcessingRef.current = true;

      // Store the message in ref so we can send it after room is created
      pendingMessageToSendRef.current = pendingMessage;

      // Clear from Zustand immediately to prevent re-triggering
      setPendingMessage(null);

      createRoom()
        .then(() => {
          // Room creation will update roomId, which will trigger sending logic
          console.log("[ElizaChat] Room created for pending message");
        })
        .catch((err) => {
          console.error(
            "[ElizaChat] Failed to create room for pending message:",
            err,
          );
          isPendingMessageProcessingRef.current = false;
          pendingMessageToSendRef.current = null;
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
      console.log("[ElizaChat] Auto-sending pending message:", messageToSend);

      // Clear the ref
      pendingMessageToSendRef.current = null;

      // Auto-send after a short delay (wait for room to be fully ready)
      setTimeout(() => {
        setInputText(messageToSend);
        setTimeout(() => {
          sendMessage(messageToSend).finally(() => {
            // Reset processing flag after message is sent
            isPendingMessageProcessingRef.current = false;
          });
        }, 100);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roomId,
    loadingState.isSending,
    loadingState.isInitializing,
    pendingMessage,
    loadingState.isLoadingMessages,
  ]);

  const generateSpeech = useCallback(
    async (text: string, messageId: string) => {
      try {
        const currentVoiceId = audioState.selectedVoiceId;
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

        if (audioState.autoPlayTTS) {
          setAudioState((prev) => ({ ...prev, currentPlayingId: messageId }));
          await player.playAudio(audioUrl);
        }

        return audioUrl;
      } catch (error) {
        console.error("TTS error:", error);
        toast.error("Failed to generate speech");
      }
    },
    [audioState.autoPlayTTS, audioState.selectedVoiceId, player],
  );

  // Load custom voices on mount (only for authenticated users)
  useEffect(() => {
    // Only fetch custom voices for authenticated users
    // This API requires authentication and will return 401 for anonymous users
    if (!authenticated) {
      return;
    }

    const fetchCustomVoices = async () => {
      try {
        const response = await fetch("/api/elevenlabs/voices/user");
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.voices)) {
            setAudioState((prev) => ({ ...prev, customVoices: data.voices }));
          }
        }
        // Silently ignore 401 errors - user may not have voice features
      } catch (error) {
        console.error("Failed to load custom voices:", error);
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

  // Process audio blob when it becomes available after recording stops
  useEffect(() => {
    const processAudioBlob = async () => {
      // Guard: Don't process if no audio blob or already processing
      if (!recorder.audioBlob || loadingState.isProcessingSTT) return;

      setLoadingState((prev) => ({ ...prev, isProcessingSTT: true }));

      try {
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
          throw new Error(error.error || "Failed to transcribe audio");
        }

        const { transcript } = await response.json();

        if (!transcript || transcript.trim().length === 0) {
          toast.error("No speech detected. Please try again.");
          console.warn("[ElizaChat STT] Empty transcript received");
          return;
        }

        // Auto-send the transcribed message (will create room if needed)
        await sendMessage(transcript);
      } catch (error) {
        console.error("[ElizaChat STT] Error:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to transcribe audio",
        );
      } finally {
        // Cleanup: Clear recording and reset processing state
        recorder.clearRecording();
        setLoadingState((prev) => ({ ...prev, isProcessingSTT: false }));
      }
    };

    processAudioBlob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.audioBlob, loadingState.isProcessingSTT, recorder, roomId]);

  // Auto-generate TTS for new agent messages (only if autoPlayTTS is enabled)
  useEffect(() => {
    // Only generate TTS if auto-play is enabled
    if (!audioState.autoPlayTTS) return;

    const newAgentMessages = messages.filter(
      (msg) =>
        msg.isAgent &&
        !msg.id.startsWith("thinking-") &&
        !messageAudioUrls.current.has(msg.id),
    );

    newAgentMessages.forEach((msg) => {
      if (msg.content.text) {
        generateSpeech(msg.content.text, msg.id).catch(console.error);
      }
    });
  }, [messages, generateSpeech, audioState.autoPlayTTS]);

  // Handle streaming messages from the single endpoint
  const handleStreamMessage = useCallback((messageData: StreamingMessage) => {
    setMessages((prev) => {
      // Handle agent response - remove thinking indicator
      if (messageData.type === "agent") {
        const withoutThinking = prev.filter(
          (m) => !m.id.startsWith("thinking-"),
        );

        // Clear thinking timeout
        if (thinkingTimeoutRef.current) {
          clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }

        // Check for duplicates
        if (withoutThinking.some((m) => m.id === messageData.id)) {
          return prev;
        }

        // Remove temp messages
        const filtered = withoutThinking.filter(
          (m) => !m.id.startsWith("temp-"),
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
  }, []);

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

  // Auto-scroll to bottom when messages change (with delayed scroll for late-loading content)
  useEffect(() => {
    scrollToBottom();
    const timer = setTimeout(() => scrollToBottom(), 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  const sendMessage = async (textOverride?: string) => {
    const messageText = textOverride?.trim() || inputText.trim();
    if (!messageText || loadingState.isSending) return;

    if (!textOverride) {
      setInputText("");
    }
    setLoadingState((prev) => ({ ...prev, isSending: true }));
    setError(null);

    try {
      // If no room exists, create one first
      let currentRoomId = roomId;
      if (!currentRoomId) {
        console.log("[ElizaChat] No room selected, creating new room...");
        try {
          // Prevent duplicate room creation attempts
          if (isCreatingRoomRef.current) {
            console.log(
              "[ElizaChat] Room creation already in progress, waiting...",
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
            currentRoomId = roomId; // Use the room that was just created
            if (!currentRoomId) {
              throw new Error("Room creation timed out");
            }
          } else {
            isCreatingRoomRef.current = true;
            try {
              const newRoomId = await createRoom(selectedCharacterId);
              if (!newRoomId) {
                throw new Error("Room creation returned empty ID");
              }
              currentRoomId = newRoomId;
              console.log("[ElizaChat] Created new room:", newRoomId);

              // Wait briefly for room to be fully initialized
              // createRoom already loaded messages, just give it a moment
              await new Promise((resolve) => setTimeout(resolve, 300));
            } finally {
              isCreatingRoomRef.current = false;
            }
          }
        } catch (createError) {
          console.error("[ElizaChat] Failed to create room:", createError);
          isCreatingRoomRef.current = false;
          const errorMsg =
            createError instanceof Error
              ? createError.message
              : "Unable to create conversation. Please try again.";
          setError(errorMsg);
          toast.error(errorMsg);
          return;
        }
      }

      // Add optimistic temp user message
      const clientMessageId = `temp-${Date.now()}`;
      const now = Date.now();
      const tempUserMessage: Message = {
        id: clientMessageId,
        content: { text: messageText },
        isAgent: false,
        createdAt: now,
      };
      setMessages((prev) => [...prev, tempUserMessage]);

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
        model: selectedModelId, // Pass selected model from tier
        sessionToken: anonymousSessionToken || undefined, // Pass session token for anonymous users
        onMessage: handleStreamMessage,
        onError: (errorMsg) => {
          setError(errorMsg);
          toast.error(errorMsg);
          // Remove temp and thinking messages on error
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                msg.id !== tempUserMessage.id &&
                !msg.id.startsWith("thinking-"),
            ),
          );
          if (thinkingTimeoutRef.current) {
            clearTimeout(thinkingTimeoutRef.current);
            thinkingTimeoutRef.current = null;
          }
        },
        onComplete: () => {
          loadRooms();
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
      // Remove temp and thinking messages on error
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            !msg.id.startsWith("temp-") && !msg.id.startsWith("thinking-"),
        ),
      );
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
    } finally {
      setLoadingState((prev) => ({ ...prev, isSending: false }));
    }
  };

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
    attachments?: Array<{
      id: string;
      url: string;
      title?: string;
      contentType: string;
    }>,
  ) => {
    try {
      // Check if there are image attachments
      const imageAttachment = attachments?.find(
        (att) =>
          att.contentType === "IMAGE" ||
          att.contentType === "image" ||
          att.contentType.startsWith("image/"),
      );

      if (imageAttachment) {
        // Copy the actual image to clipboard
        try {
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
        } catch (imageError) {
          console.error(
            "Failed to copy image, falling back to text:",
            imageError,
          );
          toast.error("Failed to copy image, try downloading instead");
          return;
        }
      }

      // Fall back to copying text if no image
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      toast.success("Message copied to clipboard");
      // Reset after 2 seconds
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy message");
    }
  };

  if (loadingState.isInitializing) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center space-y-3">
          <ElizaAvatar
            avatarUrl="https://raw.githubusercontent.com/elizaOS/eliza-avatars/refs/heads/master/Eliza/portrait.png"
            className="w-16 h-16 mx-auto shadow-lg"
            iconClassName="h-8 w-8"
            animate={true}
          />
          <div>
            <p className="text-base font-semibold">Initializing Eliza...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Setting up your conversation space
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 justify-center">
      {/* Main Chat Area - Centered with max width for readability */}
      <div className="flex flex-col flex-1 min-h-0 max-w-3xl w-full px-4 sm:px-6 lg:px-8">
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
                    avatarUrl={agentInfo?.avatarUrl}
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
                    <p className="text-sm text-muted-foreground">
                      Retrieving message history
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
                      avatarUrl={agentInfo?.avatarUrl}
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
                        return `Say hello to ${characterName}!`;
                      })()}
                    </p>
                  </div>
                )}

              {!loadingState.isLoadingMessages &&
                messages.map((message, index) => {
                  const isThinking = message.id.startsWith("thinking-");
                  return (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.isAgent ? "justify-start" : "justify-end"
                      } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {message.isAgent ? (
                        <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%] group/message">
                          {/* Agent Name Row with Avatar */}
                          <div className="flex items-center gap-2 pl-1">
                            <ElizaAvatar
                              avatarUrl={agentInfo?.avatarUrl}
                              name={characterName}
                              className="flex-shrink-0 w-5 h-5"
                              iconClassName="h-3 w-3"
                              animate={isThinking}
                            />
                            <span className="text-xs font-medium text-white/50">
                              {characterName}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {isThinking ? (
                              <div className="flex items-center gap-2 py-3 px-4 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                                <span className="text-sm text-white/40">
                                  thinking...
                                </span>
                              </div>
                            ) : (
                              <>
                                {/* Message Text */}
                                <div className="py-3 px-4 bg-white/[0.03] border border-white/[0.06] rounded-lg transition-colors hover:bg-white/[0.05] hover:border-white/[0.08]">
                                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">
                                    {message.content.text}
                                  </div>
                                </div>

                                {/* Image Attachments */}
                                {message.content.attachments &&
                                  message.content.attachments.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                      {message.content.attachments.map(
                                        (attachment) => {
                                          if (
                                            attachment.contentType ===
                                              "IMAGE" ||
                                            attachment.contentType === "image"
                                          ) {
                                            return (
                                              <div
                                                key={attachment.id}
                                                className="inline-block rounded-lg overflow-hidden border border-white/10 max-w-md"
                                              >
                                                <Image
                                                  src={attachment.url}
                                                  alt={
                                                    attachment.title ||
                                                    "Generated image"
                                                  }
                                                  width={512}
                                                  height={512}
                                                  className="w-full h-auto"
                                                  style={{ display: "block" }}
                                                  onLoad={() =>
                                                    scrollToBottom()
                                                  }
                                                />
                                              </div>
                                            );
                                          }
                                          return null;
                                        },
                                      )}
                                    </div>
                                  )}

                                {/* Time and Actions */}
                                <div className="flex items-center gap-2 pl-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                                  <span className="text-xs text-white/40">
                                    {formatTimestamp(message.createdAt)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                                    onClick={() =>
                                      copyToClipboard(
                                        message.content.text,
                                        message.id,
                                        message.content.attachments,
                                      )
                                    }
                                    title="Copy message"
                                  >
                                    {copiedMessageId === message.id ? (
                                      <Check className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
                                    )}
                                  </Button>
                                  {messageAudioUrls.current.has(message.id) && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                                      onClick={() => {
                                        const url =
                                          messageAudioUrls.current.get(
                                            message.id,
                                          );
                                        if (url) {
                                          if (
                                            audioState.currentPlayingId ===
                                              message.id &&
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
                                              currentPlayingId: message.id,
                                            }));
                                            player.playAudio(url);
                                          }
                                        }
                                      }}
                                    >
                                      {audioState.currentPlayingId ===
                                        message.id && player.isPlaying ? (
                                        <Square className="h-3.5 w-3.5 text-white/50" />
                                      ) : (
                                        <Volume2 className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%] group/message">
                          {/* User Message */}
                          <div className="py-3 px-4 bg-[#FF5800]/10 border border-[#FF5800]/20 rounded-lg transition-colors hover:bg-[#FF5800]/15 hover:border-[#FF5800]/30">
                            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/95">
                              {message.content.text}
                            </div>
                          </div>
                          {/* Time and Actions */}
                          <div className="flex items-center gap-2 justify-end pr-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                            <span className="text-xs text-white/40">
                              {formatTimestamp(message.createdAt)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                              onClick={() =>
                                copyToClipboard(
                                  message.content.text,
                                  message.id,
                                  message.content.attachments,
                                )
                              }
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
            </div>
          </ScrollArea>
        </div>

        {/* Enhanced Input Area - Redesigned layout */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t border-white/[0.06] p-4"
        >
          <div className="space-y-3">
            {/* Text Input Box - Prominent standalone */}
            <div className="relative rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-colors focus-within:border-white/[0.15] focus-within:bg-white/[0.03]">
              {/* Robot Eye Visor Scanner - Animated line on top edge with randomness - Only show when waiting for agent */}
              {loadingState.isSending && (
                <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                  {/* Primary scanner */}
                  <div
                    className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                    style={{
                      animation:
                        "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                      boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                      filter: "blur(0.5px)",
                    }}
                  />
                  {/* Secondary scanner for organic feel */}
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
              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "44px";
                  target.style.height =
                    Math.min(target.scrollHeight, 140) + "px";
                }}
                placeholder={
                  recorder.isRecording
                    ? "Recording... Click stop when done"
                    : "Type your message..."
                }
                disabled={loadingState.isSending || recorder.isRecording}
                className="w-full bg-transparent px-4 py-3 text-[15px] text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
                style={{
                  minHeight: "44px",
                  maxHeight: "140px",
                }}
              />
            </div>

            {/* Bottom Row: Model Selector (left) and Action Buttons (right) */}
            <div className="flex items-center justify-between">
              {/* Model Tier Selector - Bottom Left */}
              <Select
                value={selectedTier}
                onValueChange={(value) => {
                  setTier(value as "fast" | "pro" | "ultra");
                  const tier = tiers.find((t) => t.id === value);
                  if (tier) {
                    toast.success(`Model: ${tier.name}`);
                  }
                }}
                disabled={isLoadingModels}
              >
                <SelectTrigger className="w-[120px] h-9 border-white/[0.08] bg-white/[0.02] rounded-lg text-sm hover:bg-white/[0.05] transition-colors">
                  <SelectValue placeholder="Select model">
                    <span className="flex items-center gap-2">
                      {tierIcons[selectedTier]}
                      {tiers.find((t) => t.id === selectedTier)?.name || "Pro"}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-lg border-white/[0.08]">
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      <div className="flex items-center gap-2">
                        {tierIcons[tier.id]}
                        <div className="flex flex-col">
                          <span className="font-medium">{tier.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {tier.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Action Buttons - Bottom Right */}
              <div className="flex items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                    >
                      <Plus className="h-4 w-4 text-white/60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-80 rounded-lg border-white/[0.08]"
                    align="end"
                    side="top"
                  >
                    <div className="space-y-4 p-2">
                      <div>
                        <h4 className="font-medium mb-3 text-sm">
                          Voice Settings
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="auto-tts-pop" className="text-sm">
                              Auto-play voice
                            </Label>
                            <Switch
                              id="auto-tts-pop"
                              checked={audioState.autoPlayTTS}
                              onCheckedChange={(checked) =>
                                setAudioState((prev) => ({
                                  ...prev,
                                  autoPlayTTS: checked,
                                }))
                              }
                            />
                          </div>

                          {audioState.customVoices.length > 0 && (
                            <div className="space-y-2">
                              <Label
                                htmlFor="voice-select-pop"
                                className="text-sm"
                              >
                                Voice Selection
                              </Label>
                              <Select
                                value={audioState.selectedVoiceId || "default"}
                                onValueChange={(value) => {
                                  const newVoiceId =
                                    value === "default" ? null : value;
                                  setAudioState((prev) => ({
                                    ...prev,
                                    selectedVoiceId: newVoiceId,
                                  }));

                                  if (typeof window !== "undefined") {
                                    if (newVoiceId) {
                                      localStorage.setItem(
                                        "eliza-selected-voice-id",
                                        newVoiceId,
                                      );
                                    } else {
                                      localStorage.removeItem(
                                        "eliza-selected-voice-id",
                                      );
                                    }
                                  }

                                  const voiceName = newVoiceId
                                    ? audioState.customVoices.find(
                                        (v) =>
                                          v.elevenlabsVoiceId === newVoiceId,
                                      )?.name || "Custom"
                                    : "Default";

                                  toast.success(`Voice: ${voiceName}`);
                                }}
                              >
                                <SelectTrigger
                                  id="voice-select-pop"
                                  className="w-full rounded-none"
                                >
                                  <SelectValue placeholder="Default" />
                                </SelectTrigger>
                                <SelectContent className="rounded-none">
                                  <SelectItem value="default">
                                    Default Voice
                                  </SelectItem>
                                  {audioState.customVoices.map((voice) => (
                                    <SelectItem
                                      key={voice.id}
                                      value={voice.elevenlabsVoiceId}
                                    >
                                      {voice.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <h4 className="font-medium mb-3 text-sm">
                          Knowledge Base
                        </h4>
                        <KnowledgeDrawer characterId={selectedCharacterId} />
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loadingState.isSending}
                  onClick={handleVoiceInput}
                  className="h-9 w-9 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                >
                  {recorder.isRecording ? (
                    <Square className="h-4 w-4 text-red-400" />
                  ) : (
                    <Mic className="h-4 w-4 text-white/60" />
                  )}
                </Button>

                <Button
                  type="submit"
                  disabled={
                    loadingState.isSending ||
                    !inputText.trim() ||
                    recorder.isRecording
                  }
                  size="icon"
                  className="h-9 w-9 rounded-lg bg-[#FF5800]/20 border border-[#FF5800]/30 hover:bg-[#FF5800]/30 disabled:opacity-40 transition-colors"
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
