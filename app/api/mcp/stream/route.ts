import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface SSEMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

async function getRedisSubscriber(): Promise<Redis> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    throw new Error("Redis credentials not configured");
  }

  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

function formatSSE(data: SSEMessage): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthOrApiKey(request);
    const { searchParams } = new URL(request.url);

    const eventType = searchParams.get("eventType");
    const resourceId = searchParams.get("resourceId");

    if (!eventType || !resourceId) {
      return new NextResponse(
        JSON.stringify({ error: "Missing eventType or resourceId" }),
        { status: 400 },
      );
    }

    logger.info(
      `[SSE Stream] Starting stream: ${eventType}:${resourceId} for user ${auth.user.id}`,
    );

    const encoder = new TextEncoder();
    const redis = await getRedisSubscriber();

    const stream = new ReadableStream({
      async start(controller) {
        let isActive = true;
        let pollCount = 0;

        const channel = buildChannelName(eventType, resourceId);
        logger.info(`[SSE Stream] Polling channel: ${channel}`);

        controller.enqueue(
          encoder.encode(
            formatSSE({
              type: "connected",
              data: { channel, eventType, resourceId },
              timestamp: new Date().toISOString(),
            }),
          ),
        );

        const pollInterval = setInterval(async () => {
          if (!isActive) {
            clearInterval(pollInterval);
            return;
          }

          try {
            pollCount++;
            const messages = await redis.lrange(channel, 0, -1);

            if (messages && messages.length > 0) {
              logger.debug(
                `[SSE Stream] Found ${messages.length} messages in ${channel}`,
              );

              for (const message of messages) {
                const parsed =
                  typeof message === "string" ? JSON.parse(message) : message;
                const sseData = formatSSE({
                  type: parsed.type || eventType,
                  data: parsed.data || parsed,
                  timestamp: parsed.timestamp || new Date().toISOString(),
                });
                controller.enqueue(encoder.encode(sseData));
              }

              await redis.del(channel);
            }

            if (pollCount % 30 === 0) {
              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: "heartbeat",
                    data: { pollCount, active: isActive },
                    timestamp: new Date().toISOString(),
                  }),
                ),
              );
            }
          } catch (error) {
            logger.error("[SSE Stream] Polling error:", error);
            controller.enqueue(
              encoder.encode(
                formatSSE({
                  type: "error",
                  data: {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Polling error",
                  },
                  timestamp: new Date().toISOString(),
                }),
              ),
            );
          }
        }, 500);

        request.signal.addEventListener("abort", () => {
          isActive = false;
          clearInterval(pollInterval);
          logger.info(
            `[SSE Stream] Client disconnected: ${eventType}:${resourceId}`,
          );
          controller.close();
        });

        setTimeout(
          () => {
            isActive = false;
            clearInterval(pollInterval);
            logger.info(
              `[SSE Stream] Timeout reached: ${eventType}:${resourceId}`,
            );
            controller.close();
          },
          5 * 60 * 1000,
        );
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
    logger.error("[SSE Stream] Setup error:", error);
    return new NextResponse(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to establish SSE stream",
      }),
      { status: 500 },
    );
  }
}

function buildChannelName(eventType: string, resourceId: string): string {
  switch (eventType) {
    case "agent":
      return `agent:events:${resourceId}:queue`;
    case "credits":
      return `credits:${resourceId}:queue`;
    case "container":
      return `container:logs:${resourceId}:queue`;
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}
