import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  agentMonitoringService,
  type AgentStatusResponse,
} from "@/lib/services/agent-monitoring";

export const dynamic = "force-dynamic";

interface StatusApiResponse {
  success: boolean;
  data?: AgentStatusResponse;
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse<StatusApiResponse>> {
  try {
    const { agentId } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const organizationId = user.organization_id!;

    const status = await agentMonitoringService.getAgentStatus(
      agentId,
      organizationId
    );

    return NextResponse.json(
      {
        success: true,
        data: status,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[Agent Status API] Error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to fetch agent status";
    const status = message === "Agent not found" ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
