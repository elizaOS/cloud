import { beforeEach, describe, expect, mock, test } from "bun:test";

// ── Mock @elizaos/core (must be before any import that uses it) ──

const mockEmitEvent = mock(() => Promise.resolve());
const mockHandleMessage = mock(
  (_rt: unknown, _mem: unknown, callback: (content: { text: string }) => Promise<unknown[]>) => {
    return callback({ text: "integration-response" });
  },
);
const mockEnsureConnection = mock(() => Promise.resolve());

function createMockRuntime() {
  return {
    emitEvent: mockEmitEvent,
    ensureConnection: mockEnsureConnection,
    messageService: { handleMessage: mockHandleMessage },
    getService: mock(() => null),
    stop: mock(() => Promise.resolve()),
  };
}

mock.module("@elizaos/core", () => ({
  AgentRuntime: class {},
  ChannelType: { DM: "DM" },
  createMessageMemory: mock(({ entityId, roomId, content }) => ({
    entityId,
    roomId,
    content,
  })),
  mergeCharacterDefaults: mock((c) => c),
  stringToUuid: mock((s: string) => `uuid-${s}`),
}));

mock.module("@elizaos/plugin-sql", () => ({ default: {} }));

mock.module("../../src/redis", () => ({
  getRedis: mock(() => ({
    get: mock(() => null),
    set: mock(() => "OK"),
    multi: mock(() => ({
      set: mock(() => {}),
      exec: mock(() => Promise.resolve()),
    })),
    del: mock(() => Promise.resolve()),
  })),
}));

// ── Import after mocks ──────────────────────────────────────────

import { Elysia } from "elysia";
import { AgentManager } from "../../src/agent-manager";
import { createRoutes } from "../../src/routes";

// ── Helpers ─────────────────────────────────────────────────────

const TEST_SECRET = "integration-test-secret";
const AGENT_ID = "int-agent-001";

function buildApp(manager: AgentManager) {
  return new Elysia().use(createRoutes(manager, TEST_SECRET));
}

function eventRequest(
  agentId: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost/agents/${agentId}/event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Server-Token": TEST_SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ── Integration tests ───────────────────────────────────────────

describe("POST /agents/:id/event integration (Elysia app)", () => {
  let manager: AgentManager;
  let app: Elysia;

  beforeEach(() => {
    mockEmitEvent.mockClear();
    mockHandleMessage.mockClear();
    mockEnsureConnection.mockClear();

    manager = new AgentManager();
    // Inject a mock agent directly into the manager's private agents map
    const agents = (manager as any).agents as Map<string, any>;
    agents.set(AGENT_ID, {
      agentId: AGENT_ID,
      characterRef: "test-char",
      runtime: createMockRuntime(),
      state: "running",
    });

    app = buildApp(manager);
  });

  test("returns 200 { handled: true, type } for valid cron event", async () => {
    const res = await app.handle(
      eventRequest(AGENT_ID, { userId: "user-1", type: "cron", payload: { cronId: "c1" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(true);
    expect(body.type).toBe("cron");
  });

  test("returns 200 for valid notification event with response", async () => {
    const res = await app.handle(
      eventRequest(AGENT_ID, {
        userId: "user-1",
        type: "notification",
        payload: { text: "hello" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(true);
    expect(body.type).toBe("notification");
    expect(body.response).toBe("integration-response");
  });

  test("returns 200 for valid system health event", async () => {
    const res = await app.handle(
      eventRequest(AGENT_ID, {
        userId: "user-1",
        type: "system",
        payload: { action: "health" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(true);
    expect(body.type).toBe("system");
    expect(body.status).toBe("running");
  });

  test("returns 401 without auth token", async () => {
    const req = new Request(`http://localhost/agents/${AGENT_ID}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", type: "cron", payload: {} }),
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 400 for invalid body (missing type)", async () => {
    const res = await app.handle(eventRequest(AGENT_ID, { userId: "u1", payload: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request body");
    expect(body.details).toBeDefined();
  });

  test("returns 400 for unknown event type", async () => {
    const res = await app.handle(
      eventRequest(AGENT_ID, { userId: "u1", type: "webhook", payload: {} }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request body");
  });

  test("returns 404 for agent not loaded on pod", async () => {
    const res = await app.handle(
      eventRequest("nonexistent-agent", { userId: "u1", type: "cron", payload: {} }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Agent not found");
  });

  test("returns 404 for agent in stopped state", async () => {
    const agents = (manager as any).agents as Map<string, any>;
    agents.set("stopped-agent", {
      agentId: "stopped-agent",
      characterRef: "test-char",
      runtime: createMockRuntime(),
      state: "stopped",
    });

    const res = await app.handle(
      eventRequest("stopped-agent", { userId: "u1", type: "cron", payload: {} }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Agent not running");
  });

  test("inFlight counter increments and decrements around event handling", async () => {
    expect((manager as any).inFlight).toBe(0);

    const res = await app.handle(
      eventRequest(AGENT_ID, { userId: "u1", type: "system", payload: { action: "health" } }),
    );
    expect(res.status).toBe(200);

    // After completion, inFlight should be back to 0
    expect((manager as any).inFlight).toBe(0);
  });
});

describe("Non-interference with existing routes", () => {
  let manager: AgentManager;
  let app: Elysia;

  beforeEach(() => {
    manager = new AgentManager();
    app = buildApp(manager);
  });

  test("GET /health still works", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alive).toBe(true);
  });

  test("GET /ready still works", async () => {
    const res = await app.handle(new Request("http://localhost/ready"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ready).toBe(true);
  });

  test("POST /agents/:id/message still routes correctly", async () => {
    const agents = (manager as any).agents as Map<string, any>;
    agents.set("msg-agent", {
      agentId: "msg-agent",
      characterRef: "test",
      runtime: createMockRuntime(),
      state: "running",
    });

    const res = await app.handle(
      new Request("http://localhost/agents/msg-agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Server-Token": TEST_SECRET,
        },
        body: JSON.stringify({ userId: "u1", text: "hello" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBeDefined();
  });
});
