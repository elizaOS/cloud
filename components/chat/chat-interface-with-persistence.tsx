"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { Conversation, ConversationMessage } from "@/lib/types";
import {
  Send,
  Loader2,
  Bot,
  User,
  Clock,
  Settings,
  Mic,
  Square,
  Play,
  Volume2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createConversationAction } from "@/app/actions/conversations";
import { cn } from "@/lib/utils";
import { useAudioRecorder } from "./hooks/use-audio-recorder";
import { useAudioPlayer } from "./hooks/use-audio-player";
import { toast } from "sonner";
import { BrandButton, HUDContainer } from "@/components/brand";

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
  const [input, setInput] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    { id: string; name: string; provider?: string }[]
  >([]);
  const [selectedModel, setSelectedModel] = useState(
    conversation?.model || "gpt-4o",
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversation?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const messageTimestamps = useRef<Map<string, Date>>(new Map());
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageAudioUrls = useRef<Map<string, string>>(new Map());
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [customVoices, setCustomVoices] = useState<
    Array<{
      id: string;
      elevenlabsVoiceId: string;
      name: string;
      cloneType: string;
      createdAt: Date | string;
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

  // Audio hooks
  const recorder = useAudioRecorder();
  const player = useAudioPlayer();

  const { messages, sendMessage, setMessages } = useChat({
    id: selectedModel,
    transport: new DefaultChatTransport({
      api: "/api/v1/chat",
    }),
    onError: (error: Error) => {
      setErrorMessage(
        error.message || "Failed to send message. Please try again.",
      );
      setIsProcessing(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    },
    onFinish: () => {
      setIsProcessing(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    },
  });

  useEffect(() => {
    fetch("/api/v1/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.data && Array.isArray(data.data)) {
          const models = data.data.map((model: { id: string; owned_by: string }) => ({
            id: model.id,
            name: model.id,
            provider: model.owned_by,
          }));
          setAvailableModels(models);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch models:", error);
      });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showModelSelector &&
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(event.target as Node)
      ) {
        setShowModelSelector(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showModelSelector]);

  useEffect(() => {
    const conversationId = conversation?.id || null;
    const hasConversationChanged = conversationId !== activeConversationId;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setActiveConversationId(conversationId);

      if (initialMessages.length > 0) {
        initialMessages.forEach((msg) => {
          messageTimestamps.current.set(msg.id, new Date(msg.created_at));
        });

        const formattedMessages: UIMessage[] = initialMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          parts: [{ type: "text", text: msg.content }],
        }));
        setMessages(formattedMessages);
      }
      return;
    }

    if (hasConversationChanged) {
      setActiveConversationId(conversationId);
      messageTimestamps.current.clear();

      if (initialMessages.length > 0) {
        initialMessages.forEach((msg) => {
          messageTimestamps.current.set(msg.id, new Date(msg.created_at));
        });

        const formattedMessages: UIMessage[] = initialMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          parts: [{ type: "text", text: msg.content }],
        }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    }
  }, [conversation?.id, initialMessages, activeConversationId, setMessages]);

  useEffect(() => {
    messages.forEach((msg) => {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, new Date());
      }
    });
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Store the current ref value in a variable for cleanup
    const currentAudioUrls = messageAudioUrls.current;

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      // Cleanup audio URLs using the stored ref value
      currentAudioUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Show recorder errors
  useEffect(() => {
    if (recorder.error) {
      toast.error(recorder.error);
    }
  }, [recorder.error]);

  // Show player errors
  useEffect(() => {
    if (player.error) {
      toast.error(player.error);
    }
  }, [player.error]);

  // Helper function to check if voice is ready
  const isVoiceReady = useCallback(
    (voice: { cloneType: string; createdAt: Date | string }) => {
      // Instant voices are always ready
      if (voice.cloneType === "instant") return true;

      // Professional voices need 30-60 minutes to process
      const minutesElapsed = Math.max(
        0,
        (Date.now() - new Date(voice.createdAt).getTime()) / 1000 / 60,
      );

      // Consider ready after 60 minutes
      return minutesElapsed >= 60;
    },
    [],
  );

  // Load custom voices on mount
  useEffect(() => {
    const fetchCustomVoices = async () => {
      try {
        const response = await fetch("/api/elevenlabs/voices/user");
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.voices)) {
            // Filter to only show ready voices
            const readyVoices = data.voices.filter(
              (voice: { cloneType: string; createdAt: Date | string }) =>
                isVoiceReady(voice),
            );

            setCustomVoices(readyVoices);

            console.log("[Custom Voices] Loaded voices:", {
              total: data.voices.length,
              ready: readyVoices.length,
              processing: data.voices.length - readyVoices.length,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load custom voices:", error);
      }
    };

    fetchCustomVoices();

    // Refresh voices every 5 minutes to catch newly ready professional voices
    const refreshInterval = setInterval(
      () => {
        fetchCustomVoices();
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, [isVoiceReady]);

  // Validate selected voice is still available (in case it becomes unavailable)
  useEffect(() => {
    if (selectedVoiceId && customVoices.length > 0) {
      const voiceExists = customVoices.some(
        (v) => v.elevenlabsVoiceId === selectedVoiceId,
      );

      if (!voiceExists) {
        console.log(
          "[Voice Validation] Selected voice no longer available, resetting to default",
        );
        setSelectedVoiceId(null);
      }
    }
  }, [customVoices, selectedVoiceId]);

  // Clear cached audio when voice changes (force regeneration with new voice)
  useEffect(() => {
    // Clear all cached audio URLs when voice selection changes
    // This ensures that clicking play will regenerate audio with the new voice
    const currentUrls = messageAudioUrls.current;

    // Revoke all existing blob URLs to free memory
    for (const url of currentUrls.values()) {
      URL.revokeObjectURL(url);
    }

    // Clear the cache
    messageAudioUrls.current.clear();

    console.log(
      "[Voice Change] Cleared audio cache, will regenerate with new voice:",
      {
        selectedVoiceId,
        voiceName: selectedVoiceId
          ? customVoices.find((v) => v.elevenlabsVoiceId === selectedVoiceId)
              ?.name
          : "Default",
      },
    );
  }, [selectedVoiceId, customVoices]);

  // Generate TTS for assistant message
  const generateTTS = useCallback(
    async (text: string, messageId: string) => {
      try {
        // Use selectedVoiceId directly from closure (callback recreates when it changes)
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

        // Auto-play if enabled
        if (autoPlayTTS) {
          setCurrentPlayingId(messageId);
          await player.playAudio(audioBlob);
          setCurrentPlayingId(null);
        }
      } catch (error) {
        console.error("Error generating TTS:", error);
        toast.error("Failed to generate speech");
      }
    },
    [autoPlayTTS, player, selectedVoiceId, customVoices],
  );

  // Handle voice message (STT → AI → TTS)
  const handleVoiceMessage = useCallback(
    async (audioBlob: Blob) => {
      if (isProcessing) return;
      setIsProcessing(true);

      try {
        // Step 1: Transcribe audio
        const formData = new FormData();
        const audioFile = new File([audioBlob], "recording.webm", {
          type: audioBlob.type || "audio/webm",
        });
        formData.append("audio", audioFile);

        const sttResponse = await fetch("/api/elevenlabs/stt", {
          method: "POST",
          body: formData,
        });

        if (!sttResponse.ok) {
          const error = await sttResponse.json();
          throw new Error(error.error || "Failed to transcribe audio");
        }

        const { transcript } = await sttResponse.json();

        if (!transcript || transcript.trim().length === 0) {
          toast.error("No speech detected. Please try again.");
          setIsProcessing(false);
          return;
        }

        // Step 2: Send transcribed text to AI (same as text input)
        let conversationId = conversation?.id;

        if (!conversationId) {
          const result = await createConversationAction({
            title: transcript.substring(0, 50),
            model: selectedModel,
          });

          if (!result.success || !result.conversation) {
            throw new Error("Failed to create conversation");
          }

          conversationId = result.conversation.id;
          setActiveConversationId(conversationId);

          if (onConversationCreated) {
            onConversationCreated(result.conversation);
          }
        }

        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = setTimeout(() => {
          setIsProcessing(false);
        }, 30000);

        sendMessage({
          text: transcript,
          metadata: { conversationId },
        });
      } catch (error) {
        console.error("Error processing voice message:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to process voice message",
        );
        setIsProcessing(false);
      }
    },
    [
      isProcessing,
      conversation,
      selectedModel,
      onConversationCreated,
      sendMessage,
    ],
  );

  // Monitor for completed recording
  useEffect(() => {
    if (recorder.audioBlob && !isProcessing) {
      handleVoiceMessage(recorder.audioBlob);
      recorder.clearRecording();
    }
  }, [recorder.audioBlob, isProcessing, handleVoiceMessage, recorder]);

  // Auto-generate TTS for new assistant messages
  useEffect(() => {
    if (!autoPlayTTS) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && !isProcessing) {
      // Check if we already generated audio for this message
      if (!messageAudioUrls.current.has(lastMessage.id)) {
        const text =
          lastMessage.parts.find((p) => p.type === "text")?.text || "";
        if (text) {
          generateTTS(text, lastMessage.id);
        }
      }
    }
  }, [messages, autoPlayTTS, isProcessing, generateTTS]);

  const playMessageAudio = async (messageId: string) => {
    const existingUrl = messageAudioUrls.current.get(messageId);

    if (existingUrl) {
      // Play existing cached audio
      console.log("[Play Audio] Using cached audio for message:", messageId);
      setCurrentPlayingId(messageId);
      await player.playAudio(existingUrl);
      setCurrentPlayingId(null);
    } else {
      // Generate and play new audio with current voice
      console.log("[Play Audio] Generating new audio for message:", messageId);
      const message = messages.find((m) => m.id === messageId);
      if (message && message.role === "assistant") {
        const text = message.parts.find((p) => p.type === "text")?.text || "";
        if (text) {
          setCurrentPlayingId(messageId);
          await generateTTS(text, messageId);
          const url = messageAudioUrls.current.get(messageId);
          if (url) {
            await player.playAudio(url);
          }
          setCurrentPlayingId(null);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    let conversationId = conversation?.id;

    setIsProcessing(true);

    if (!conversationId) {
      try {
        const result = await createConversationAction({
          title: "New Conversation",
          model: selectedModel,
        });

        if (!result.success || !result.conversation) {
          console.error("Failed to create conversation");
          setIsProcessing(false);
          return;
        }

        conversationId = result.conversation.id;
        setActiveConversationId(conversationId);

        if (onConversationCreated) {
          onConversationCreated(result.conversation);
        }
      } catch (error) {
        console.error("Error creating conversation:", error);
        setIsProcessing(false);
        return;
      }
    }

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn("[Chat] Loading timeout - forcing reset");
      setIsProcessing(false);
    }, 30000);

    const messageText = input;
    setInput("");

    sendMessage({
      text: messageText,
      metadata: { conversationId },
    });
  };

  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;
  const isWaitingForResponse = lastMessage?.role === "user" && isProcessing;

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
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
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(isSameYear ? {} : { year: "numeric" }),
    });

    return `${dateStr}, ${timeStr}`;
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-transparent relative z-10">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF5800]">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">
              {conversation?.title || "New Conversation"}
            </h3>
            <p className="text-xs text-muted-foreground">Powered by elizaOS</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* TTS Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-tts"
              checked={autoPlayTTS}
              onCheckedChange={setAutoPlayTTS}
              disabled={isProcessing}
            />
            <label
              htmlFor="auto-tts"
              className="text-xs cursor-pointer select-none flex items-center gap-1 text-white/70"
            >
              <Volume2 className="h-3 w-3" />
              <span className="hidden sm:inline">Auto-play</span>
            </label>
          </div>

          {/* Custom Voice Selector */}
          {customVoices.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="voice-select-chat"
                className="text-xs whitespace-nowrap text-white/70 uppercase tracking-wide"
              >
                Voice:
              </label>
              <Select
                key={`voice-${selectedVoiceId || "default"}`}
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
                  id="voice-select-chat"
                  className="h-8 text-xs w-[140px]"
                >
                  <SelectValue placeholder="Default Voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Voice</SelectItem>
                  {customVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.elevenlabsVoiceId}>
                      {voice.name}
                      {voice.cloneType === "professional" && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          (Pro)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative" ref={modelSelectorRef}>
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
            >
              <Settings className="h-4 w-4" />
              <span className="truncate">{selectedModel}</span>
              <span className="rounded-none bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0 text-[10px] text-[#FF5800]">
                {messages.length}
              </span>
            </BrandButton>

            {showModelSelector && availableModels.length > 0 && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-none border border-white/10 bg-black/90 shadow-xl">
                <div className="border-b border-white/10 bg-black/60 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Select model
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto px-2 py-2">
                  {availableModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelSelector(false);
                      }}
                      className={cn(
                        "w-full rounded-none px-3 py-2 text-left text-sm transition-colors",
                        selectedModel === model.id
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5",
                      )}
                    >
                      <div className="font-medium">{model.name}</div>
                      {model.provider && (
                        <div className="text-xs text-white/50">
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
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {!conversation && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/60">
            <Bot className="h-12 w-12 text-[#FF5800]" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">
                Start a new conversation
              </h3>
              <p className="text-sm text-white/60">
                Type your message below to begin. A new conversation will be
                created automatically.
              </p>
            </div>
          </div>
        )}

        {conversation && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/60">
            <Bot className="h-12 w-12 text-[#FF5800]" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">
                Start a conversation
              </h3>
              <p className="text-sm text-white/60">
                Ask anything about AI, development, or how elizaOS can help you
                build intelligent agents.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {message.role === "assistant" && (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              )}

              <div
                className={cn(
                  "max-w-[min(760px,82%)] rounded-none border px-4 py-3 text-sm leading-relaxed",
                  message.role === "user"
                    ? "border-[#FF5800] bg-[#FF580020] text-white"
                    : "border-white/10 bg-black/40 text-white",
                )}
              >
                <div className="whitespace-pre-wrap">
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <div key={`${message.id}-${i}`}>{part.text}</div>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>

                <div
                  className={cn(
                    "mt-3 flex items-center justify-between gap-2 text-xs border-t pt-2",
                    message.role === "user"
                      ? "text-white/70 border-[#FF5800]/20"
                      : "text-white/50 border-white/10",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    <span>
                      {formatTimestamp(
                        messageTimestamps.current.get(message.id)?.getTime() ||
                          Date.now(),
                      )}
                    </span>
                  </div>

                  {/* Play button for assistant messages */}
                  {message.role === "assistant" && (
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 hover:bg-white/10"
                      onClick={() => playMessageAudio(message.id)}
                      disabled={currentPlayingId === message.id}
                    >
                      {currentPlayingId === message.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </BrandButton>
                  )}
                </div>
              </div>

              {message.role === "user" && (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                  <User className="h-5 w-5 text-white" />
                </div>
              )}
            </div>
          ))}

          {isWaitingForResponse && (
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
              <div className="max-w-[min(760px,82%)] rounded-none border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/70">
                Eliza Agent is thinking...
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-3">
              <div className="max-w-[min(760px,82%)] rounded-none border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
                <div className="font-medium">Error</div>
                <div className="mt-1">{errorMessage}</div>
                <BrandButton
                  variant="outline"
                  size="sm"
                  onClick={() => setErrorMessage(null)}
                  className="mt-2 border-rose-500/40 hover:bg-rose-500/10"
                >
                  Dismiss
                </BrandButton>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 px-6 py-4 space-y-3">
        {/* Voice recording indicator */}
        {recorder.isRecording && (
          <div className="flex items-center justify-center gap-2 text-sm text-white/60">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>
              Recording... {Math.floor(recorder.recordingTime / 60)}:
              {(recorder.recordingTime % 60).toString().padStart(2, "0")}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <HUDContainer className="flex items-center gap-3 p-4" cornerSize="sm">
            {/* Voice recording button */}
            <BrandButton
              type="button"
              variant={recorder.isRecording ? "primary" : "icon"}
              size="icon"
              className={cn(recorder.isRecording && "animate-pulse")}
              onClick={
                recorder.isRecording
                  ? recorder.stopRecording
                  : recorder.startRecording
              }
              disabled={isProcessing && !recorder.isRecording}
            >
              {recorder.isRecording ? (
                <Square className="h-5 w-5" fill="currentColor" />
              ) : (
                <Mic className="h-5 w-5" style={{ color: "#FF5800" }} />
              )}
            </BrandButton>

            <div className="relative flex-1">
              <input
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                placeholder={
                  conversation
                    ? "Type or speak your message…"
                    : "Type or speak to start a new conversation…"
                }
                disabled={isProcessing || recorder.isRecording}
                className="h-full w-full bg-transparent border-0 text-white placeholder:text-white/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <BrandButton
              type="submit"
              variant="icon-primary"
              size="icon"
              disabled={isProcessing || !input.trim() || recorder.isRecording}
            >
              {isProcessing ? (
                <Loader2
                  className="h-5 w-5 animate-spin"
                  style={{ color: "#FF5800" }}
                />
              ) : (
                <Send className="h-5 w-5" style={{ color: "#FF5800" }} />
              )}
            </BrandButton>
          </HUDContainer>
        </form>
      </div>
    </div>
  );
}
