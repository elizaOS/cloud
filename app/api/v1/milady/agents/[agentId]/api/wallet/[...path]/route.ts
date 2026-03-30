import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

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

    // Reconstruct the wallet sub-path (e.g. ["steward-policies"] → "steward-policies")
    const walletPath = path.join("/");

    // Forward the raw query string (e.g. ?limit=20 for steward-tx-records)
    const query = request.nextUrl.search ? request.nextUrl.search.slice(1) : undefined;

    // Read POST body if present
    let body: string | null = null;
    if (method === "POST") {
      body = await request.text();
    }

    const agentResponse = await miladySandboxService.proxyWalletRequest(
      agentId,
      user.organization_id,
      walletPath,
      method,
      body,
      query,
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

    // Forward status + body from agent response directly
    const responseBody = await agentResponse.text();
    const contentType = agentResponse.headers.get("content-type") ?? "application/json";

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
