/**
 * External Service Proxy
 *
 * Proxies requests to external ERC-8004 registered services.
 * This provides a secure way for Eliza agents to interact with
 * external services while:
 * - Validating the target service is registered on ERC-8004
 * - Handling credit deduction for the caller
 * - Logging and monitoring external calls
 *
 * @route POST /api/v1/discovery/proxy
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { agent0Service } from "@/lib/services/agent0";
import { creditsService } from "@/lib/services/credits";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

// ============================================================================
// Request Validation
// ============================================================================

const requestSchema = z.object({
  /** ERC-8004 agent ID in format "chainId:tokenId" */
  agentId: z.string().regex(/^\d+:\d+$/, "Invalid agentId format. Use 'chainId:tokenId'"),

  /** Endpoint type to call */
  endpointType: z.enum(["mcp", "a2a"]),

  /** Request body to forward */
  body: z.record(z.unknown()),

  /** Optional headers to forward */
  headers: z.record(z.string()).optional(),
});

// Cost for proxying external requests (covers overhead)
const PROXY_COST_CREDITS = 0.1;

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const orgId = authResult.user.organization_id;

  // Rate limit
  const rateLimitKey = `discovery:proxy:${orgId}`;
  const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 30);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "Too many proxy requests. Max 30 per minute.",
        retryAfter: Math.ceil((rateLimit.retryAfter ?? 60) / 1000),
      },
      { status: 429 }
    );
  }

  // Parse and validate request
  const json = await request.json();
  const parseResult = requestSchema.safeParse(json);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const { agentId, endpointType, body, headers: customHeaders } = parseResult.data;

  // Validate the target agent is registered on ERC-8004
  const agent = await agent0Service.getAgentCached(agentId);
  if (!agent) {
    return NextResponse.json(
      {
        error: "agent_not_found",
        message: `Agent ${agentId} not found in ERC-8004 registry`,
      },
      { status: 404 }
    );
  }

  if (!agent.active) {
    return NextResponse.json(
      {
        error: "agent_inactive",
        message: `Agent ${agentId} is not active`,
      },
      { status: 400 }
    );
  }

  // Get the appropriate endpoint
  const endpoint =
    endpointType === "mcp" ? agent.mcpEndpoint : agent.a2aEndpoint;

  if (!endpoint) {
    return NextResponse.json(
      {
        error: "endpoint_not_available",
        message: `Agent ${agentId} does not have an ${endpointType.toUpperCase()} endpoint`,
      },
      { status: 400 }
    );
  }

  // Deduct credits for the proxy call
  const deductResult = await creditsService.deductCredits({
    organizationId: orgId,
    amount: PROXY_COST_CREDITS,
    description: `External service proxy: ${agent.name} (${endpointType.toUpperCase()})`,
    metadata: {
      agentId,
      agentName: agent.name,
      endpointType,
      endpoint,
    },
  });

  if (!deductResult.success) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: "Not enough credits for proxy request",
        required: PROXY_COST_CREDITS,
        balance: deductResult.balance,
      },
      { status: 402 }
    );
  }

  // Forward the request to the external service
  logger.info("[DiscoveryProxy] Forwarding request", {
    agentId,
    agentName: agent.name,
    endpointType,
    endpoint,
    orgId,
  });

  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "ElizaCloud/1.0",
    "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? "unknown",
    ...customHeaders,
  };

  // Handle x402 payment if the external service requires it
  if (agent.x402Support) {
    // For now, we just note that x402 is required
    // Full x402 integration would add payment headers here
    proxyHeaders["X-402-Aware"] = "true";
  }

  const startTime = Date.now();

  const externalResponse = await fetch(endpoint, {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify(body),
  });

  const duration = Date.now() - startTime;

  logger.info("[DiscoveryProxy] External response received", {
    agentId,
    status: externalResponse.status,
    duration,
  });

  // Forward the response
  const responseBody = await externalResponse.text();

  // Parse response if JSON
  let parsedBody: unknown;
  const contentType = externalResponse.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    parsedBody = JSON.parse(responseBody);
  } else {
    parsedBody = responseBody;
  }

  return NextResponse.json(
    {
      success: externalResponse.ok,
      status: externalResponse.status,
      agent: {
        id: agentId,
        name: agent.name,
        x402Support: agent.x402Support,
      },
      response: parsedBody,
      meta: {
        duration,
        endpoint,
        creditsCharged: PROXY_COST_CREDITS,
      },
    },
    { status: externalResponse.ok ? 200 : 502 }
  );
}

/**
 * Get information about the proxy endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/v1/discovery/proxy",
    description:
      "Proxy requests to external ERC-8004 registered services",
    usage: {
      method: "POST",
      body: {
        agentId: "string - ERC-8004 agent ID (format: chainId:tokenId)",
        endpointType: "'mcp' | 'a2a' - Type of endpoint to call",
        body: "object - Request body to forward",
        headers: "object (optional) - Custom headers to forward",
      },
    },
    cost: `${PROXY_COST_CREDITS} credits per request`,
    rateLimit: "30 requests per minute",
  });
}

