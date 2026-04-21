import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Content-Type must be application/json" },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }
    const body = await request.text();
    if (body.length > 1_048_576) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Request body too large" }, { status: 413 }),
        CORS_METHODS,
      );
    }
    const agentResponse = await elizaSandboxService.proxyLifeOpsScheduleRequest(
      agentId,
      user.organization_id,
      "observations",
      "POST",
      body,
    );
    if (!agentResponse) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent is not running or unreachable" },
          { status: 503 },
        ),
        CORS_METHODS,
      );
    }
    const responseBody = await agentResponse.text();
    const responseType = agentResponse.headers.get("content-type") ?? "application/json";
    return applyCorsHeaders(
      new Response(responseBody, {
        status: agentResponse.status,
        headers: { "Content-Type": responseType },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
