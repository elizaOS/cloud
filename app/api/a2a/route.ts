/**
 * A2A (Agent-to-Agent) JSON-RPC Endpoint
 *
 * Implements the A2A protocol specification v0.3.0
 * @see https://google.github.io/a2a-spec/
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import { agentReputationService } from "@/lib/services/agent-reputation";
import { loadOrgSecrets, isSecretsConfigured } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

// Error codes
const A2AErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  AUTHENTICATION_REQUIRED: -32001,
  INSUFFICIENT_CREDITS: -32002,
  RATE_LIMITED: -32003,
  TASK_NOT_FOUND: -32004,
  AGENT_BANNED: -32013,
} as const;

function jsonRpcError(
  code: number,
  message: string,
  id: string | number | null,
  data?: Record<string, unknown>,
) {
  return { jsonrpc: "2.0", error: { code, message, data }, id };
}

function jsonRpcSuccess<T>(result: T, id: string | number | null) {
  return { jsonrpc: "2.0", result, id };
}

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

// Simple validation without Zod
function validateJsonRpcRequest(body: unknown):
  | {
      valid: true;
      method: string;
      params: Record<string, unknown>;
      id: string | number | null;
    }
  | { valid: false } {
  if (!body || typeof body !== "object") return { valid: false };
  const obj = body as Record<string, unknown>;
  if (obj.jsonrpc !== "2.0") return { valid: false };
  if (typeof obj.method !== "string") return { valid: false };
  if (
    obj.params !== undefined &&
    (typeof obj.params !== "object" || obj.params === null)
  )
    return { valid: false };
  if (
    obj.id !== null &&
    typeof obj.id !== "string" &&
    typeof obj.id !== "number"
  )
    return { valid: false };
  return {
    valid: true,
    method: obj.method,
    params: (obj.params as Record<string, unknown>) || {},
    id: obj.id as string | number | null,
  };
}

// POST Handler
export async function POST(request: NextRequest) {
  let id: string | number | null = null;

  try {
    // Parse JSON
    let body: unknown;
    const bodyText = await request.text();
    try {
      body = JSON.parse(bodyText);
    } catch {
      return a2aError(
        A2AErrorCodes.PARSE_ERROR,
        "Parse error: Invalid JSON",
        null,
      );
    }

    const parsed = validateJsonRpcRequest(body);
    if (!parsed.valid) {
      return a2aError(
        A2AErrorCodes.INVALID_REQUEST,
        "Invalid Request: Does not conform to JSON-RPC 2.0",
        null,
      );
    }

    const { method, params } = parsed;
    id = parsed.id;

    // Auth
    let authResult: Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>;
    try {
      authResult = await requireAuthOrApiKeyWithOrg(request);
    } catch (e) {
      const {
        isX402Configured,
        getDefaultNetwork,
        X402_RECIPIENT_ADDRESS,
        USDC_ADDRESSES,
        TOPUP_PRICE,
        CREDITS_PER_DOLLAR,
      } = await import("@/lib/config/x402");
      if (isX402Configured()) {
        return NextResponse.json(
          jsonRpcError(
            A2AErrorCodes.AUTHENTICATION_REQUIRED,
            "Authentication required.",
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

    // Agent reputation
    const agentTokenId = request.headers.get("x-agent-token-id");
    const agentChainId = request.headers.get("x-agent-chain-id");
    const agentIdentifier =
      agentChainId && agentTokenId
        ? `${agentChainId}:${agentTokenId}`
        : `org:${authResult.user.organization_id}`;

    if (await agentReputationService.shouldBlockAgent(agentIdentifier)) {
      return a2aError(A2AErrorCodes.AGENT_BANNED, "Agent is banned", id, 403);
    }

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

    // Lazy import handlers
    const { handleMessageSend, handleTasksGet, handleTasksCancel } =
      await import("@/lib/api/a2a/handlers");

    // Load secrets
    const a2aSecrets = isSecretsConfigured()
      ? await loadOrgSecrets(authResult.user.organization_id)
      : {};

    const ctx = {
      user: authResult.user,
      apiKeyId: authResult.apiKey?.id || null,
      agentIdentifier,
      secrets: a2aSecrets,
    };

    logger.info(`[A2A] ${method}`, {
      org: authResult.user.organization_id,
      user: authResult.user.id,
      agentIdentifier,
      trustLevel,
    });

    try {
      let result: unknown;
      switch (method) {
        case "message/send":
          result = await handleMessageSend(
            params as Parameters<typeof handleMessageSend>[0],
            ctx,
          );
          break;
        case "tasks/get":
          result = await handleTasksGet(
            params as Parameters<typeof handleTasksGet>[0],
            ctx,
          );
          break;
        case "tasks/cancel":
          result = await handleTasksCancel(
            params as Parameters<typeof handleTasksCancel>[0],
            ctx,
          );
          break;
        default:
          return a2aError(
            A2AErrorCodes.METHOD_NOT_FOUND,
            `Method not found: ${method}`,
            id,
            404,
          );
      }

      agentReputationService
        .recordRequest({ agentIdentifier, isSuccessful: true, method })
        .catch(() => {});
      return a2aSuccess(result, id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Internal error";
      let code = A2AErrorCodes.INTERNAL_ERROR;
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

      agentReputationService
        .recordRequest({ agentIdentifier, isSuccessful: false, method })
        .catch(() => {});
      return a2aError(code, msg, id, status);
    }
  } catch (outerError) {
    logger.error("[A2A] Unhandled error:", outerError);
    return a2aError(
      A2AErrorCodes.INTERNAL_ERROR,
      outerError instanceof Error
        ? outerError.message
        : "Internal server error",
      id,
      500,
    );
  }
}

// GET Handler - Service Discovery
export async function GET() {
  const { AVAILABLE_SKILLS } = await import("@/lib/api/a2a/handlers");

  return NextResponse.json({
    name: "Eliza Cloud A2A",
    version: "1.0.0",
    protocolVersion: "0.3.0",
    protocol: "JSON-RPC 2.0",
    documentation: "https://google.github.io/a2a-spec/",
    agentCard: "/.well-known/agent-card.json",
    methods: [
      {
        name: "message/send",
        description: "Send a message to create/continue a task",
        isStandard: true,
      },
      {
        name: "tasks/get",
        description: "Get task status and history",
        isStandard: true,
      },
      {
        name: "tasks/cancel",
        description: "Cancel a running task",
        isStandard: true,
      },
    ],
    skills: AVAILABLE_SKILLS,
  });
}
