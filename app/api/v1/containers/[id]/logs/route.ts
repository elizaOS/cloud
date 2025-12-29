import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getContainer } from "@/lib/services/containers";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  type OutputLogEvent,
  createObservabilityClient,
} from "@/lib/services/dws/observability";

export const dynamic = "force-dynamic";

import type { LogLevel, ParsedLogEntry } from "@/lib/types/containers";

/**
 * GET /api/v1/containers/[id]/logs
 * Retrieves container logs from DWS Observability.
 * Supports filtering by log level, time range, and pagination.
 *
 * @param request - Request with optional limit, since, and level query parameters.
 * @param params - Route parameters containing the container ID.
 * @returns Parsed log entries with metadata.
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
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Check if container has been deployed
    if (!container.ecs_service_arn) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Container has not been deployed yet. Logs will be available once deployment is complete.",
        },
        { status: 400 },
      );
    }

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "100");
    const since = searchParams.get("since"); // ISO timestamp
    const level = searchParams.get("level") || "all"; // Log level filter

    // Get logs from DWS Observability
    const rawLogs = await getDWSLogs(
      container.organization_id,
      container.project_name,
      container.id,
      {
        limit,
        since: since ? new Date(since) : undefined,
        level: level !== "all" ? (level as LogLevel) : undefined,
      },
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
    const isAuthError =
      error instanceof Error &&
      (error.message.includes("authentication") ||
        error.message.includes("Unauthorized"));

    logger.error("Error fetching container logs:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch container logs",
      },
      { status: isAuthError ? 401 : 500 },
    );
  }
}

/**
 * Parse a raw log message into a structured log entry
 */
function parseLogMessage(raw: {
  timestamp: string;
  message: string;
}): ParsedLogEntry {
  const timestamp = new Date(raw.timestamp);
  const message = raw.message.trim();

  // Try to extract log level from message
  const level = detectLogLevel(message);

  // Try to parse as JSON for structured logs
  try {
    // Check if the message looks like JSON
    if (message.startsWith("{") && message.endsWith("}")) {
      const parsed = JSON.parse(message);
      return {
        timestamp,
        message: parsed.message || parsed.msg || message,
        level: parsed.level || parsed.severity || level,
        raw: message,
        source: parsed.source || parsed.service || undefined,
        metadata: {
          ...parsed,
          message: undefined,
          msg: undefined,
          level: undefined,
          severity: undefined,
          source: undefined,
          service: undefined,
          timestamp: undefined,
        },
      };
    }
  } catch {
    // Not JSON, continue with plain text parsing
  }

  // Handle common log formats like "[INFO] message" or "2024-01-01 INFO: message"
  const logPatterns = [
    // [LEVEL] message
    /^\[?(DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\]?\s*:?\s*(.+)/i,
    // timestamp LEVEL message
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\s*(DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s*:?\s*(.+)/i,
    // Pino-style
    /^\{"level":"?(DEBUG|INFO|WARN|WARNING|ERROR|FATAL)"?.*"msg":"([^"]+)"/i,
  ];

  for (const pattern of logPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        timestamp,
        message: match[2],
        level: normalizeLogLevel(match[1]),
        raw: message,
      };
    }
  }

  // Default: return as-is with detected level
  return {
    timestamp,
    message,
    level,
    raw: message,
  };
}

/**
 * Normalize log level string to standard format
 */
function normalizeLogLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  if (normalized === "warning") return "warn";
  if (normalized === "fatal") return "error";
  if (["debug", "info", "warn", "error"].includes(normalized)) {
    return normalized as LogLevel;
  }
  return "info";
}

/**
 * Detect log level from message content
 */
function detectLogLevel(message: string): LogLevel {
  const normalized = message.toLowerCase();

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
 * Get logs from DWS Observability for a container
 */
async function getDWSLogs(
  organizationId: string,
  projectName: string,
  containerId: string,
  options: {
    limit?: number;
    since?: Date;
    level?: LogLevel;
  },
): Promise<
  Array<{
    timestamp: string;
    message: string;
  }>
> {
  const obs = createObservabilityClient();

  try {
    const result = await obs.getLogs({
      containerId: `${organizationId}-${projectName}-${containerId}`,
      startTime: options.since,
      limit: options.limit ?? 100,
      level: options.level?.toUpperCase() as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | undefined,
    });

    return result.logs.map((log) => ({
      timestamp: log.timestamp.toISOString(),
      message: log.message,
    }));
  } catch (error) {
    logger.error("Error fetching DWS logs:", error);
    return [];
  }
}
