/**
 * A2A (Agent-to-Agent) JSON-RPC Endpoint
 *
 * Implements the A2A protocol specification v0.3.0
 * @see https://google.github.io/a2a-spec/
 *
 * Standard Methods:
 * - message/send: Send a message to create/continue a task
 * - tasks/get: Get task status and history
 * - tasks/cancel: Cancel a running task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import { agentReputationService } from "@/lib/services/agent-reputation";
import { loadOrgSecrets, isSecretsConfigured } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

// Debug: Check if Zod is available
if (!z || typeof z.object !== "function") {
  console.error("[A2A] FATAL: Zod module not properly loaded!", { z });
}
import {
  type A2AContext,
  type MessageSendParams,
  type TaskGetParams,
  type TaskCancelParams,
  A2AErrorCodes,
  jsonRpcSuccess,
  jsonRpcError,
  handleMessageSend,
  handleTasksGet,
  handleTasksCancel,
  AVAILABLE_SKILLS,
} from "@/lib/api/a2a";

export const maxDuration = 60;

// JSON-RPC response helpers
function a2aError(
  code: number,
  message: string,
  id: string | number | null,
  status = 400,
): NextResponse {
  return NextResponse.json(jsonRpcError(code, message, id), { status });
}

function a2aSuccess<T>(result: T, id: string | number | null): NextResponse {
  return NextResponse.json(jsonRpcSuccess(result, id));
}

// Method registry
type MethodHandler = (
  params: Record<string, unknown>,
  ctx: A2AContext,
) => Promise<unknown>;

const METHODS: Record<string, { handler: MethodHandler; description: string }> =
  {
    "message/send": {
      handler: (params, ctx) =>
        handleMessageSend(params as unknown as MessageSendParams, ctx),
      description: "Send a message to create/continue a task (A2A standard)",
    },
    "tasks/get": {
      handler: (params, ctx) =>
        handleTasksGet(params as unknown as TaskGetParams, ctx),
      description: "Get task status and history (A2A standard)",
    },
    "tasks/cancel": {
      handler: (params, ctx) =>
        handleTasksCancel(params as unknown as TaskCancelParams, ctx),
      description: "Cancel a running task (A2A standard)",
    },
  };

// Request schema
const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

// POST Handler
export async function POST(request: NextRequest) {
  let id: string | number | null = null;
  
  try {
    logger.info("[A2A] POST request received - Step 1");
    
    // Parse JSON
    let body: unknown;
    const bodyText = await request.text();
    logger.info("[A2A] POST request received - Step 2: body read");
    
    try {
      body = JSON.parse(bodyText);
      logger.info("[A2A] POST request received - Step 3: JSON parsed");
    } catch {
      return a2aError(
        A2AErrorCodes.PARSE_ERROR,
        "Parse error: Invalid JSON",
        null,
      );
    }
    
    logger.info("[A2A] POST request received - Step 4: about to validate schema");
    const parsed = JsonRpcRequestSchema.safeParse(body);
    logger.info("[A2A] POST request received - Step 5: schema validated");
    if (!parsed.success) {
      return a2aError(
        A2AErrorCodes.INVALID_REQUEST,
        "Invalid Request: Does not conform to JSON-RPC 2.0",
        null,
      );
    }

    const { method, params } = parsed.data;
    id = parsed.data.id;

  // Auth
  let authResult: Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>;
  try {
    authResult = await requireAuthOrApiKeyWithOrg(request);
  } catch (e) {
    // Return 402 with payment info if x402 is enabled
    const {
      X402_RECIPIENT_ADDRESS,
      getDefaultNetwork,
      USDC_ADDRESSES,
      TOPUP_PRICE,
      CREDITS_PER_DOLLAR,
      isX402Configured,
    } = await import("@/lib/config/x402");

    if (isX402Configured()) {
      return NextResponse.json(
        jsonRpcError(
          A2AErrorCodes.AUTHENTICATION_REQUIRED,
          "Authentication required. Get an API key or top up credits via x402 payment at /api/v1/credits/topup",
          id,
          {
            x402: {
              topupEndpoint: "/api/v1/credits/topup",
              network: getDefaultNetwork(),
              asset: USDC_ADDRESSES[getDefaultNetwork()],
              payTo: X402_RECIPIENT_ADDRESS,
              minimumTopup: TOPUP_PRICE,
              creditsPerDollar: CREDITS_PER_DOLLAR,
            },
          },
        ),
        { status: 402 },
      );
    }
    return a2aError(
      A2AErrorCodes.AUTHENTICATION_REQUIRED,
      e instanceof Error ? e.message : "Auth failed",
      id,
      401,
    );
  }

  // Agent reputation tracking
  const agentTokenId = request.headers.get("x-agent-token-id");
  const agentChainId = request.headers.get("x-agent-chain-id");
  const agentIdentifier =
    agentChainId && agentTokenId
      ? `${agentChainId}:${agentTokenId}`
      : `org:${authResult.user.organization_id}`;

  // Check if agent is banned
  const isAgentBanned =
    await agentReputationService.shouldBlockAgent(agentIdentifier);
  if (isAgentBanned) {
    return a2aError(
      A2AErrorCodes.AGENT_BANNED,
      "Agent is banned due to policy violations",
      id,
      403,
    );
  }

  // Rate limit based on trust level
  const agent = await agentReputationService.getAgent(agentIdentifier);
  const trustLevel = (agent?.trustLevel ?? "neutral") as
    | "untrusted"
    | "low"
    | "neutral"
    | "trusted"
    | "verified";
  const rateLimit =
    agentReputationService.getRateLimitForTrustLevel(trustLevel);

  const rateLimitResult = await checkRateLimitRedis(
    `a2a:${agentIdentifier}`,
    60000,
    rateLimit,
  );
  if (!rateLimitResult.allowed) {
    return a2aError(
      A2AErrorCodes.RATE_LIMITED,
      `Rate limited. Trust level: ${trustLevel}`,
      id,
      429,
    );
  }

  // Find handler
  const methodDef = METHODS[method];
  if (!methodDef) {
    return a2aError(
      A2AErrorCodes.METHOD_NOT_FOUND,
      `Method not found: ${method}`,
      id,
      404,
    );
  }

  // Load secrets for this organization
  const a2aSecrets = isSecretsConfigured()
    ? await loadOrgSecrets(authResult.user.organization_id)
    : {};

  // Execute
  logger.info(`[A2A] ${method}`, {
    org: authResult.user.organization_id,
    user: authResult.user.id,
    agentIdentifier,
    trustLevel,
  });

  const ctx: A2AContext = {
    user: authResult.user,
    apiKeyId: authResult.apiKey?.id || null,
    agentIdentifier,
    secrets: a2aSecrets,
  };

  try {
    const result = await methodDef.handler(params || {}, ctx);

    // Track successful request
    agentReputationService
      .recordRequest({ agentIdentifier, isSuccessful: true, method })
      .catch((err) =>
        logger.error("[A2A] Failed to record request", { error: err }),
      );

    return a2aSuccess(result, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";

    // Determine error code
    let code: number = A2AErrorCodes.INTERNAL_ERROR;
    let status = 500;

    if (msg.includes("Insufficient")) {
      code = A2AErrorCodes.INSUFFICIENT_CREDITS;
      status = 402;
    } else if (msg.includes("not found")) {
      code = A2AErrorCodes.TASK_NOT_FOUND;
      status = 404;
    } else if (msg.includes("suspended") || msg.includes("banned")) {
      code = A2AErrorCodes.AGENT_BANNED;
      status = 403;
    }

    // Track failed request
    agentReputationService
      .recordRequest({ agentIdentifier, isSuccessful: false, method })
      .catch((err) =>
        logger.error("[A2A] Failed to record failed request", { error: err }),
      );

    return a2aError(code, msg, id, status);
  }
  } catch (outerError) {
    // Catch any uncaught errors (e.g., from secrets loading, reputation service)
    logger.error("[A2A] Unhandled error:", outerError);
    return a2aError(
      A2AErrorCodes.INTERNAL_ERROR,
      outerError instanceof Error ? outerError.message : "Internal server error",
      id,
      500,
    );
  }
}

// GET Handler - Service Discovery
export async function GET() {
  return NextResponse.json({
    name: "Eliza Cloud A2A",
    version: "1.0.0",
    protocolVersion: "0.3.0",
    protocol: "JSON-RPC 2.0",
    documentation: "https://google.github.io/a2a-spec/",
    agentCard: "/.well-known/agent-card.json",
    methods: Object.entries(METHODS).map(([name, def]) => ({
      name,
      description: def.description,
      isStandard: true,
    })),
    skills: AVAILABLE_SKILLS,
  });
}

// OPTIONS Handler - CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-PAYMENT, X-Agent-Token-Id, X-Agent-Chain-Id",
    },
  });
}
