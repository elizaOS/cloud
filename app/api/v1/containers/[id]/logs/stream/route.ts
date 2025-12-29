import { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getContainer } from "@/lib/services/containers";
import { DWSObservability, type LogEntry } from "@/lib/services/dws/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import type { LogLevel, ParsedLogEntry } from "@/lib/types/containers";

/**
 * GET /api/v1/containers/[id]/logs/stream
 * Streams container logs in real-time using Server-Sent Events (SSE).
 * Uses DWS observability service for log retrieval.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify container belongs to user's organization
    const container = await getContainer(id, user.organization_id!);

    if (!container) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Container not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if container has been deployed
    if (!container.dws_container_id && !container.ecs_service_arn) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Container has not been deployed yet. Logs will be available once deployment is complete.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get("level") || "all";

    // Create observability client
    const observability = new DWSObservability();
    const containerId = container.dws_container_id || container.id;

    // Create a ReadableStream for Server-Sent Events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let lastTimestamp: Date | undefined;

        const sendEvent = (data: unknown) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const sendKeepAlive = () => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        };

        // Keep-alive interval (every 15 seconds)
        const keepAliveInterval = setInterval(sendKeepAlive, 15000);

        // Poll for new logs every 2 seconds
        const pollInterval = setInterval(async () => {
          try {
            const result = await observability.getLogs({
              containerId,
              startTime: lastTimestamp,
              level: level !== "all" ? (level.toUpperCase() as LogEntry["level"]) : undefined,
              limit: 50,
            });

            if (result.logs.length > 0) {
              // Update last timestamp
              const timestamps = result.logs
                .map((log) => log.timestamp.getTime())
                .filter((t) => !isNaN(t));

              if (timestamps.length > 0) {
                lastTimestamp = new Date(Math.max(...timestamps) + 1);
              }

              // Send each log as a separate event
              for (const log of result.logs) {
                const parsedLog = parseLogEntry(log);
                if (level === "all" || parsedLog.level === level) {
                  sendEvent({
                    type: "log",
                    data: parsedLog,
                  });
                }
              }
            }
          } catch (error) {
            logger.error("Error streaming logs:", error);
            sendEvent({
              type: "error",
              message:
                error instanceof Error ? error.message : "Failed to fetch logs",
            });
          }
        }, 2000);

        // Clean up on close
        request.signal.addEventListener("abort", () => {
          clearInterval(pollInterval);
          clearInterval(keepAliveInterval);
          controller.close();
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
    logger.error("Error setting up log stream:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to set up log stream",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * Parse a DWS log entry to our standard format
 */
function parseLogEntry(log: LogEntry): ParsedLogEntry {
  return {
    timestamp: log.timestamp.toISOString(),
    level: normalizeLogLevel(log.level),
    message: log.message,
    metadata: log.metadata,
  };
}

/**
 * Normalize log level to our standard levels
 */
function normalizeLogLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  if (normalized.includes("err") || normalized.includes("fatal")) {
    return "error";
  }
  if (normalized.includes("warn")) {
    return "warn";
  }
  if (normalized.includes("debug") || normalized.includes("trace")) {
    return "debug";
  }
  return "info";
}
