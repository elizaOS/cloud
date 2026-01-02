import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getContainer } from "@/lib/services/containers";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  type OutputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";

export const dynamic = "force-dynamic";

import type { LogLevel, ParsedLogEntry } from "@/lib/types/containers";

/**
 * GET /api/v1/containers/[id]/logs
 * Retrieves container logs from AWS CloudWatch.
 * Supports filtering by log level, time range, and pagination.
 *
 * @param request - Request with optional limit, since, and level query parameters.
 * @param params - Route parameters containing the container ID.
 * @returns Parsed log entries with metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify container belongs to user's organization
    const container = await getContainer(id, user.organization_id!);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 }
      );
    }

    // Check if container has been deployed to ECS
    if (!container.ecs_service_arn) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Container has not been deployed to ECS yet. Logs will be available once deployment is complete.",
        },
        { status: 400 }
      );
    }

    // Parse query parameters for filtering with bounds validation
    const searchParams = request.nextUrl.searchParams;
    const MAX_LOG_LIMIT = 500;
    const rawLimit = Number.parseInt(searchParams.get("limit") || "100", 10);
    const limit = Math.min(
      Math.max(Number.isNaN(rawLimit) ? 100 : rawLimit, 1),
      MAX_LOG_LIMIT
    );
    const since = searchParams.get("since"); // ISO timestamp
    const level = searchParams.get("level") || "all"; // Log level filter

    // Get logs from CloudWatch
    // Log group uses organization_id + project_name to match CloudFormation naming
    const rawLogs = await getCloudWatchLogs(
      container.organization_id,
      container.project_name,
      {
        limit,
        since: since ? new Date(since) : undefined,
      }
    );

    // Parse and filter logs
    const parsedLogs = rawLogs
      .map((log) => parseLogMessage(log))
      .filter((log) => level === "all" || log.level === level);

    // Return success even if no logs (empty logs is valid, not an error)
    return NextResponse.json({
      success: true,
      data: {
        container: {
          id: container.id,
          name: container.name,
          status: container.status,
          ecs_service_arn: container.ecs_service_arn,
        },
        logs: parsedLogs,
        total: parsedLogs.length,
        hasLogs: rawLogs.length > 0,
        message:
          rawLogs.length === 0
            ? "No logs available yet. Logs may take a few moments to appear after deployment."
            : undefined,
        filters: {
          limit,
          since,
          level,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching container logs:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch container logs",
      },
      { status: 500 }
    );
  }
}

/**
 * Parse a log message to extract level, clean message, and metadata
 * Handles various log formats:
 * - [ERROR] message
 * - ERROR: message
 * - {"level":"error","message":"..."}
 * - Plain text (defaults to info)
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
    // Avoid matching URLs
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
 * PRODUCTION FIX: Dynamically discovers log streams instead of hardcoding
 * Uses organization ID + project name to match CloudFormation log group naming
 */
async function getCloudWatchLogs(
  organizationId: string,
  projectName: string,
  options: {
    limit?: number;
    since?: Date;
  }
): Promise<
  Array<{
    timestamp: string;
    message: string;
  }>
> {
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

  // Log group names - try new format first, then old format for backwards compatibility
  const newLogGroupName = `/ecs/elizaos-${organizationId}-${projectName}`;
  const oldLogGroupName = `/ecs/elizaos-user-${organizationId}`;

  // Try new format first
  let logGroupName = newLogGroupName;

  try {
    // First, discover the latest log streams
    const { DescribeLogStreamsCommand } =
      await import("@aws-sdk/client-cloudwatch-logs");

    const streamsResponse = await client.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: "LastEventTime",
        descending: true,
        limit: 5, // Get up to 5 most recent streams
      })
    );

    const logStreams = streamsResponse.logStreams || [];

    if (logStreams.length === 0) {
      console.warn(`No log streams found for ${logGroupName}`);
      return [];
    }

    // Aggregate logs from all recent streams (in case of task restarts)
    const allLogs: Array<{ timestamp: string; message: string }> = [];

    for (const stream of logStreams) {
      if (!stream.logStreamName) continue;

      try {
        const command = new GetLogEventsCommand({
          logGroupName,
          logStreamName: stream.logStreamName,
          limit: Math.ceil((options.limit || 100) / logStreams.length),
          startTime: options.since?.getTime(),
          startFromHead: false, // Get most recent logs first
        });

        const response = await client.send(command);
        const events = response.events || [];

        allLogs.push(
          ...events.map((event: OutputLogEvent) => ({
            timestamp: new Date(event.timestamp || 0).toISOString(),
            message: event.message || "",
          }))
        );
      } catch (streamError) {
        console.warn(
          `Failed to fetch logs from stream ${stream.logStreamName}:`,
          streamError
        );
        // Continue with other streams
      }
    }

    // Sort by timestamp descending and limit
    return allLogs
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, options.limit || 100);
  } catch (error) {
    // If new log group format not found, try old format for backwards compatibility
    if (
      error instanceof Error &&
      error.name === "ResourceNotFoundException" &&
      logGroupName === newLogGroupName
    ) {
      console.warn(
        `Log group ${newLogGroupName} not found, trying old format: ${oldLogGroupName}`
      );
      logGroupName = oldLogGroupName;

      // Retry with old format
      try {
        const { DescribeLogStreamsCommand } =
          await import("@aws-sdk/client-cloudwatch-logs");

        const streamsResponse = await client.send(
          new DescribeLogStreamsCommand({
            logGroupName: oldLogGroupName,
            orderBy: "LastEventTime",
            descending: true,
            limit: 5,
          })
        );

        const logStreams = streamsResponse.logStreams || [];
        if (logStreams.length === 0) {
          console.warn(`No log streams found for ${oldLogGroupName}`);
          return [];
        }

        const allLogs: Array<{ timestamp: string; message: string }> = [];

        for (const stream of logStreams) {
          if (!stream.logStreamName) continue;

          try {
            const command = new GetLogEventsCommand({
              logGroupName: oldLogGroupName,
              logStreamName: stream.logStreamName,
              limit: Math.ceil((options.limit || 100) / logStreams.length),
              startTime: options.since?.getTime(),
              startFromHead: false,
            });

            const response = await client.send(command);
            const events = response.events || [];

            allLogs.push(
              ...events.map((event: OutputLogEvent) => ({
                timestamp: new Date(event.timestamp || 0).toISOString(),
                message: event.message || "",
              }))
            );
          } catch (streamError) {
            console.warn(
              `Failed to fetch logs from stream ${stream.logStreamName}:`,
              streamError
            );
          }
        }

        return allLogs
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, options.limit || 100);
      } catch (oldFormatError) {
        console.warn(`Old log group format also not found: ${oldLogGroupName}`);
        return [];
      }
    }

    logger.error("Error fetching CloudWatch logs:", error);
    return [];
  }
}
