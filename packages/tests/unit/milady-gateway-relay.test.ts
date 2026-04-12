import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let miladyGatewayRelayService: typeof import("../../lib/services/milady-gateway-relay").miladyGatewayRelayService;

const createdSessionIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdSessionIds
      .splice(0)
      .map((sessionId) => miladyGatewayRelayService.disconnectSession(sessionId)),
  );
});

beforeEach(async () => {
  mock.restore();
  ({ miladyGatewayRelayService } = await import(
    new URL("../../lib/services/milady-gateway-relay.ts", import.meta.url).href
  ));
  miladyGatewayRelayService.resetForTests();
});

describe("miladyGatewayRelayService", () => {
  test("defers the Redis production guard until the relay is actually used", async () => {
    const envKeys = [
      "NODE_ENV",
      "VERCEL",
      "VERCEL_ENV",
      "ENVIRONMENT",
      "REDIS_URL",
      "KV_URL",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "MILADY_ALLOW_EPHEMERAL_CLOUD_STATE",
    ] as const;
    const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

    try {
      process.env.NODE_ENV = "production";
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      delete process.env.ENVIRONMENT;
      delete process.env.REDIS_URL;
      delete process.env.KV_URL;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.MILADY_ALLOW_EPHEMERAL_CLOUD_STATE;

      const imported = await import(
        new URL(`../../lib/services/milady-gateway-relay.ts?test=${Date.now()}`, import.meta.url)
          .href
      );

      expect(imported.miladyGatewayRelayService).toBeDefined();
      imported.miladyGatewayRelayService.resetForTests(null);
      await expect(
        imported.miladyGatewayRelayService.listOwnerSessions("org-prod", "user-prod"),
      ).rejects.toThrow("Redis-backed shared storage is required in production");
    } finally {
      for (const key of envKeys) {
        const value = previousEnv[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  test("queues a request for a registered local session and resolves the posted response", async () => {
    const session = await miladyGatewayRelayService.registerSession({
      organizationId: "org-1",
      userId: "user-1",
      runtimeAgentId: "local-agent-1",
      agentName: "Local Milady",
    });
    createdSessionIds.push(session.id);

    const routePromise = miladyGatewayRelayService.routeToSession(
      session,
      {
        jsonrpc: "2.0",
        id: "rpc-1",
        method: "message.send",
        params: { text: "hello from cloud" },
      },
      2_000,
    );

    const nextRequest = await miladyGatewayRelayService.pollNextRequest(session.id, 500);
    expect(nextRequest).not.toBeNull();
    expect(nextRequest?.rpc.method).toBe("message.send");
    expect(nextRequest?.rpc.params?.text).toBe("hello from cloud");

    const accepted = await miladyGatewayRelayService.respondToRequest({
      sessionId: session.id,
      requestId: nextRequest!.requestId,
      response: {
        jsonrpc: "2.0",
        id: "rpc-1",
        result: { text: "hello from local" },
      },
    });

    expect(accepted).toBe(true);
    await expect(routePromise).resolves.toEqual({
      jsonrpc: "2.0",
      id: "rpc-1",
      result: { text: "hello from local" },
    });
  });

  test("indexes active sessions by owner and clears them on disconnect", async () => {
    const session = await miladyGatewayRelayService.registerSession({
      organizationId: "org-2",
      userId: "user-2",
      runtimeAgentId: "local-agent-2",
      agentName: "Second Local Milady",
    });
    createdSessionIds.push(session.id);

    await expect(miladyGatewayRelayService.listOwnerSessions("org-2", "user-2")).resolves.toEqual([
      expect.objectContaining({
        id: session.id,
        runtimeAgentId: "local-agent-2",
      }),
    ]);

    await miladyGatewayRelayService.disconnectSession(session.id);
    createdSessionIds.splice(createdSessionIds.indexOf(session.id), 1);

    await expect(miladyGatewayRelayService.listOwnerSessions("org-2", "user-2")).resolves.toEqual(
      [],
    );
  });
});
