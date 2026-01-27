"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Phone, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Conversation {
  phoneNumber: string;
  toNumber: string;
  agentId: string;
  provider: "twilio" | "blooio";
  phoneNumberId: string;
  friendlyName: string | null;
  lastMessage: string | null;
  lastDirection: string | null;
  lastMessageAt: string;
  totalMessages: number;
  failedCount: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedPhoneNumber: string | null;
  onSelect: (conversation: Conversation) => void;
  isLoading?: boolean;
}

function ConversationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

function getProviderBadge(provider: string) {
  if (provider === "twilio") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/30">
        SMS
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
      iMessage
    </Badge>
  );
}

function getInitials(phoneNumber: string) {
  // For phone numbers, use last 2 digits
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.slice(-2) || "??";
}

export function ConversationList({
  conversations,
  selectedPhoneNumber,
  onSelect,
  isLoading = false,
}: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="divide-y divide-border">
        {[1, 2, 3, 4, 5].map((i) => (
          <ConversationSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground font-medium">No conversations yet</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Messages will appear here when users text your phone numbers.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" data-testid="conversation-list">
      {conversations.map((conversation) => {
        const isSelected = selectedPhoneNumber === conversation.phoneNumber;
        const timeAgo = formatDistanceToNow(new Date(conversation.lastMessageAt), {
          addSuffix: true,
        });

        return (
          <button
            key={`${conversation.phoneNumber}-${conversation.phoneNumberId}`}
            onClick={() => onSelect(conversation)}
            data-testid="conversation-item"
            aria-label={`Conversation with ${conversation.phoneNumber}`}
            className={cn(
              "w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50",
              isSelected && "bg-muted"
            )}
          >
            {/* Avatar */}
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {getInitials(conversation.phoneNumber)}
              </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">
                    {conversation.phoneNumber}
                  </span>
                  {getProviderBadge(conversation.provider)}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {timeAgo}
                </span>
              </div>

              {/* Last message preview */}
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {conversation.lastDirection === "outbound" && (
                  <span className="text-primary">You: </span>
                )}
                {conversation.lastMessage || "(No message)"}
              </p>

              {/* Stats row */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {conversation.totalMessages} message{conversation.totalMessages !== 1 ? "s" : ""}
                </span>
                {conversation.failedCount > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
                    <AlertCircle className="h-3 w-3 mr-0.5" />
                    {conversation.failedCount} failed
                  </Badge>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
