"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Image as ImageIcon, MessageSquare } from "lucide-react";
import { ChatSidebar } from "./chat-sidebar";
import { ChatHeader } from "./chat-header";
import { ChatMessageRedesigned } from "./chat-message-redesigned";
import { ToolProgressIndicators } from "./tool-progress-indicators";
import { ApproveRejectBar } from "./approve-reject-bar";
import { ChatInputRedesigned } from "./chat-input-redesigned";
import { AgentSettingsPanel } from "./agent-settings-panel";
import { AgentDnaPanel } from "./agent-dna-panel";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";

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

interface ElizaChatRedesignedProps {
  availableCharacters?: ElizaCharacter[];
  initialCharacterId?: string | null;
}

export function ElizaChatRedesigned({
  availableCharacters = [],
  initialCharacterId = null,
}: ElizaChatRedesignedProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    initialCharacterId
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showDnaPanel, setShowDnaPanel] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const entityId = useRef<string>("");

  // Generate entity ID
  if (!entityId.current && typeof window !== "undefined") {
    const saved = window.localStorage.getItem("elizaEntityId");
    if (saved) {
      entityId.current = saved;
    } else {
      entityId.current = `user-${Math.random().toString(36).substring(7)}`;
      window.localStorage.setItem("elizaEntityId", entityId.current);
    }
  }

  // Load rooms
  const loadRooms = useCallback(async () => {
    try {
      const params = new URLSearchParams({ entityId: entityId.current });
      const res = await fetch(`/api/eliza/rooms?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rooms)) {
          const list = data.rooms.slice(0, 12);
          setRooms(list);
        }
      }
    } catch (error) {
      console.error("Failed to load rooms:", error);
    }
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop =
        scrollViewportRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: { text: inputText },
      isAgent: false,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    setIsThinking(true);
    setAgentRunning(true);

    try {
      // Simulated response for now - replace with real API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: {
          text: "This is a simulated response. The actual Eliza API will be integrated here.",
        },
        isAgent: true,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, agentMessage]);
      setIsThinking(false);
      setAgentRunning(false);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
      setIsThinking(false);
      setAgentRunning(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert rooms to conversation items for sidebar
  const conversations = rooms.map((room) => ({
    id: room.id,
    title: room.lastText || "New conversation",
    icon: <ImageIcon className="h-4 w-4 text-[#ADADAD]" />,
    isActive: room.id === roomId,
  }));

  // Add default conversations if empty
  const defaultConversations =
    conversations.length === 0
      ? [
          {
            id: "1",
            title: "Facebook Ad Concept",
            icon: <ImageIcon className="h-4 w-4 text-[#ADADAD]" />,
            isActive: true,
          },
          {
            id: "2",
            title: "1000x Sales Copy",
            icon: <MessageSquare className="h-4 w-4 text-[#ADADAD]" />,
            isActive: false,
          },
          {
            id: "3",
            title: "Facebook Post Content",
            icon: <ImageIcon className="h-4 w-4 text-[#ADADAD]" />,
            isActive: false,
          },
          {
            id: "4",
            title: "PFP Generation",
            icon: <ImageIcon className="h-4 w-4 text-[#ADADAD]" />,
            isActive: false,
          },
        ]
      : conversations;

  // Tool progress for thinking state
  const toolProgress = isThinking
    ? [
        {
          id: "1",
          name: "Creating Ad Concepts",
          icon: "puzzle" as const,
          isActive: true,
        },
        {
          id: "2",
          name: "Designing Visual Directions",
          icon: "image" as const,
        },
        { id: "3", name: "Drafting Copy Variations", icon: "message" as const },
      ]
    : [];

  const handleSettingsClick = () => {
    setShowDnaPanel(false);
    setShowSettingsPanel(!showSettingsPanel);
  };

  const handleMenuClick = () => {
    // Could show a dropdown menu
    toast.info("Menu options coming soon");
  };

  return (
    <div className="flex h-screen w-full bg-neutral-950">
      {/* Left Sidebar */}
      <ChatSidebar
        agentName={agentInfo?.name || "Zilo"}
        agentAvatar={agentInfo?.avatarUrl}
        interactionCount={messages.length}
        conversations={defaultConversations}
        onBackToAgents={() => {
          window.location.href = "/dashboard";
        }}
        onSelectConversation={(id) => setRoomId(id)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Chat Header */}
        <ChatHeader
          agentName={agentInfo?.name || "Zilo"}
          agentSubtitle="Marketing Agent"
          agentAvatar={agentInfo?.avatarUrl}
          isOnline={true}
          onSettingsClick={handleSettingsClick}
          onMenuClick={handleMenuClick}
        />

        {/* Messages Area */}
        <ScrollArea className="flex-1">
          <div
            ref={scrollViewportRef}
            className="px-32 py-4 space-y-5 max-w-[1185px] mx-auto"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-20">
                <p className="text-white/60 text-sm font-mono">
                  Start a conversation with {agentInfo?.name || "Zilo"}
                </p>
              </div>
            )}

            {messages.map((message) => (
              <ChatMessageRedesigned
                key={message.id}
                message={message}
                agentName={agentInfo?.name || "Zilo"}
                agentAvatar={agentInfo?.avatarUrl}
                onLike={() => toast.success("Message liked")}
                onDislike={() => toast.info("Message disliked")}
                onRegenerate={() => toast.info("Regenerating...")}
                onEditInStudio={() => toast.info("Opening Pro Studio...")}
              />
            ))}

            {/* Thinking State */}
            {isThinking && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full overflow-hidden bg-[#FF5800]">
                    <span className="text-white text-[8px] font-bold">Z</span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400 opacity-80">
                    Zilo is thinking ...
                  </p>
                </div>
                <ToolProgressIndicators tools={toolProgress} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Approve/Reject Bar (when agent is running) */}
        {agentRunning && (
          <ApproveRejectBar
            onApprove={() => {
              setAgentRunning(false);
              toast.success("Approved");
            }}
            onReject={() => {
              setAgentRunning(false);
              toast.info("Rejected");
            }}
          />
        )}

        {/* Input Area */}
        <div className="px-32 pb-2 max-w-[1185px] mx-auto w-full">
          <ChatInputRedesigned
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSendMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            isLoading={isLoading}
            onAttachment={() => toast.info("Attachment feature coming soon")}
            onVoiceInput={() => toast.info("Voice input feature coming soon")}
          />
        </div>
      </div>

      {/* Right Panel - Settings */}
      {showSettingsPanel && (
        <AgentSettingsPanel
          agentName={agentInfo?.name || "Zilo"}
          agentUsername="zilo_132"
          onClose={() => setShowSettingsPanel(false)}
          onSave={(settings) => {
            toast.success("Settings saved");
            console.log("Settings:", settings);
          }}
        />
      )}

      {/* Right Panel - DNA (JSON) */}
      {showDnaPanel && <AgentDnaPanel onClose={() => setShowDnaPanel(false)} />}

      {/* Resize Handles (visual only for now) */}
      <div className="absolute left-[250px] top-1/2 -translate-y-1/2 w-[9px] h-[28px] bg-[#1d1d1d] border border-[#3e3e43]" />
      {(showSettingsPanel || showDnaPanel) && (
        <div className="absolute right-[587px] top-1/2 -translate-y-1/2 w-[9px] h-[28px] bg-[#1d1d1d] border border-[#3e3e43]" />
      )}
    </div>
  );
}
