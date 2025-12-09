/**
 * External Service Proxy
 *
 * Proxies requests to external ERC-8004 registered services (MCP/A2A).
 * Provides:
 * - Service validation (verify service is registered on ERC-8004)
 * - Credit management (deduct credits for requests)
 * - Rate limiting
 * - Request/response logging
 *
 * @route POST /api/v1/external-service
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
  /** Service ID (agentId format: chainId:tokenId) or service endpoint URL */
  serviceId: z.string(),

  /** Type of service to call */
  serviceType: z.enum(["mcp", "a2a"]),

  /** Request payload to forward to the service */
  payload: z.record(z.unknown()),

  /** Optional: Override the endpoint (if not using registered endpoint) */
  endpoint: z.string().url().optional(),

  /** Timeout in milliseconds (default: 30000) */
  timeout: z.number().int().min(1000).max(120000).optional().default(30000),
});

// Cost for proxying external service requests
const PROXY_REQUEST_COST = 0.5; // 0.5 credits per request

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { user } = authResult;
  const organizationId = user.organization_id;

  // Rate limiting
  const rateLimitKey = `external-service:${organizationId}`;
  const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 60); // 60 requests per minute

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.retryAfter || 60) / 1000)} seconds.`,
      },
      { status: 429 }
    );
  }

  // Parse and validate request
  const body = await request.json();
  const parseResult = requestSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const { serviceId, serviceType, payload, endpoint, timeout } = parseResult.data;

  // Determine service endpoint
  let targetEndpoint = endpoint;

  if (!targetEndpoint) {
    // Look up service from ERC-8004 registry
    const service = await agent0Service.getAgentCached(serviceId);

    if (!service) {
      return NextResponse.json(
        { error: "Service not found", serviceId },
        { status: 404 }
      );
    }

    if (!service.active) {
      return NextResponse.json(
        { error: "Service is not active", serviceId },
        { status: 400 }
      );
    }

    targetEndpoint =
      serviceType === "mcp" ? service.mcpEndpoint : service.a2aEndpoint;

    if (!targetEndpoint) {
      return NextResponse.json(
        {
          error: `Service does not have a ${serviceType.toUpperCase()} endpoint`,
          serviceId,
        },
        { status: 400 }
      );
    }
  }

  // Check credits
  const balance = await creditsService.getBalance(organizationId);
  if (balance.credits < PROXY_REQUEST_COST) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        required: PROXY_REQUEST_COST,
        available: balance.credits,
      },
      { status: 402 }
    );
  }

  // Deduct credits before making the request
  const deductResult = await creditsService.deductCredits({
    organizationId,
    amount: PROXY_REQUEST_COST,
    description: `External service proxy: ${serviceId}`,
    metadata: {
      serviceId,
      serviceType,
      endpoint: targetEndpoint,
    },
  });

  if (!deductResult.success) {
    return NextResponse.json(
      { error: "Failed to deduct credits" },
      { status: 500 }
    );
  }

  // Make the request to the external service
  const startTime = Date.now();

  logger.info("[ExternalServiceProxy] Forwarding request", {
    serviceId,
    serviceType,
    endpoint: targetEndpoint,
    organizationId,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  let responseBody: unknown;
  let success = false;

  try {
    response = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ElizaCloud-ExternalServiceProxy/1.0",
        // Forward x402 payment header if present
        ...(request.headers.get("X-402-Payment") && {
          "X-402-Payment": request.headers.get("X-402-Payment")!,
        }),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    success = response.ok;
  } catch (error) {
    clearTimeout(timeoutId);

    const isTimeout = error instanceof Error && error.name === "AbortError";
    const message = isTimeout
      ? "Request timeout"
      : error instanceof Error
        ? error.message
        : "Request failed";

    logger.error("[ExternalServiceProxy] Request failed", {
      serviceId,
      endpoint: targetEndpoint,
      error: message,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        error: "External service request failed",
        message,
        serviceId,
        duration: Date.now() - startTime,
      },
      { status: 502 }
    );
  }

  const duration = Date.now() - startTime;

  logger.info("[ExternalServiceProxy] Request completed", {
    serviceId,
    endpoint: targetEndpoint,
    status: response.status,
    success,
    duration,
  });

  // Return the response from the external service
  return NextResponse.json({
    success,
    serviceId,
    serviceType,
    status: response.status,
    response: responseBody,
    metadata: {
      duration,
      creditsCharged: PROXY_REQUEST_COST,
      endpoint: targetEndpoint,
    },
  });
}

/**
 * Get information about the external service proxy
 */
export async function GET() {
  return NextResponse.json({
    name: "External Service Proxy",
    description:
      "Proxy requests to external ERC-8004 registered services with credit management",
    cost: {
      perRequest: PROXY_REQUEST_COST,
      currency: "credits",
    },
    rateLimit: {
      requests: 60,
      window: "1 minute",
    },
    supportedServiceTypes: ["mcp", "a2a"],
    usage: {
      method: "POST",
      body: {
        serviceId: "chainId:tokenId or custom identifier",
        serviceType: "mcp | a2a",
        payload: "Request payload to forward",
        endpoint: "(optional) Override endpoint URL",
        timeout: "(optional) Timeout in ms, default 30000",
      },
    },
  });
}

