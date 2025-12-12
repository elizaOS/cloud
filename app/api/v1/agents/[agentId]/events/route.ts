import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  agentMonitoringService,
  type AgentEventResponse,
} from "@/lib/services/agent-monitoring";
import type { AgentEventType } from "@/db/repositories/agent-events";

export const dynamic = "force-dynamic";

interface EventsResponse {
  success: boolean;
  data?: {
    agentId: string;
    events: AgentEventResponse[];
    total: number;
    filters: {
      limit: number;
      since: string | null;
      types: string[] | null;
    };
  };
  error?: string;
}

const VALID_EVENT_TYPES: AgentEventType[] = [
  "inference_started",
  "inference_completed",
  "inference_failed",
  "deploy_started",
  "deploy_completed",
  "deploy_failed",
  "container_started",
  "container_stopped",
  "health_check_failed",
  "error",
  "system",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse<EventsResponse>> {
  try {
    const { agentId } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const organizationId = user.organization_id!;

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const sinceParam = searchParams.get("since");
    const typesParam = searchParams.get("types");

    const since = sinceParam ? new Date(sinceParam) : undefined;

    let types: AgentEventType[] | undefined;
    if (typesParam) {
      const requestedTypes = typesParam.split(",").map((t) => t.trim());
      types = requestedTypes.filter((t) =>
        VALID_EVENT_TYPES.includes(t as AgentEventType),
      ) as AgentEventType[];
    }

    const events = await agentMonitoringService.getAgentEvents(
      agentId,
      organizationId,
      {
        limit,
        since,
        types,
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          agentId,
          events,
          total: events.length,
          filters: {
            limit,
            since: since?.toISOString() || null,
            types: types || null,
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
    logger.error("[Agent Events API] Error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to fetch agent events";
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
