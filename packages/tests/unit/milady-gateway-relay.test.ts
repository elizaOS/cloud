import { afterEach, describe, expect, test } from "bun:test";
import { miladyGatewayRelayService } from "../../lib/services/milady-gateway-relay";

const createdSessionIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdSessionIds
      .splice(0)
      .map((sessionId) => miladyGatewayRelayService.disconnectSession(sessionId)),
  );
});

describe("miladyGatewayRelayService", () => {
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
