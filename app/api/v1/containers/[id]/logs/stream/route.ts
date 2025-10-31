import { NextRequest } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getContainer } from "@/lib/services";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  type OutputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LogLevel = "error" | "warn" | "info" | "debug";

interface ParsedLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * GET /api/v1/containers/[id]/logs/stream
 * Stream container logs in real-time using Server-Sent Events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKey(request);

    // Verify container belongs to user's organization
    const container = await getContainer(id, user.organization_id);

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

    // Check if container has been deployed to ECS
    if (!container.ecs_service_arn) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Container has not been deployed to ECS yet. Logs will be available once deployment is complete.",
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

    // Create a ReadableStream for Server-Sent Events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let lastTimestamp: number | undefined;

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
            const newLogs = await getCloudWatchLogs(
              container.name,
              {
                limit: 50,
                since: lastTimestamp ? new Date(lastTimestamp + 1) : undefined,
              },
              level,
            );

            if (newLogs.length > 0) {
              // Update last timestamp
              const timestamps = newLogs
                .map((log) => new Date(log.timestamp).getTime())
                .filter((t) => !isNaN(t));

              if (timestamps.length > 0) {
                lastTimestamp = Math.max(...timestamps);
              }

              // Send each log as a separate event
              for (const log of newLogs) {
                sendEvent({
                  type: "log",
                  data: log,
                });
              }
            }
          } catch (error) {
            console.error("Error streaming logs:", error);
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
    console.error("Error setting up log stream:", error);
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
 * Parse a log message to extract level, clean message, and metadata
 */
function parseLogMessage(log: {
  timestamp: string;
  message: string;
}): ParsedLogEntry {
  const { timestamp, message } = log;
  let level: LogLevel = "info";
  let cleanMessage = message.trim();
  let metadata: Record<string, unknown> | undefined;

  // Try to parse as JSON first
  if (cleanMessage.startsWith("{")) {
    try {
      const parsed = JSON.parse(cleanMessage);
      if (parsed.level) {
        level = normalizeLogLevel(parsed.level);
      }
      if (parsed.message) {
        cleanMessage = parsed.message;
      }
      // Extract other fields as metadata
      const { level: _levelField, message: _messageField, ...rest } = parsed;
      if (Object.keys(rest).length > 0) {
        metadata = rest;
      }
      return { timestamp, level, message: cleanMessage, metadata };
    } catch {
      // Not valid JSON, continue with text parsing
    }
  }

  // Check for [LEVEL] prefix (e.g., [ERROR], [INFO])
  const bracketMatch = cleanMessage.match(/^\[(\w+)\]\s*(.*)$/);
  if (bracketMatch) {
    level = normalizeLogLevel(bracketMatch[1]);
    cleanMessage = bracketMatch[2];
    return { timestamp, level, message: cleanMessage };
  }

  // Check for LEVEL: prefix (e.g., ERROR:, INFO:)
  const colonMatch = cleanMessage.match(/^(\w+):\s*(.*)$/);
  if (colonMatch && colonMatch[1].length <= 8) {
    level = normalizeLogLevel(colonMatch[1]);
    cleanMessage = colonMatch[2];
    return { timestamp, level, message: cleanMessage };
  }

  // Check for common error patterns
  if (
    cleanMessage.toLowerCase().includes("error") ||
    cleanMessage.toLowerCase().includes("exception") ||
    cleanMessage.toLowerCase().includes("failed")
  ) {
    level = "error";
  } else if (
    cleanMessage.toLowerCase().includes("warn") ||
    cleanMessage.toLowerCase().includes("warning")
  ) {
    level = "warn";
  } else if (
    cleanMessage.toLowerCase().includes("debug") ||
    cleanMessage.toLowerCase().includes("trace")
  ) {
    level = "debug";
  }

  return { timestamp, level, message: cleanMessage };
}

/**
 * Normalize various log level strings to our standard levels
 */
function normalizeLogLevel(levelStr: string): LogLevel {
  const normalized = levelStr.toLowerCase();
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

/**
 * Get logs from CloudWatch for a container
 */
async function getCloudWatchLogs(
  containerName: string,
  options: {
    limit?: number;
    since?: Date;
  },
  levelFilter: string = "all",
): Promise<ParsedLogEntry[]> {
  const region = process.env.AWS_REGION || "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not configured");
  }

  const client = new CloudWatchLogsClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const logGroupName = `/ecs/elizaos-user-${containerName}`;

  try {
    const { DescribeLogStreamsCommand } = await import(
      "@aws-sdk/client-cloudwatch-logs"
    );

    const streamsResponse = await client.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: "LastEventTime",
        descending: true,
        limit: 5,
      }),
    );

    const logStreams = streamsResponse.logStreams || [];

    if (logStreams.length === 0) {
      return [];
    }

    const allLogs: Array<{ timestamp: string; message: string }> = [];

    for (const stream of logStreams) {
      if (!stream.logStreamName) continue;

      try {
        const command = new GetLogEventsCommand({
          logGroupName,
          logStreamName: stream.logStreamName,
          limit: Math.ceil((options.limit || 50) / logStreams.length),
          startTime: options.since?.getTime(),
          startFromHead: false,
        });

        const response = await client.send(command);
        const events = response.events || [];

        allLogs.push(
          ...events.map((event: OutputLogEvent) => ({
            timestamp: new Date(event.timestamp || 0).toISOString(),
            message: event.message || "",
          })),
        );
      } catch (streamError) {
        console.warn(
          `Failed to fetch logs from stream ${stream.logStreamName}:`,
          streamError,
        );
      }
    }

    // Parse logs and filter by level
    const parsedLogs = allLogs
      .map((log) => parseLogMessage(log))
      .filter((log) => levelFilter === "all" || log.level === levelFilter);

    // Sort by timestamp descending
    return parsedLogs
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, options.limit || 50);
  } catch (error) {
    console.error("Error fetching CloudWatch logs:", error);
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      console.warn(
        `Log group ${logGroupName} not found - container may not be deployed yet`,
      );
    }
    return [];
  }
}
