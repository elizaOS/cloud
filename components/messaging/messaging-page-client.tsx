"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConversationList } from "./conversation-list";
import type { Conversation } from "./conversation-list";
import { MessageThread } from "./message-thread";
import type { Message } from "./message-bubble";
import { RefreshCw, Search, Filter, MessageSquare, ArrowLeft } from "lucide-react";

interface AgentInfo {
  agentId: string;
  agentPhoneNumber: string;
  provider: string;
}

export function MessagingPageClient() {
  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  // Thread state
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // Filters
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const params = new URLSearchParams();
      if (providerFilter && providerFilter !== "all") {
        params.set("provider", providerFilter);
      }

      const response = await fetch(`/api/v1/messages?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      toast.error("Failed to load conversations");
    } finally {
      setIsLoadingConversations(false);
    }
  }, [providerFilter]);

  // Fetch thread messages
  const fetchThread = useCallback(async (phoneNumber: string, phoneNumberId?: string) => {
    setIsLoadingThread(true);
    try {
      const params = new URLSearchParams({ phoneNumber });
      if (phoneNumberId) {
        params.set("phoneNumberId", phoneNumberId);
      }

      const response = await fetch(`/api/v1/messages/thread?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();
      setMessages(data.messages || []);
      setAgentInfo(data.agentInfo);
    } catch (error) {
      console.error("Failed to fetch thread:", error);
      toast.error("Failed to load messages");
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch thread when conversation selected
  useEffect(() => {
    if (selectedConversation) {
      fetchThread(selectedConversation.phoneNumber, selectedConversation.phoneNumberId);
    }
  }, [selectedConversation, fetchThread]);

  // Mobile view state (show list or thread)
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);

  // Handle conversation selection
  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowThreadOnMobile(true); // On mobile, switch to thread view
  };

  // Handle back button on mobile
  const handleBackToList = () => {
    setShowThreadOnMobile(false);
  };

  // Filter conversations by search
  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.phoneNumber.includes(searchQuery) ||
          c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  return (
    <div className="container mx-auto py-8 h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-8 w-8" />
            Messaging Center
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage SMS and iMessage conversations with your agents.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchConversations()}
          disabled={isLoadingConversations}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingConversations ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-5rem)]">
        {/* Conversations list - hidden on mobile when viewing thread */}
        <Card className={`lg:col-span-1 flex flex-col overflow-hidden ${showThreadOnMobile ? "hidden lg:flex" : "flex"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              Conversations
              <Badge variant="secondary">{conversations.length}</Badge>
            </CardTitle>

            {/* Filters */}
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[100px] h-9">
                  <Filter className="h-4 w-4 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="twilio">SMS</SelectItem>
                  <SelectItem value="blooio">iMessage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto p-0">
            <ConversationList
              conversations={filteredConversations}
              selectedPhoneNumber={selectedConversation?.phoneNumber || null}
              onSelect={handleSelectConversation}
              isLoading={isLoadingConversations}
            />
          </CardContent>
        </Card>

        {/* Message thread - takes full width on mobile when shown */}
        <Card className={`lg:col-span-2 flex flex-col overflow-hidden ${!showThreadOnMobile && !selectedConversation ? "hidden lg:flex" : showThreadOnMobile ? "flex" : "hidden lg:flex"}`}>
          {/* Mobile back button */}
          {showThreadOnMobile && (
            <div className="lg:hidden border-b p-2">
              <Button variant="ghost" size="sm" onClick={handleBackToList}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to conversations
              </Button>
            </div>
          )}
          <MessageThread
            phoneNumber={selectedConversation?.phoneNumber || ""}
            messages={messages}
            agentInfo={agentInfo}
            isLoading={isLoadingThread}
          />
        </Card>
      </div>
    </div>
  );
}
