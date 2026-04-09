import type { Redis } from "@upstash/redis";
import { z } from "zod";
import { validateInternalSecret } from "./internal-auth";
import { logger } from "./logger";
import {
  forwardEventToServer,
  refreshKedaActivity,
  resolveAgentServer,
} from "./server-router";

/**
 * Zod schema for the internal event request body.
 * K8s services (CronJobs, matcher, notifier) send events matching this shape.
 */
const InternalEventSchema = z.object({
  agentId: z.string().min(1),
  userId: z.string().min(1),
  type: z.enum(["cron", "notification", "system"]),
  payload: z.record(z.unknown()),
});

export type InternalEvent = z.infer<typeof InternalEventSchema>;

interface InternalEventDeps {
  redis: Redis;
}

/**
 * Handles an incoming internal event request from K8s services.
 *
 * Synchronous phase: validates auth and body, returns 200 immediately.
 * Async phase: resolves agent server, refreshes KEDA, forwards event
 * to the agent pod (fire-and-forget).
 */
export async function handleInternalEvent(
  request: Request,
  deps: InternalEventDeps,
): Promise<Response> {
  if (!validateInternalSecret(request)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    logger.warn("Internal event rejected: malformed JSON body");
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const parsed = InternalEventSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn("Internal event rejected: schema validation failed", {
      issues: parsed.error.issues,
    });
    return jsonResponse(
      { error: "invalid request body", details: parsed.error.issues },
      400,
    );
  }

  const event = parsed.data;
  logger.info("Internal event queued", { agentId: event.agentId, type: event.type });

  processInternalEvent(event, deps).catch((err) => {
    logger.error("Background internal event processing failed", {
      error: err instanceof Error ? err.message : String(err),
      agentId: event.agentId,
      type: event.type,
    });
  });

  return jsonResponse({ queued: true }, 200);
}

/**
 * Background processing for an internal event: resolve agent server,
 * refresh KEDA activity, and forward the event to the agent pod.
 */
async function processInternalEvent(
  event: InternalEvent,
  deps: InternalEventDeps,
): Promise<void> {
  const { redis } = deps;

  const server = await resolveAgentServer(redis, event.agentId);
  if (!server) {
    logger.error("No server found for agent", { agentId: event.agentId });
    return;
  }

  refreshKedaActivity(redis, server.serverName).catch((err) => {
    logger.warn("refreshKedaActivity failed", {
      serverName: server.serverName,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  try {
    await forwardEventToServer(
      server.serverUrl,
      server.serverName,
      event.agentId,
      event.userId,
      event.type,
      event.payload,
    );
  } catch (err) {
    logger.error("Forward event to server failed", {
      error: err instanceof Error ? err.message : String(err),
      agentId: event.agentId,
      type: event.type,
    });
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
