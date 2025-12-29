import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { DWSCache } from "@/lib/services/dws/cache";
import { logger } from "@/lib/utils/logger";
import { verifyResourceAccess } from "@/lib/services/resource-authorization";
import {
  SSE_HEARTBEAT_INTERVAL,
  SSE_CONNECTION_TIMEOUT_MS,
  SSE_MAX_CONNECTIONS_PER_ORG,
  SSE_BACKOFF_INITIAL_MS,
  SSE_BACKOFF_MAX_MS,
  SSE_BACKOFF_MULTIPLIER,
} from "@/lib/config/mcp";

// Next.js requires literal values for segment config exports
export const maxDuration = 300; // 5 minutes - matches default SSE_MAX_DURATION
export const dynamic = "force-dynamic";

interface SSEMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

function createCacheClient(): DWSCache {
  return new DWSCache({
    namespace: "sse-stream",
    defaultTTL: 600,
  });
}

function formatSSE(data: SSEMessage): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /api/mcp/stream?eventType=xxx&resourceId=xxx
 * Server-Sent Events endpoint for streaming real-time updates for agents, credits, or containers.
 * Implements exponential backoff and connection limits per organization.
 */
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

    // Verify the authenticated user has access to this resource
    const hasAccess = await verifyResourceAccess({
      organizationId: auth.user.organization_id!,
      userId: auth.user.id,
      eventType,
      resourceId,
    });

    if (!hasAccess) {
      logger.warn(
        `[SSE Stream] Unauthorized access attempt: user ${auth.user.id} tried to access ${eventType}:${resourceId}`,
      );
      return new NextResponse(
        JSON.stringify({
          error: "Unauthorized",
          message: "You do not have access to this resource",
        }),
        { status: 403 },
      );
    }

    // Check connection limits per organization to prevent resource exhaustion
    const dwsCache = createCacheClient();
    const connectionKey = `connections:${auth.user.organization_id}`;
    const connectionCount = await dwsCache.incr(connectionKey);
    await dwsCache.expire(connectionKey, maxDuration + 60);

    if (connectionCount > SSE_MAX_CONNECTIONS_PER_ORG) {
      await dwsCache.decr(connectionKey);
      logger.warn(
        `[SSE Stream] Connection limit exceeded for org ${auth.user.organization_id}: ${connectionCount}/${SSE_MAX_CONNECTIONS_PER_ORG}`,
      );
      return new NextResponse(
        JSON.stringify({
          error: "TooManyConnections",
          message: `Maximum ${SSE_MAX_CONNECTIONS_PER_ORG} concurrent SSE connections allowed per organization`,
          currentConnections: connectionCount - 1,
        }),
        { status: 429 },
      );
    }

    logger.info(
      `[SSE Stream] Starting stream: ${eventType}:${resourceId} for user ${auth.user.id} ` +
        `(${connectionCount}/${SSE_MAX_CONNECTIONS_PER_ORG} connections)`,
    );

    const encoder = new TextEncoder();

    type TimerId = ReturnType<typeof setTimeout>;

    const stream = new ReadableStream({
      async start(controller) {
        let isActive = true;
        let pollCount = 0;
        let pollInterval: TimerId | null = null;
        let timeoutHandle: TimerId | null = null;
        let currentBackoff = SSE_BACKOFF_INITIAL_MS;
        let consecutiveEmptyPolls = 0;

        const cleanup = async () => {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          isActive = false;

          try {
            await dwsCache.decr(connectionKey);
            logger.debug(
              `[SSE Stream] Decremented connection count for org ${auth.user.organization_id}`,
            );
          } catch (error) {
            logger.error(
              "[SSE Stream] Failed to decrement connection count:",
              error,
            );
          }
        };

        try {
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

          const poll = async (): Promise<void> => {
            if (!isActive) {
              await cleanup();
              return;
            }

            try {
              pollCount++;
              const messages = await dwsCache.lrange(channel, 0, -1);

              if (messages && messages.length > 0) {
                logger.debug(
                  `[SSE Stream] Found ${messages.length} messages in ${channel}`,
                );

                consecutiveEmptyPolls = 0;
                currentBackoff = SSE_BACKOFF_INITIAL_MS;

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

                await dwsCache.del(channel);
              } else {
                consecutiveEmptyPolls++;
                if (consecutiveEmptyPolls > 3) {
                  currentBackoff = Math.min(
                    currentBackoff * SSE_BACKOFF_MULTIPLIER,
                    SSE_BACKOFF_MAX_MS,
                  );
                  logger.debug(
                    `[SSE Stream] No messages for ${consecutiveEmptyPolls} polls, backing off to ${currentBackoff}ms`,
                  );
                }
              }

              if (pollCount % SSE_HEARTBEAT_INTERVAL === 0) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE({
                      type: "heartbeat",
                      data: {
                        pollCount,
                        active: isActive,
                        backoff: currentBackoff,
                      },
                      timestamp: new Date().toISOString(),
                    }),
                  ),
                );
              }

              if (isActive) {
                pollInterval = setTimeout(poll, currentBackoff);
              }
            } catch (error) {
              logger.error("[SSE Stream] Polling error:", error);
              try {
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
              } catch (enqueueError) {
                logger.error(
                  "[SSE Stream] Failed to enqueue error:",
                  enqueueError,
                );
                await cleanup();
                try {
                  controller.close();
                } catch { /* already closed */ }
                return;
              }

              if (isActive) {
                pollInterval = setTimeout(poll, currentBackoff);
              }
            }
          };

          poll();

          request.signal.addEventListener("abort", async () => {
            await cleanup();
            logger.info(
              `[SSE Stream] Client disconnected: ${eventType}:${resourceId}`,
            );
            try {
              controller.close();
            } catch { /* already closed */ }
          });

          timeoutHandle = setTimeout(async () => {
            await cleanup();
            logger.info(
              `[SSE Stream] Timeout reached: ${eventType}:${resourceId}`,
            );
            try {
              controller.close();
            } catch { /* already closed */ }
          }, SSE_CONNECTION_TIMEOUT_MS);
        } catch (error) {
          cleanup();
          logger.error("[SSE Stream] Stream setup error:", error);
          try {
            controller.error(error);
          } catch { /* already closed */ }
        }
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
