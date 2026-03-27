import { Elysia } from "elysia";
import type { AgentManager } from "./agent-manager";

type HeaderMap = Record<string, string | undefined>;

function getAuthToken(headers: HeaderMap): string | null {
  const direct = headers["x-server-token"] ?? headers["X-Server-Token"];
  if (direct) {
    return direct.trim();
  }

  const authorization = headers.authorization ?? headers.Authorization;
  if (authorization && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return null;
}

function requireInternalAuth(
  headers: HeaderMap,
  set: { status?: number | string },
  sharedSecret: string,
) {
  if (!sharedSecret) {
    set.status = 503;
    return { error: "Server auth not configured" };
  }

  if (getAuthToken(headers) !== sharedSecret) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  return null;
}

export function createRoutes(manager: AgentManager, sharedSecret: string) {
  return new Elysia()
    .get("/health", () => ({ alive: true }))

    .get("/ready", ({ set }) => {
      if (manager.isDraining()) {
        set.status = 503;
        return { ready: false };
      }
      return { ready: true };
    })

    .get("/status", ({ headers, set }) => {
      const denial = requireInternalAuth(headers as HeaderMap, set, sharedSecret);
      if (denial) {
        return denial;
      }
      return manager.getStatus();
    })

    .post("/agents", async ({ body, headers, set }) => {
      const denial = requireInternalAuth(headers as HeaderMap, set, sharedSecret);
      if (denial) {
        return denial;
      }
      const { agentId, characterRef } = body as {
        agentId: string;
        characterRef: string;
      };
      if (!agentId || !characterRef) {
        set.status = 400;
        return { error: "agentId and characterRef are required" };
      }
      try {
        await manager.startAgent(agentId, characterRef);
        set.status = 201;
        return { agentId, status: "running" };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        set.status = message === "At capacity" ? 503 : 409;
        return { error: message };
      }
    })

    .post("/agents/:id/stop", async ({ params, headers, set }) => {
      const denial = requireInternalAuth(headers as HeaderMap, set, sharedSecret);
      if (denial) {
        return denial;
      }
      try {
        await manager.stopAgent(params.id);
        return { agentId: params.id, status: "stopped" };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        set.status = 404;
        return { error: message };
      }
    })

    .delete("/agents/:id", async ({ params, headers, set }) => {
      const denial = requireInternalAuth(headers as HeaderMap, set, sharedSecret);
      if (denial) {
        return denial;
      }
      try {
        await manager.deleteAgent(params.id);
        return { agentId: params.id, deleted: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        set.status = 404;
        return { error: message };
      }
    })

    .post("/agents/:id/message", async ({ params, body, headers, set }) => {
      const denial = requireInternalAuth(headers as HeaderMap, set, sharedSecret);
      if (denial) {
        return denial;
      }
      const { userId, text } = body as { userId: string; text: string };
      if (!userId || !text) {
        set.status = 400;
        return { error: "userId and text are required" };
      }
      try {
        const response = await manager.handleMessage(params.id, userId, text);
        return { response };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        set.status = message === "Agent not found" || message === "Agent not running" ? 404 : 500;
        return { error: message };
      }
    })

    .post("/drain", async ({ headers, set }) => {
      const denial = requireInternalAuth(headers as HeaderMap, set, sharedSecret);
      if (denial) {
        return denial;
      }
      await manager.drain();
      await manager.cleanupRedis();
      return { drained: true };
    });
}
