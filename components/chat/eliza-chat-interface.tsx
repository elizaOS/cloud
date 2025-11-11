"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Mic, Square, Volume2, Plus } from "lucide-react";
import { ElizaAvatar } from "./eliza-avatar";
import { KnowledgeDrawer } from "./knowledge-drawer";
import { useAudioRecorder } from "./hooks/use-audio-recorder";
import { useAudioPlayer } from "./hooks/use-audio-player";
import { useAvailableModels } from "./hooks/use-available-models";
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

export function ElizaChatInterface() {
  // Use chat store for room and character management
  const {
    roomId,
    entityId,
    loadRooms,
    createRoom: createRoomInStore,
    selectedCharacterId,
    availableCharacters,
  } = useChatStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [inputText, setInputText] = useState("");

  // Get character name from store
  const selectedCharacter = availableCharacters.find(
    (char) => char.id === selectedCharacterId,
  );
  const characterName = selectedCharacter?.name || agentInfo?.name || "Agent";
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isProcessingSTT, setIsProcessingSTT] = useState(false);
  const messageAudioUrls = useRef<Map<string, string>>(new Map());
  const [customVoices, setCustomVoices] = useState<
    Array<{
      id: string;
      elevenlabsVoiceId: string;
      name: string;
      cloneType: string;
    }>
  >([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(() => {
    // Load voice selection from localStorage on mount
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eliza-selected-voice-id");
      console.log("[Voice Init] Loaded from localStorage:", saved);
      return saved;
    }
    return null;
  });

  // Clear audio cache when voice changes (so messages regenerate with new voice)
  useEffect(() => {
    if (messageAudioUrls.current.size > 0) {
      console.log(
        "[Voice Change] Clearing audio cache - messages will regenerate with new voice",
      );
      messageAudioUrls.current.clear();
    }
  }, [selectedVoiceId]);

  const recorder = useAudioRecorder();
  const player = useAudioPlayer();

  // Load available models
  const { models, isLoading: isLoadingModels } = useAvailableModels();

  // Selected model state (persisted in localStorage)
  const [selectedModel, setSelectedModel] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eliza-selected-model");
      return saved || "moonshotai/kimi-k2-0905"; // Default to kimi-k2-0905
    }
    return "moonshotai/kimi-k2-0905";
  });

  // Save selected model to localStorage
  useEffect(() => {
    if (selectedModel && typeof window !== "undefined") {
      localStorage.setItem("eliza-selected-model", selectedModel);
    }
  }, [selectedModel]);

  const loadMessages = useCallback(async (targetRoomId: string) => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/eliza/rooms/${targetRoomId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        if (data.agent) {
          setAgentInfo(data.agent);
        }
        // Note: We don't update selectedCharacterId here anymore
        // Character selection is controlled by the header dropdown
        console.log("[ElizaChat] Loaded messages for room:", targetRoomId);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Load messages when roomId from context changes
  useEffect(() => {
    if (roomId) {
      console.log("[ElizaChat] Room ID changed, loading messages:", roomId);
      loadMessages(roomId);
    } else {
      // Room was deleted or cleared - reset to empty state
      console.log("[ElizaChat] Room cleared, resetting messages");
      setMessages([]);
      setAgentInfo(null);
      setError(null);
      setIsLoadingMessages(false);
    }
  }, [roomId, loadMessages]);

  const createRoom = useCallback(
    async (characterId?: string | null) => {
      const charIdToUse =
        characterId !== undefined ? characterId : selectedCharacterId;
      console.log(
        "[ElizaChat] Creating room with character:",
        charIdToUse || "default",
      );
      setIsInitializing(true);
      setError(null);
      try {
        // Use store's createRoom which handles the API call
        const newRoomId = await createRoomInStore(charIdToUse);

        if (!newRoomId) {
          throw new Error("Failed to create room");
        }

        console.log("[ElizaChat] Room created:", newRoomId);

        // Load initial messages for the new room
        await loadMessages(newRoomId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create room");
        console.error("[ElizaChat] Error creating room:", err);
      } finally {
        setIsInitializing(false);
      }
    },
    [createRoomInStore, loadMessages, selectedCharacterId],
  );

  // Note: Room and character initialization is now handled by URL params
  // via ElizaPageClient, no need to create room automatically here

  // Check for pending message from landing page and auto-send it
  useEffect(() => {
    const pendingMessage = localStorage.getItem("eliza-pending-message");
    if (pendingMessage && roomId && messages.length === 0 && !isLoading) {
      // Clear from localStorage
      localStorage.removeItem("eliza-pending-message");

      // Auto-send after a short delay (wait for room to be fully ready)
      setTimeout(() => {
        setInputText(pendingMessage);
        setTimeout(() => {
          sendMessage(pendingMessage);
        }, 100);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, messages.length, isLoading]);

  const generateSpeech = useCallback(
    async (text: string, messageId: string) => {
      try {
        // Use selectedVoiceId directly (callback will recreate when it changes)
        const currentVoiceId = selectedVoiceId;
        const voiceName = currentVoiceId
          ? customVoices.find((v) => v.elevenlabsVoiceId === currentVoiceId)
              ?.name || "Custom Voice"
          : "Default Voice";

        // Build request body - IMPORTANT: Only add voiceId if we actually have one
        const requestBody: { text: string; voiceId?: string } = { text };
        if (currentVoiceId) {
          requestBody.voiceId = currentVoiceId;
        }

        console.log("[TTS] 🎤 Generating speech:", {
          currentVoiceId: currentVoiceId || "(none - using default)",
          voiceName,
          messageId,
          textLength: text.length,
          requestBody,
          willSendVoiceId: !!requestBody.voiceId,
          timestamp: new Date().toISOString(),
        });

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

        if (autoPlayTTS) {
          setCurrentPlayingId(messageId);
          await player.playAudio(audioUrl);
        }

        return audioUrl;
      } catch (error) {
        console.error("TTS error:", error);
        toast.error("Failed to generate speech");
      }
    },
    [autoPlayTTS, player, selectedVoiceId, customVoices],
  );

  // Load custom voices on mount
  useEffect(() => {
    const fetchCustomVoices = async () => {
      try {
        const response = await fetch("/api/elevenlabs/voices/user");
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.voices)) {
            setCustomVoices(data.voices);
          }
        }
      } catch (error) {
        console.error("Failed to load custom voices:", error);
      }
    };

    fetchCustomVoices();
  }, []);

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
      if (!recorder.audioBlob || isProcessingSTT) return;

      console.log("[ElizaChat STT] Starting transcription...");
      setIsProcessingSTT(true);

      try {
        // Ensure the blob is in proper audio format (fix Safari/macOS video/webm issue)
        const audioBlob = await ensureAudioFormat(recorder.audioBlob);

        console.log("[ElizaChat STT] Audio format:", {
          originalType: recorder.audioBlob.type,
          finalType: audioBlob.type,
          size: audioBlob.size,
        });

        // Create FormData with audio file
        const formData = new FormData();
        const audioFile = new File([audioBlob], "recording.webm", {
          type: audioBlob.type || "audio/webm",
        });
        formData.append("audio", audioFile);

        console.log("[ElizaChat STT] Sending audio to API...", {
          size: audioFile.size,
          type: audioFile.type,
        });

        // Call STT API
        const response = await fetch("/api/elevenlabs/stt", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to transcribe audio");
        }

        // Parse response - API returns { transcript, duration_ms }
        const { transcript, duration_ms } = await response.json();

        console.log("[ElizaChat STT] Transcription received:", {
          transcript,
          duration_ms,
          length: transcript?.length || 0,
        });

        // Validate transcript
        if (!transcript || transcript.trim().length === 0) {
          toast.error("No speech detected. Please try again.");
          console.warn("[ElizaChat STT] Empty transcript received");
          return;
        }

        console.log("[ElizaChat STT] Transcription successful:", transcript);

        // Auto-send the transcribed message directly (like /dashboard/chat does)
        if (roomId) {
          console.log("[ElizaChat STT] Auto-sending transcribed message...");
          await sendMessage(transcript);
        } else {
          console.warn(
            "[ElizaChat STT] No roomId available, skipping auto-send",
          );
        }
      } catch (error) {
        console.error("[ElizaChat STT] Error:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to transcribe audio",
        );
      } finally {
        // Cleanup: Clear recording and reset processing state
        recorder.clearRecording();
        setIsProcessingSTT(false);
        console.log("[ElizaChat STT] Processing complete");
      }
    };

    processAudioBlob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.audioBlob, isProcessingSTT, recorder, roomId]);

  // Auto-generate TTS for new agent messages (only if autoPlayTTS is enabled)
  useEffect(() => {
    // Only generate TTS if auto-play is enabled
    if (!autoPlayTTS) return;

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
  }, [messages, generateSpeech, autoPlayTTS]);

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

        console.log("[Stream] ✅ Received agent response");
        return [...filtered, messageData];
      }

      // Handle thinking indicator
      if (messageData.type === "thinking") {
        const withoutThinking = prev.filter(
          (m) => !m.id.startsWith("thinking-"),
        );
        console.log("[Stream] 🤔 Agent is thinking...");
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      // ScrollArea wraps content in a viewport div with data-radix-scroll-area-viewport
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  const sendMessage = async (textOverride?: string) => {
    const messageText = textOverride?.trim() || inputText.trim();
    if (!messageText || !roomId || isLoading) return;

    if (!textOverride) {
      setInputText("");
    }
    setIsLoading(true);
    setError(null);

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
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("thinking-")));
      console.warn(
        "[Chat] Thinking indicator timeout - agent took too long to respond",
      );
    }, 30000);

    try {
      // Stream the response using single endpoint
      await sendStreamingMessage({
        roomId,
        entityId: entityId,
        text: messageText,
        model: selectedModel || undefined, // Pass selected model
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
          console.log("[Chat] Message streaming completed");
          loadRooms();
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
      // Remove temp and thinking messages on error
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== tempUserMessage.id && !msg.id.startsWith("thinking-"),
        ),
      );
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
    } finally {
      setIsLoading(false);
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

  if (isInitializing) {
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
      {/* Main Chat Area - Centered with max width */}
      <div className="flex flex-col flex-1 min-h-0 max-w-5xl w-full px-6">
        {/* Messages Area - No Header */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {isLoadingMessages && (
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
                    <p className="text-base font-semibold">Loading conversation...</p>
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

              {!isLoadingMessages && messages.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <ElizaAvatar
                    avatarUrl={agentInfo?.avatarUrl}
                    name={agentInfo?.name}
                    className="h-16 w-16 mb-4"
                    fallbackClassName="bg-muted"
                    iconClassName="h-8 w-8 text-muted-foreground"
                  />
                  <h3 className="text-lg font-semibold mb-2">
                    Start a conversation
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Ask me anything about AI, development, or how elizaOS can
                    help you build intelligent agents.
                  </p>
                </div>
              )}

              {!isLoadingMessages && messages.map((message, index) => {
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
                      <div className="flex flex-col gap-1 max-w-[70%]">
                        {/* Agent Name Row with Avatar */}
                        <div className="flex items-center gap-2">
                          <ElizaAvatar
                            avatarUrl={agentInfo?.avatarUrl}
                            name={characterName}
                            className="flex-shrink-0 w-4 h-4"
                            iconClassName="h-3 w-3"
                            animate={isThinking}
                          />
                          <div
                            className="font-[family-name:var(--font-roboto-flex)] text-sm font-medium"
                            style={{ color: "#A1A1AA" }}
                          >
                            {characterName}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          {isThinking ? (
                            <div className="flex items-center gap-3 py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <p className="text-sm text-muted-foreground font-[family-name:var(--font-roboto-flex)]">
                                is thinking...
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Message Text */}
                              <div
                                className="py-2 rounded-none font-[family-name:var(--font-roboto-flex)] text-[16px] leading-[1.5]"
                                style={{ fontWeight: 500 }}
                              >
                                <div className="whitespace-pre-wrap text-white">
                                  {message.content.text}
                                </div>
                              </div>
                              
                              {/* Image Attachments */}
                              {message.content.attachments && message.content.attachments.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  {message.content.attachments.map((attachment) => {
                                    if (attachment.contentType === "IMAGE" || attachment.contentType === "image") {
                                      return (
                                        <div key={attachment.id} className="rounded-lg overflow-hidden border border-white/10">
                                          <img
                                            src={attachment.url}
                                            alt={attachment.title || "Generated image"}
                                            className="w-full h-auto max-w-md"
                                          />
                                        </div>
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              )}
                              
                              {/* Time */}
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-sm font-[family-name:var(--font-roboto-mono)]"
                                  style={{ color: "#A1A1AA" }}
                                >
                                  {formatTimestamp(message.createdAt)}
                                </span>
                                {messageAudioUrls.current.has(message.id) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 hover:bg-white/10"
                                    onClick={() => {
                                      const url = messageAudioUrls.current.get(
                                        message.id,
                                      );
                                      if (url) {
                                        if (
                                          currentPlayingId === message.id &&
                                          player.isPlaying
                                        ) {
                                          player.stopAudio();
                                          setCurrentPlayingId(null);
                                        } else {
                                          setCurrentPlayingId(message.id);
                                          player.playAudio(url);
                                        }
                                      }
                                    }}
                                  >
                                    {currentPlayingId === message.id &&
                                    player.isPlaying ? (
                                      <Square className="h-3 w-3 text-white/60" />
                                    ) : (
                                      <Volume2 className="h-3 w-3 text-white/60" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-w-[70%]">
                        {/* User Message */}
                        <div
                          className="px-4 py-3 rounded-none font-[family-name:var(--font-roboto-flex)] text-[16px] leading-[1.5]"
                          style={{
                            backgroundColor: "#3A3A3A",
                            fontWeight: 500,
                          }}
                        >
                          <div className="whitespace-pre-wrap text-white">
                            {message.content.text}
                          </div>
                        </div>
                        {/* Time */}
                        <div className="flex items-center gap-2 justify-end px-1">
                          <span
                            className="text-sm font-[family-name:var(--font-roboto-mono)]"
                            style={{ color: "#A1A1AA" }}
                          >
                            {formatTimestamp(message.createdAt)}
                          </span>
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
          className="border-t p-3 mb-4"
          style={{ backgroundColor: "#1D1D1D" }}
        >
          <div className="space-y-2">
            {/* Text Input Box - Prominent standalone */}
            <div className="relative rounded-none border-2 border-border shadow-sm bg-black/20 overflow-hidden">
              {/* Robot Eye Visor Scanner - Animated line on top edge with randomness */}
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                {/* Primary scanner */}
                <div
                  className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                  style={{
                    animation: "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                    filter: "blur(0.5px)",
                  }}
                />
                {/* Secondary scanner for organic feel */}
                <div
                  className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
                  style={{
                    animation: "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
                    boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.5)",
                    filter: "blur(1px)",
                  }}
                />
              </div>
              <input
                value={inputText}
                onChange={(e) => setInputText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  recorder.isRecording
                    ? "Recording... Click stop when done"
                    : "Type your message here..."
                }
                disabled={isLoading || !roomId || recorder.isRecording}
                className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none disabled:opacity-50"
              />
            </div>

            {/* Bottom Row: Model Selector (left) and Action Buttons (right) */}
            <div className="flex items-center justify-between">
              {/* Model Selector - Bottom Left */}
              <Select
                value={selectedModel || "moonshotai/kimi-k2-0905"}
                onValueChange={(value) => {
                  setSelectedModel(value);
                  const modelName = value.split("/")[1] || value;
                  toast.success(`Model: ${modelName}`);
                }}
                disabled={isLoadingModels}
              >
                <SelectTrigger className="w-[140px] h-10 border-muted rounded-none">
                  <SelectValue placeholder="Select model">
                    {selectedModel
                      ? selectedModel.split("/")[1] || selectedModel
                      : "Select model"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.id.split("/")[1] || model.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Action Buttons - Bottom Right */}
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-none"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-80 rounded-none"
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
                              checked={autoPlayTTS}
                              onCheckedChange={setAutoPlayTTS}
                            />
                          </div>

                          {customVoices.length > 0 && (
                            <div className="space-y-2">
                              <Label
                                htmlFor="voice-select-pop"
                                className="text-sm"
                              >
                                Voice Selection
                              </Label>
                              <Select
                                value={selectedVoiceId || "default"}
                                onValueChange={(value) => {
                                  const newVoiceId =
                                    value === "default" ? null : value;
                                  setSelectedVoiceId(newVoiceId);

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
                                    ? customVoices.find(
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
                                  {customVoices.map((voice) => (
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
                        <KnowledgeDrawer />
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isLoading || !roomId}
                  onClick={handleVoiceInput}
                  className="h-10 w-10 rounded-none"
                >
                  {recorder.isRecording ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                <Button
                  type="submit"
                  disabled={
                    isLoading ||
                    !roomId ||
                    !inputText.trim() ||
                    recorder.isRecording
                  }
                  size="icon"
                  className="h-10 w-10 rounded-none border-none"
                  style={{ backgroundColor: "rgba(255, 88, 0, 0.25)" }}
                >
                  {isLoading ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      style={{ color: "#FF5800" }}
                    />
                  ) : (
                    <Send className="h-4 w-4" style={{ color: "#FF5800" }} />
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
