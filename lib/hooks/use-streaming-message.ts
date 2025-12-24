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

interface SSEErrorData {
  message?: string;
  error?: string;
}

/**
 * Chunk data from streaming event.
 */
export interface StreamChunkData {
  messageId: string;
  chunk: string;
  timestamp: number;
}

/**
 * Options for sending a streaming message.
 */
/** Default stream timeout in milliseconds (60 seconds) */
const STREAM_TIMEOUT_MS = 60_000;

/** Maximum buffer size to prevent memory exhaustion (1MB) */
const MAX_BUFFER_SIZE = 1024 * 1024;

interface SendMessageOptions {
  /** Room ID where the message is sent. */
  roomId: string;
  /** Message text content. */
  text: string;
  /** Optional model selection override. */
  model?: string;
  /** Anonymous session token from URL (for unauthenticated users). */
  sessionToken?: string;
  /** Whether web search is enabled for this message. */
  webSearchEnabled?: boolean;
  /** Callback invoked for each streamed message chunk. */
  onMessage: (message: StreamingMessage) => void;
  /** Callback invoked for each text chunk (real-time streaming). */
  onChunk?: (chunk: StreamChunkData) => void;
  /** Optional error callback. */
  onError?: (error: string) => void;
  /** Optional completion callback. */
  onComplete?: () => void;
  /** Optional timeout in ms (default: 60000) */
  timeoutMs?: number;
}

/**
 * Sends a message and streams the response via Server-Sent Events (SSE).
 *
 * The entityId is derived from the authenticated user on the server.
 * Single endpoint handles everything - no cross-container issues!
 *
 * @param options - Message sending options including callbacks.
 * @returns An AbortController that can be used to cancel the stream (returned immediately, not after completion)
 */
export function sendStreamingMessage({
  roomId,
  text,
  model,
  sessionToken,
  webSearchEnabled,
  onMessage,
  onChunk,
  onError,
  onComplete,
  timeoutMs = STREAM_TIMEOUT_MS,
}: SendMessageOptions): AbortController {
  const controller = new AbortController();
  let isTimeoutAbort = false;

  const timeoutId = setTimeout(() => {
    isTimeoutAbort = true; // Mark as timeout abort
    controller.abort();
  }, timeoutMs);

  // Start streaming in background (don't await - return controller immediately)
  (async () => {
    let response: Response;
    try {
      response = await fetch(`/api/eliza/rooms/${roomId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Include session token as header for anonymous users
          // This ensures session tracking works even if the cookie race condition occurs
          ...(sessionToken && { "X-Anonymous-Session": sessionToken }),
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          text,
          ...(model && { model }), // Include model if provided
          // Also include in body as backup
          ...(sessionToken && { sessionToken }),
          // Always include webSearchEnabled (defaults to true, explicitly false disables)
          webSearchEnabled: webSearchEnabled ?? true,
        }),
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        // Only show error for timeout, silently return for user-initiated abort
        if (isTimeoutAbort) {
          onError?.("Stream timeout: Request took too long");
        }
        // User-initiated abort (character switch) - silently return
        return;
      }
      onError?.(error instanceof Error ? error.message : "Failed to connect");
      return;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      let errorMessage = "Failed to send message";
      const contentType = response.headers.get("content-type");

      // Try to parse JSON error response, but handle empty/invalid responses gracefully
      if (contentType?.includes("application/json")) {
        try {
          const text = await response.text();
          if (text.trim()) {
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            errorMessage = `Server returned ${response.status} ${response.statusText}`;
          }
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = `Server returned ${response.status} ${response.statusText}`;
        }
      } else {
        // Non-JSON error response
        try {
          const text = await response.text();
          if (text.trim()) {
            errorMessage = text.substring(0, 200); // Limit error message length
          } else {
            errorMessage = `Server returned ${response.status} ${response.statusText}`;
          }
        } catch {
          errorMessage = `Server returned ${response.status} ${response.statusText}`;
        }
      }

      onError?.(errorMessage);
      return;
    }

    if (!response.body) {
      clearTimeout(timeoutId);
      onError?.("No response body");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              processSSEMessage(
                buffer.trim(),
                onMessage,
                onChunk,
                onError,
                onComplete
              );
            } catch (err) {
              console.error("[Stream] Error processing final buffer:", err);
              onError?.("Stream ended unexpectedly");
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Prevent unbounded buffer growth (potential DoS vector)
        if (buffer.length > MAX_BUFFER_SIZE) {
          onError?.(
            "Stream buffer exceeded maximum size - possible malformed SSE data"
          );
          return;
        }

        // Process complete SSE messages (separated by double newline)
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || ""; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          try {
            processSSEMessage(
              message.trim(),
              onMessage,
              onChunk,
              onError,
              onComplete
            );
          } catch (err) {
            console.error("[Stream] Error parsing SSE message:", err, message);
            // Continue processing other messages even if one fails
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Only show error for timeout aborts, not user-initiated aborts (character switching)
        if (isTimeoutAbort) {
          onError?.("Stream timeout: Connection took too long");
        }
        // Silently ignore user-initiated aborts (like ChatGPT/Claude)
        return;
      }
      onError?.(error instanceof Error ? error.message : "Stream error");
    } finally {
      clearTimeout(timeoutId);
    }
  })(); // End of async IIFE

  // Return the controller immediately (before streaming completes)
  return controller;
}

/**
 * Parse a single SSE message block and invoke appropriate callbacks.
 * Handles proper SSE format with multi-line data support.
 */
function processSSEMessage(
  message: string,
  onMessage: (message: StreamingMessage) => void,
  onChunk?: (chunk: StreamChunkData) => void,
  onError?: (error: string) => void,
  onComplete?: () => void
): void {
  const lines = message.split("\n");
  let eventType = "message"; // Default event type
  const dataLines: string[] = [];

  // Parse SSE format: lines can be "event: <type>" or "data: <json>" (data can be multi-line)
  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      // Collect all data lines (SSE allows multi-line data)
      dataLines.push(line.slice(6));
    }
  }

  // Skip if no data found
  if (dataLines.length === 0) {
    return;
  }

  // Join multi-line data (SSE spec allows this)
  const dataString = dataLines.join("\n");

  // Parse JSON data with error handling
  let data: unknown;
  try {
    data = JSON.parse(dataString);
  } catch (err) {
    console.error("[Stream] Failed to parse JSON data:", dataString, err);
    throw new Error(
      `Invalid JSON in SSE data: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Handle different event types
  switch (eventType) {
    case "message":
      // Validate message structure before passing to callback
      if (isValidStreamingMessage(data)) {
        onMessage(data);
      } else {
        console.warn("[Stream] Invalid message format:", data);
      }
      break;
    case "chunk":
      // Real-time streaming chunk - call onChunk if provided
      if (onChunk && isValidStreamChunkData(data as StreamChunkData)) {
        onChunk(data as StreamChunkData);
      }
      break;
    case "error": {
      const errorData = data as SSEErrorData;
      const errorMessage =
        errorData?.message || errorData?.error || "Unknown error";
      onError?.(errorMessage);
      break;
    }
    case "done":
      onComplete?.();
      break;
    case "connected":
    case "warning":
      // Ignore these events (connected is just confirmation, warning is handled separately)
      break;
    default:
      console.warn("[Stream] Unknown event type:", eventType, data);
  }
}

/**
 * Type guard for StreamingMessage validation.
 */
function isValidStreamingMessage(data: unknown): data is StreamingMessage {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Record<string, unknown>;
  return (
    typeof msg.id === "string" &&
    typeof msg.entityId === "string" &&
    typeof msg.content === "object" &&
    msg.content !== null &&
    typeof msg.createdAt === "number" &&
    typeof msg.isAgent === "boolean" &&
    ["user", "agent", "thinking", "error"].includes(msg.type as string)
  );
}

/**
 * Type guard for StreamChunkData validation.
 */
function isValidStreamChunkData(data: StreamChunkData): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.messageId === "string" &&
    typeof data.chunk === "string" &&
    typeof data.timestamp === "number"
  );
}
