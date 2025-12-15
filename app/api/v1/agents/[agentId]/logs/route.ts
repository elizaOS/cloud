import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  agentMonitoringService,
  type AgentLogEntry,
} from "@/lib/services/agent-monitoring";
import type { AgentLogLevel } from "@/db/repositories/agent-events";

export const dynamic = "force-dynamic";

interface LogsResponse {
  success: boolean;
  data?: {
    agentId: string;
    logs: AgentLogEntry[];
    total: number;
    filters: {
      limit: number;
      since: string | null;
      level: string | null;
    };
  };
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse<LogsResponse>> {
  try {
    const { agentId } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const organizationId = user.organization_id!;

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const sinceParam = searchParams.get("since");
    const level = searchParams.get("level") as AgentLogLevel | null;

    const since = sinceParam ? new Date(sinceParam) : undefined;

    const logs = await agentMonitoringService.getAgentLogs(
      agentId,
      organizationId,
      {
        limit,
        since,
        level: level || undefined,
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          agentId,
          logs,
          total: logs.length,
          filters: {
            limit,
            since: since?.toISOString() || null,
            level,
          },
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    logger.error("[Agent Logs API] Error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to fetch agent logs";
    const status = message === "Agent not found" ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    );
  }
}
