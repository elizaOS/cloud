"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Send,
  Bot,
  User,
  Clock,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
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

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
  };
  isAgent: boolean;
  createdAt: number;
}

interface AgentInfo {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

interface ElizaChatInterfaceProps {
  initialCharacterId?: string | null;
}

export function ElizaChatInterface({
  initialCharacterId = null,
}: ElizaChatInterfaceProps) {
  // Use chat store for room and character management
  const { 
    roomId, 
    entityId, 
    loadRooms,
    createRoom: createRoomInStore,
    selectedCharacterId,
    setSelectedCharacterId,
  } = useChatStore();

  // Set initial character ID from URL if provided
  useEffect(() => {
    if (initialCharacterId && initialCharacterId !== selectedCharacterId) {
      setSelectedCharacterId(initialCharacterId);
    }
  }, [initialCharacterId, selectedCharacterId, setSelectedCharacterId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
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
    }
  }, []);

  // Load messages when roomId from context changes
  useEffect(() => {
    if (roomId) {
      console.log("[ElizaChat] Room ID changed, loading messages:", roomId);
      loadMessages(roomId);
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

  // Create room with character if provided from URL
  useEffect(() => {
    if (initialCharacterId) {
      console.log(
        "[ElizaChat] Creating room with character from URL:",
        initialCharacterId,
      );
      createRoom(initialCharacterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCharacterId]);

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
    <div className="flex h-full w-full min-h-0">
      {/* Main Chat Area - Now Full Width */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Eliza</h3>
                <p className="text-xs text-muted-foreground">AI Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-tts" className="text-xs cursor-pointer">
                  Auto-play
                </Label>
                <Switch
                  id="auto-tts"
                  checked={autoPlayTTS}
                  onCheckedChange={setAutoPlayTTS}
                />
              </div>
              {customVoices.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="voice-select" className="text-xs">
                    Voice:
                  </Label>
                  <Select
                    value={selectedVoiceId || "default"}
                    onValueChange={(value) => {
                      const newVoiceId = value === "default" ? null : value;
                      setSelectedVoiceId(newVoiceId);

                      // Persist voice selection to localStorage
                      if (typeof window !== "undefined") {
                        if (newVoiceId) {
                          localStorage.setItem(
                            "eliza-selected-voice-id",
                            newVoiceId,
                          );
                        } else {
                          localStorage.removeItem("eliza-selected-voice-id");
                        }
                      }

                      const voiceName = newVoiceId
                        ? customVoices.find(
                            (v) => v.elevenlabsVoiceId === newVoiceId,
                          )?.name || "Custom Voice"
                        : "Default Voice";

                      console.log("[Voice Selector] Voice changed to:", value, {
                        newVoiceId,
                        voiceName,
                        persisted: true,
                      });

                      // Show toast confirmation
                      toast.success(`Voice changed to: ${voiceName}`);
                    }}
                  >
                    <SelectTrigger
                      id="voice-select"
                      className="h-8 text-xs w-[140px]"
                    >
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Voice</SelectItem>
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
              
              {/* Model Selector */}
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="model-select"
                  className="text-xs text-muted-foreground whitespace-nowrap"
                >
                  Model
                </Label>
                <Select
                  value={selectedModel || "moonshotai/kimi-k2-0905"}
                  onValueChange={(value) => {
                    setSelectedModel(value);
                    toast.success(`Model changed to: ${value.split("/")[1] || value}`);
                  }}
                  disabled={isLoadingModels}
                >
                  <SelectTrigger
                    id="model-select"
                    className="h-8 text-xs w-[180px]"
                  >
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <KnowledgeDrawer />
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {messages.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ElizaAvatar
                    avatarUrl={agentInfo?.avatarUrl}
                    name={agentInfo?.name}
                    className="h-12 w-12 mb-4"
                    fallbackClassName="bg-muted"
                    iconClassName="h-6 w-6 text-muted-foreground"
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

              {messages.map((message, index) => {
                const isThinking = message.id.startsWith("thinking-");
                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.isAgent ? "justify-start" : "justify-end"
                    } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {message.isAgent && (
                      <ElizaAvatar
                        avatarUrl={agentInfo?.avatarUrl}
                        name={agentInfo?.name}
                        className="flex-shrink-0 w-9 h-9"
                        iconClassName="h-5 w-5"
                        animate={isThinking}
                      />
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                        message.isAgent
                          ? "bg-card border"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {isThinking ? (
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <p className="text-sm text-muted-foreground">
                            Eliza is thinking...
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm whitespace-pre-wrap mb-2">
                            {message.content.text}
                          </div>
                          <div
                            className={`flex items-center justify-between gap-2 text-xs mt-2 pt-2 border-t ${
                              message.isAgent
                                ? "border-border text-muted-foreground"
                                : "border-primary-foreground/20 text-primary-foreground/80"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              <span>{formatTimestamp(message.createdAt)}</span>
                            </div>
                            {message.isAgent &&
                              messageAudioUrls.current.has(message.id) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
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
                                    <Square className="h-3 w-3" />
                                  ) : (
                                    <Volume2 className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                          </div>
                        </>
                      )}
                    </div>

                    {!message.isAgent && (
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t p-4"
        >
          <div className="flex gap-2">
            <Button
              type="button"
              variant={recorder.isRecording ? "destructive" : "outline"}
              size="lg"
              disabled={isLoading || !roomId}
              onClick={handleVoiceInput}
            >
              {recorder.isRecording ? (
                <Square className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
            <div className="flex-1 relative">
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
                    : "Type your message or use voice input..."
                }
                disabled={isLoading || !roomId || recorder.isRecording}
                className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <Button
              type="submit"
              disabled={
                isLoading ||
                !roomId ||
                !inputText.trim() ||
                recorder.isRecording
              }
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
    </div>
  );
}
