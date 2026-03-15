import { Elysia } from "elysia";
import type { AgentManager } from "./agent-manager";

export function createRoutes(manager: AgentManager) {
  return new Elysia()
    .get("/health", () => ({ alive: true }))

    .get("/ready", ({ set }) => {
      if (manager.isDraining()) {
        set.status = 503;
        return { ready: false };
      }
      return { ready: true };
    })

    .get("/status", () => manager.getStatus())

    .post("/agents", async ({ body, set }) => {
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
      } catch (err: any) {
        set.status = err.message === "At capacity" ? 503 : 409;
        return { error: err.message };
      }
    })

    .post("/agents/:id/stop", async ({ params, set }) => {
      try {
        await manager.stopAgent(params.id);
        return { agentId: params.id, status: "stopped" };
      } catch (err: any) {
        set.status = 404;
        return { error: err.message };
      }
    })

    .delete("/agents/:id", async ({ params, set }) => {
      try {
        await manager.deleteAgent(params.id);
        return { agentId: params.id, deleted: true };
      } catch (err: any) {
        set.status = 404;
        return { error: err.message };
      }
    })

    .post("/agents/:id/message", async ({ params, body, set }) => {
      const { userId, text } = body as { userId: string; text: string };
      if (!userId || !text) {
        set.status = 400;
        return { error: "userId and text are required" };
      }
      try {
        const response = await manager.handleMessage(params.id, userId, text);
        return { response };
      } catch (err: any) {
        set.status =
          err.message === "Agent not found" ||
          err.message === "Agent not running"
            ? 404
            : 500;
        return { error: err.message };
      }
    })

    .post("/drain", async () => {
      await manager.drain();
      await manager.cleanupRedis();
      return { drained: true };
    });
}
