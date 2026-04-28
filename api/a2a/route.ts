/**
 * /api/a2a — Agent-to-Agent JSON-RPC endpoint (A2A spec v0.3.0).
 * POST: dispatches `message/send`, `tasks/get`, `tasks/cancel`.
 * GET: service discovery card. OPTIONS: CORS preflight.
 */

import { Hono } from "hono";
import { z } from "zod/v3";

import {
  type A2AContext,
  A2AErrorCodes,
  AVAILABLE_SKILLS,
  handleMessageSend,
  handleTasksCancel,
  handleTasksGet,
  jsonRpcError,
  jsonRpcSuccess,
  type MessageSendParams,
  type TaskCancelParams,
  type TaskGetParams,
} from "@/lib/api/a2a";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";

type MethodHandler = (params: Record<string, unknown>, ctx: A2AContext) => Promise<unknown>;

const METHODS: Record<string, { handler: MethodHandler; description: string }> = {
  "message/send": {
    handler: (params, ctx) => handleMessageSend(params as unknown as MessageSendParams, ctx),
    description: "Send a message to create/continue a task (A2A standard)",
  },
  "tasks/get": {
    handler: (params, ctx) => handleTasksGet(params as unknown as TaskGetParams, ctx),
    description: "Get task status and history (A2A standard)",
  },
  "tasks/cancel": {
    handler: (params, ctx) => handleTasksCancel(params as unknown as TaskCancelParams, ctx),
    description: "Cancel a running task (A2A standard)",
  },
};

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(jsonRpcError(A2AErrorCodes.PARSE_ERROR, "Parse error: Invalid JSON", null), 400);
  }

  const parsed = JsonRpcRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      jsonRpcError(
        A2AErrorCodes.INVALID_REQUEST,
        "Invalid Request: Does not conform to JSON-RPC 2.0",
        null,
      ),
      400,
    );
  }

  const { method, params, id } = parsed.data;

  let user: Awaited<ReturnType<typeof requireUserOrApiKeyWithOrg>>;
  try {
    user = await requireUserOrApiKeyWithOrg(c);
  } catch (e) {
    return c.json(
      jsonRpcError(
        A2AErrorCodes.AUTHENTICATION_REQUIRED,
        e instanceof Error ? e.message : "Auth failed",
        id,
      ),
      401,
    );
  }

  // TODO(rate-limit): port the per-org A2A burst limit (was checkRateLimitRedis +
  // ORGANIZATION_SERVICE_BURST_LIMIT). The shared rate-limit middleware is
  // request-scoped, not method-scoped — fold this into a custom rateLimit
  // config keyed on `a2a:${user.organization_id}` once the helper supports it.

  const methodDef = METHODS[method];
  if (!methodDef) {
    return c.json(
      jsonRpcError(A2AErrorCodes.METHOD_NOT_FOUND, `Method not found: ${method}`, id),
      404,
    );
  }

  logger.info(`[A2A] ${method}`, {
    org: user.organization_id,
    user: user.id,
  });

  const ctx: A2AContext = {
    user,
    apiKeyId: null,
    agentIdentifier: `org:${user.organization_id}`,
  };

  try {
    const result = await methodDef.handler(params || {}, ctx);
    return c.json(jsonRpcSuccess(result, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    let code: number = A2AErrorCodes.INTERNAL_ERROR;
    let status: 500 | 402 | 404 | 403 = 500;

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
    return c.json(jsonRpcError(code, msg, id), status);
  }
});

app.get("/", (c) =>
  c.json({
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
  }),
);

app.options("/", (c) =>
  c.body(null, 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-PAYMENT, X-Agent-Token-Id, X-Agent-Chain-Id",
  }),
);

export default app;
