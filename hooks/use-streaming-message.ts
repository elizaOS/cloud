"use client";

/**
 * Streaming message structure from SSE events.
 */
export interface StreamingMessage {
  id: string;
  entityId: string;
  agentId?: string;
  content: {
    text: string;
    thought?: string;
    source?: string;
    inReplyTo?: string;
  };
  createdAt: number;
  isAgent: boolean;
  type: "user" | "agent" | "thinking" | "error";
}

/**
 * Options for sending a streaming message.
 */
interface SendMessageOptions {
  /** Room ID where the message is sent. */
  roomId: string;
  /** Message text content. */
  text: string;
  /** Optional model selection override. */
  model?: string;
  /** Anonymous session token from URL (for unauthenticated users). */
  sessionToken?: string;
  /** Callback invoked for each streamed message chunk. */
  onMessage: (message: StreamingMessage) => void;
  /** Optional error callback. */
  onError?: (error: string) => void;
  /** Optional completion callback. */
  onComplete?: () => void;
}

/**
 * Sends a message and streams the response via Server-Sent Events (SSE).
 * 
 * The entityId is derived from the authenticated user on the server.
 * Single endpoint handles everything - no cross-container issues!
 * 
 * @param options - Message sending options including callbacks.
 */
export async function sendStreamingMessage({
  roomId,
  text,
  model,
  sessionToken,
  onMessage,
  onError,
  onComplete,
}: SendMessageOptions): Promise<void> {
  const response = await fetch(`/api/eliza/rooms/${roomId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Include session token as header for anonymous users
      // This ensures session tracking works even if the cookie race condition occurs
      ...(sessionToken && { "X-Anonymous-Session": sessionToken }),
    },
    body: JSON.stringify({
      text,
      ...(model && { model }), // Include model if provided
      // Also include in body as backup
      ...(sessionToken && { sessionToken }),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to send message");
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || ""; // Keep incomplete message in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse SSE format: "event: type\ndata: {...}"
      const eventMatch = line.match(/^event: (.+)\n/);
      const dataMatch = line.match(/data: (.+)$/m);

      if (!dataMatch) continue;

      const data = JSON.parse(dataMatch[1]);
      const eventType = eventMatch ? eventMatch[1] : "message";

      if (eventType === "message") {
        onMessage(data);
      } else if (eventType === "error") {
        onError?.(data.message || "Unknown error");
      } else if (eventType === "done") {
        onComplete?.();
      }
    }
  }
}
