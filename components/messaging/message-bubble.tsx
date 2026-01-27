"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  body: string | null;
  messageType: string;
  status: string;
  errorMessage: string | null;
  agentResponse: string | null;
  responseTimeMs: number | null;
  createdAt: string;
  respondedAt: string | null;
}

interface MessageBubbleProps {
  message: Message;
  agentPhoneNumber?: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "responded":
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    case "processing":
      return <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />;
    case "failed":
      return <AlertCircle className="h-3 w-3 text-red-500" />;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "responded":
      return "Delivered";
    case "processing":
      return "Processing";
    case "failed":
      return "Failed";
    case "received":
      return "Received";
    default:
      return status;
  }
}

export function MessageBubble({ message, agentPhoneNumber }: MessageBubbleProps) {
  const isInbound = message.direction === "inbound";
  const timeAgo = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true });

  return (
    <div
      data-testid="message-bubble"
      data-direction={message.direction}
      className={cn(
        "flex flex-col gap-1 max-w-[80%]",
        isInbound ? "items-start" : "items-end ml-auto"
      )}
    >
      {/* Message bubble */}
      <div
        className={cn(
          "rounded-2xl px-4 py-2 text-sm",
          isInbound
            ? "bg-muted text-foreground rounded-bl-sm"
            : "bg-primary text-primary-foreground rounded-br-sm"
        )}
      >
        {message.body || <span className="italic text-muted-foreground">(No content)</span>}
      </div>

      {/* Agent response (if different from main body, show as follow-up) */}
      {message.agentResponse && message.agentResponse !== message.body && (
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 text-sm ml-auto">
          {message.agentResponse}
        </div>
      )}

      {/* Metadata row */}
      <div className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        isInbound ? "flex-row" : "flex-row-reverse"
      )}>
        <span>{timeAgo}</span>
        
        {!isInbound && (
          <div className="flex items-center gap-1">
            {getStatusIcon(message.status)}
            <span>{getStatusLabel(message.status)}</span>
          </div>
        )}

        {message.responseTimeMs && message.responseTimeMs > 0 && (
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {message.responseTimeMs}ms
          </Badge>
        )}
      </div>

      {/* Error message */}
      {message.status === "failed" && message.errorMessage && (
        <div className="text-xs text-red-500 bg-red-500/10 rounded px-2 py-1">
          {message.errorMessage}
        </div>
      )}
    </div>
  );
}
