import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * Proxy handler for both GET and POST wallet requests.
 *
 * Incoming URL pattern:
 *   /api/v1/milady/agents/[agentId]/api/wallet/[...path]
 *
 * Proxied to the agent at:
 *   {bridge_url}/api/wallet/{path}
 *
 * This allows the homepage dashboard (via CloudApiClient) to reach wallet
 * endpoints on agents running in Docker containers, authenticated by the
 * cloud API key and authorization-checked against the user's organization.
 */
async function proxyToAgent(
  request: NextRequest,
  params: Promise<{ agentId: string; path: string[] }>,
  method: "GET" | "POST",
): Promise<Response> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId, path } = await params;

    // Use only the first path segment (e.g. ["steward-policies"] → "steward-policies")
    // Reject multi-segment paths to prevent path traversal
    if (path.length !== 1 || path[0].includes("..")) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Invalid wallet path" },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }
    const walletPath = path[0];

    // Forward validated query string (e.g. ?limit=20 for steward-tx-records)
    const query = request.nextUrl.search
      ? request.nextUrl.search.slice(1)
      : undefined;

    // Read POST body if present (with size limit and content-type check)
    let body: string | null = null;
    if (method === "POST") {
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
      body = await request.text();
      if (body.length > 1_048_576) {
        return applyCorsHeaders(
          NextResponse.json(
            { success: false, error: "Request body too large" },
            { status: 413 },
          ),
          CORS_METHODS,
        );
      }
    }

    logger.info("[wallet-proxy] Request", {
      agentId,
      orgId: user.organization_id,
      walletPath,
      method,
    });

    const agentResponse = await miladySandboxService.proxyWalletRequest(
      agentId,
      user.organization_id,
      walletPath,
      method,
      body,
      query,
    );

    if (!agentResponse) {
      logger.warn("[wallet-proxy] Proxy returned null", {
        agentId,
        orgId: user.organization_id,
        walletPath,
      });
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent is not running or unreachable" },
          { status: 503 },
        ),
        CORS_METHODS,
      );
    }

    // Forward status + body from agent response directly
    const responseBody = await agentResponse.text();
    const contentType =
      agentResponse.headers.get("content-type") ?? "application/json";

    return applyCorsHeaders(
      new Response(responseBody, {
        status: agentResponse.status,
        headers: { "Content-Type": contentType },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; path: string[] }> },
) {
  return proxyToAgent(request, params, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; path: string[] }> },
) {
  return proxyToAgent(request, params, "POST");
}
