import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { messageEventEmitter } from "@/lib/events/message-events";
import type { MessageEvent } from "@/lib/events/message-events";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Heartbeat every 30 seconds to keep connection alive
const HEARTBEAT_INTERVAL = 30000;

// Connection timeout: 5 minutes (serverless-friendly)
const CONNECTION_TIMEOUT = parseInt(
  process.env.SSE_CONNECTION_TIMEOUT || "300000",
  10,
);

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    await requireAuth();
    const { roomId } = await ctx.params;

    logger.info(`[Message SSE] Client connected to room: ${roomId}`);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let connectionTimeout: NodeJS.Timeout | null = null;
        let unsubscribe: (() => void) | null = null;

        const sendEvent = (event: string, data: unknown) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            logger.error("[Message SSE] Error sending event:", error);
          }
        };

        // Send initial connection confirmation
        sendEvent("connected", {
          roomId,
          timestamp: new Date(),
        });

        logger.info(`[Message SSE] 🔌 Creating subscription for room=${roomId}`);

        // Subscribe to message events for this room
        unsubscribe = messageEventEmitter.subscribeToMessages(
          roomId,
          (event: MessageEvent) => {
            logger.info(`[Message SSE] 📤 RECEIVED EVENT from emitter:`, {
              roomId: event.roomId,
              messageId: event.messageId,
              type: event.type,
            });

            logger.info(`[Message SSE] 📨 SENDING message event to client via SSE`);
            sendEvent("message", {
              id: event.messageId,
              entityId: event.entityId,
              agentId: event.agentId,
              content: event.content,
              createdAt: event.createdAt,
              isAgent: event.isAgent,
              type: event.type,
            });
            logger.info(`[Message SSE] ✅ Message event sent to client`);
          },
        );

        logger.info(`[Message SSE] ✅ Subscription created successfully`);

        messageEventEmitter.incrementConnections(roomId);

        // Heartbeat to keep connection alive
        heartbeatInterval = setInterval(() => {
          sendEvent("heartbeat", { timestamp: new Date() });
        }, HEARTBEAT_INTERVAL);

        // Connection timeout (serverless-friendly)
        connectionTimeout = setTimeout(() => {
          logger.info(`[Message SSE] Connection timeout for room=${roomId}`);
          cleanup();
        }, CONNECTION_TIMEOUT);

        const cleanup = async () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (connectionTimeout) clearTimeout(connectionTimeout);
          if (unsubscribe) {
            try {
              unsubscribe();
            } catch (error) {
              logger.error("[Message SSE] Error unsubscribing:", error);
            }
          }

          messageEventEmitter.decrementConnections(roomId);

          try {
            controller.close();
          } catch {
            // Connection may already be closed
          }

          logger.info(`[Message SSE] Client disconnected from room: ${roomId}`);
        };

        request.signal.addEventListener("abort", () => {
          cleanup().catch((error) => {
            logger.error("[Message SSE] Cleanup error:", error);
          });
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    logger.error("[Message SSE] Connection error:", error);
    return new Response(JSON.stringify({ error: "Authentication failed" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
