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
  MessageSquare,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
import { ElizaAvatar } from "./eliza-avatar";
import { useAudioRecorder } from "./hooks/use-audio-recorder";
import { useAudioPlayer } from "./hooks/use-audio-player";
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
import type { ElizaCharacter } from "@/lib/types";
import { ensureAudioFormat } from "@/lib/utils/audio";

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
  };
  isAgent: boolean;
  createdAt: number;
}

interface RoomItem {
  id: string;
  lastText?: string;
  lastTime?: number;
  characterId?: string;
}

interface AgentInfo {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

interface ElizaChatInterfaceProps {
  availableCharacters?: ElizaCharacter[];
  initialCharacterId?: string | null;
}

export function ElizaChatInterface({
  availableCharacters = [],
  initialCharacterId = null,
}: ElizaChatInterfaceProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    initialCharacterId
  );
  const [roomId, setRoomId] = useState<string | null>(null);

  // Debug: Log character selection changes
  useEffect(() => {
    console.log(
      "[ElizaChat] Character selection changed:",
      selectedCharacterId || "default"
    );
  }, [selectedCharacterId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const [autoPlayTTS, setAutoPlayTTS] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isProcessingSTT, setIsProcessingSTT] = useState(false);
  const messageAudioUrls = useRef<Map<string, string>>(new Map());

  const recorder = useAudioRecorder();
  const player = useAudioPlayer();

  // Generate a unique entity ID for this session
  const entityId = useRef<string>("");
  if (!entityId.current && typeof window !== "undefined") {
    const saved = window.localStorage.getItem("elizaEntityId");
    if (saved) {
      entityId.current = saved;
    } else {
      entityId.current = `user-${Math.random().toString(36).substring(7)}`;
      window.localStorage.setItem("elizaEntityId", entityId.current);
    }
  }

  const loadRooms = useCallback(async () => {
    setIsLoadingRooms(true);
    try {
      const params = new URLSearchParams({ entityId: entityId.current });
      const res = await fetch(`/api/eliza/rooms?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rooms)) {
          const list = data.rooms.slice(0, 12) as {
            id: string;
            characterId?: string;
          }[];
          console.log(
            "[ElizaChat] Loaded rooms from API:",
            list.map((r) => ({
              id: r.id.substring(0, 8),
              characterId: r.characterId,
            }))
          );

          const rooms: RoomItem[] = list.map((r) => ({
            id: r.id,
            characterId: r.characterId,
          }));

          setRooms(rooms);
        }
      }
    } catch {
      // non-fatal
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  const loadMessages = useCallback(async (targetRoomId: string) => {
    try {
      const response = await fetch(`/api/eliza/rooms/${targetRoomId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        if (data.agent) {
          setAgentInfo(data.agent);
        }
        // Update selected character based on room's assignment
        if (data.characterId) {
          console.log("[ElizaChat] Room uses character:", data.characterId);
          setSelectedCharacterId(data.characterId);
        } else {
          console.log("[ElizaChat] Room uses default character");
          setSelectedCharacterId(null);
        }
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  }, []);

  const createRoom = useCallback(async (characterId?: string | null) => {
    const charIdToUse = characterId !== undefined ? characterId : selectedCharacterId;
    console.log(
      "[ElizaChat] Creating room with character:",
      charIdToUse || "default"
    );
    setIsInitializing(true);
    setError(null);
    try {
      const response = await fetch("/api/eliza/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: entityId.current,
          characterId: charIdToUse || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const data = await response.json();
      console.log("[ElizaChat] Room created:", {
        roomId: data.roomId,
        characterId: data.characterId,
        requestedCharacterId: charIdToUse,
      });

      setRoomId(data.roomId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("elizaRoomId", data.roomId);
      }

      // Load initial messages (this will also update selectedCharacterId based on room's character)
      await loadMessages(data.roomId);
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      console.error("[ElizaChat] Error creating room:", err);
    } finally {
      setIsInitializing(false);
    }
  }, [loadMessages, loadRooms, selectedCharacterId]);

  // Initialize room: restore saved room or use most recent existing room
  useEffect(() => {
    const initializeRoom = async () => {
      // If initialCharacterId is provided from URL, create a new room immediately
      if (initialCharacterId) {
        console.log(
          "[ElizaChat] Initializing with character from URL:",
          initialCharacterId
        );
        await createRoom(initialCharacterId);
        return;
      }

      // First check for saved room in localStorage
      const savedRoom =
        typeof window !== "undefined"
          ? window.localStorage.getItem("elizaRoomId")
          : null;

      if (savedRoom) {
        setRoomId(savedRoom);
        loadMessages(savedRoom);
        await loadRooms();
      } else {
        // No saved room - check if user has any existing rooms
        try {
          const params = new URLSearchParams({ entityId: entityId.current });
          const res = await fetch(`/api/eliza/rooms?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.rooms) && data.rooms.length > 0) {
              // Use the most recent existing room
              const mostRecentRoom = data.rooms[0];
              setRoomId(mostRecentRoom.id);
              if (typeof window !== "undefined") {
                window.localStorage.setItem("elizaRoomId", mostRecentRoom.id);
              }
              loadMessages(mostRecentRoom.id);
              await loadRooms();
            } else {
              // No existing rooms - create a new one
              await createRoom();
            }
          } else {
            // Failed to get rooms - create a new one
            await createRoom();
          }
        } catch {
          // Error checking rooms - create a new one
          await createRoom();
        }
      }
    };

    initializeRoom();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCharacterId]);

  const generateSpeech = useCallback(
    async (text: string, messageId: string) => {
      try {
        const response = await fetch("/api/elevenlabs/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
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
    [autoPlayTTS, player]
  );

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

        // Auto-send the transcribed message directly (like /dashboard/text does)
        if (roomId) {
          console.log("[ElizaChat STT] Auto-sending transcribed message...");
          await sendMessage(transcript);
        } else {
          console.warn(
            "[ElizaChat STT] No roomId available, skipping auto-send"
          );
        }
      } catch (error) {
        console.error("[ElizaChat STT] Error:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to transcribe audio"
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

  // Generate TTS for new agent messages
  useEffect(() => {
    const newAgentMessages = messages.filter(
      (msg) =>
        msg.isAgent &&
        !msg.id.startsWith("thinking-") &&
        !messageAudioUrls.current.has(msg.id)
    );

    newAgentMessages.forEach((msg) => {
      if (msg.content.text) {
        generateSpeech(msg.content.text, msg.id).catch(console.error);
      }
    });
  }, [messages, generateSpeech]);

  // Poll for new messages
  useEffect(() => {
    if (!roomId) return;

    const pollMessages = async () => {
      if (isPollingRef.current) {
        return;
      }

      isPollingRef.current = true;
      try {
        const lastTimestamp =
          messages.length > 0
            ? Math.max(...messages.map((m) => m.createdAt))
            : 0;

        const response = await fetch(
          `/api/eliza/rooms/${roomId}/messages?afterTimestamp=${lastTimestamp}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            setMessages((prev) => {
              // Check if any new message is from the agent
              const hasAgentResponse = (data.messages as Message[]).some(
                (msg) => msg.isAgent
              );

              // Only remove thinking placeholder if we have an agent response
              const cleaned = prev.filter((m) => {
                if (m.id.startsWith("temp-")) return false; // Always remove temp user messages
                if (m.id.startsWith("thinking-") && hasAgentResponse) {
                  // Clear the thinking timeout since we got a response
                  if (thinkingTimeoutRef.current) {
                    clearTimeout(thinkingTimeoutRef.current);
                    thinkingTimeoutRef.current = null;
                  }
                  return false; // Remove thinking only if agent responded
                }
                return true;
              });

              // Deduplicate messages by ID
              const byId = new Map<string, Message>();
              for (const m of cleaned) byId.set(m.id, m);

              const incomingMessages = data.messages as Message[];
              const newMessages = incomingMessages.filter(
                (msg) => !byId.has(msg.id)
              );

              if (newMessages.length > 0) {
                console.log(
                  "[Chat] New messages from poll:",
                  newMessages.length,
                  newMessages.map((m) => ({
                    id: m.id.substring(0, 8),
                    isAgent: m.isAgent,
                    text: m.content.text?.substring(0, 30),
                  }))
                );
              }

              for (const incoming of incomingMessages) {
                byId.set(incoming.id, incoming);
              }

              const merged = Array.from(byId.values());
              merged.sort((a, b) => a.createdAt - b.createdAt);
              return merged;
            });
          }
        }
      } catch (err) {
        console.error("Error polling messages:", err);
      } finally {
        isPollingRef.current = false;
      }
    };

    // Check if there's a thinking message - if so, poll faster
    const hasThinkingMessage = messages.some((m) =>
      m.id.startsWith("thinking-")
    );
    const pollInterval = hasThinkingMessage ? 1000 : 3000; // 1s when thinking, 3s otherwise

    pollIntervalRef.current = setInterval(pollMessages, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [roomId, messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      // ScrollArea wraps content in a viewport div with data-radix-scroll-area-viewport
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
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

    // Add optimistic user message and thinking placeholder in one atomic update
    const clientMessageId = `temp-${Date.now()}`;
    const now = Date.now();
    const tempUserMessage: Message = {
      id: clientMessageId,
      content: { text: messageText, clientMessageId },
      isAgent: false,
      createdAt: now,
    };
    const thinkingMessage: Message = {
      id: `thinking-${now}`,
      content: { text: "" },
      isAgent: true,
      createdAt: now + 999999, // Very high timestamp to ensure it always appears last
    };
    setMessages((prev) => [...prev, tempUserMessage, thinkingMessage]);

    // Safety timeout: remove thinking indicator after 30 seconds if no response
    thinkingTimeoutRef.current = setTimeout(() => {
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("thinking-")));
      console.warn(
        "[Chat] Thinking indicator timeout - agent took too long to respond"
      );
    }, 30000);

    try {
      const response = await fetch(`/api/eliza/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: entityId.current,
          text: messageText,
          clientMessageId,
          attachments: [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      // Remove only the temp user message; keep thinking indicator until real response arrives via polling
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== tempUserMessage.id)
      );

      // The polling interval will catch the response automatically
      // No immediate poll needed - this prevents race conditions and duplicate messages
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
      // Remove temp and thinking messages on error
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== tempUserMessage.id && !msg.id.startsWith("thinking-")
        )
      );
      // Clear thinking timeout on error
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
    } finally {
      setIsLoading(false);
      loadRooms();
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
      {/* Left Sidebar - Rooms */}
      <div className="hidden md:flex md:flex-col w-80 border-r bg-card/50 min-h-0">
        <div className="border-b p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Conversations</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => createRoom()}>
              New
            </Button>
          </div>

          {/* Character Selector */}
          {availableCharacters.length > 0 && (
            <div className="space-y-2">
              <Label
                htmlFor="character-select"
                className="text-xs text-muted-foreground"
              >
                Character
              </Label>
              <Select
                value={selectedCharacterId || "default"}
                onValueChange={(value) =>
                  setSelectedCharacterId(value === "default" ? null : value)
                }
              >
                <SelectTrigger id="character-select" className="h-8 text-xs">
                  <SelectValue placeholder="Default (Eliza)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (Eliza)</SelectItem>
                  {availableCharacters.map((char) => (
                    <SelectItem key={char.id} value={char.id!}>
                      {char.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={loadRooms}
            className="w-full text-xs"
          >
            Refresh
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {isLoadingRooms && rooms.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {rooms.map((r) => {
                    const roomCharacter = r.characterId
                      ? availableCharacters.find((c) => c.id === r.characterId)
                      : null;
                    const characterName = roomCharacter?.name || "Default";

                    return (
                      <button
                        key={r.id}
                        className={`w-full rounded-lg px-3 py-3 text-left transition-all hover:bg-accent/50 ${
                          r.id === roomId ? "bg-accent" : ""
                        }`}
                        onClick={() => {
                          setRoomId(r.id);
                          if (typeof window !== "undefined") {
                            window.localStorage.setItem("elizaRoomId", r.id);
                          }
                          setMessages([]);
                          loadMessages(r.id);
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold truncate flex-1">
                            Room {r.id.substring(0, 8)}...
                          </div>
                          {r.lastTime ? (
                            <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                              {formatTimestamp(r.lastTime)}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            {characterName}
                          </div>
                          {r.lastText && (
                            <div className="text-xs text-muted-foreground truncate flex-1">
                              {r.lastText}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {rooms.length === 0 && !isLoadingRooms && (
                    <div className="px-3 py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        No conversations yet
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Chat Area */}
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
                                      message.id
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
