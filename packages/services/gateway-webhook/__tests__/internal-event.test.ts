import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// ── Mock external boundaries ─────────────────────────────────────

// Mock internal-auth: controlled via process.env.GATEWAY_INTERNAL_SECRET
// (the real module reads env at call time, so no mock needed —
// we set/clear GATEWAY_INTERNAL_SECRET in beforeEach)

// Mock server-router (Redis + K8s API + pod forwarding)
const mockServerRoute: { value: { serverName: string; serverUrl: string } | null } = {
  value: {
    serverName: "eliza-server-1",
    serverUrl: "http://eliza-server-1.default.svc:3000",
  },
};
let mockForwardError: Error | null = null;
let mockForwardCalls: Array<{
  serverUrl: string;
  serverName: string;
  agentId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}> = [];
let mockResolveAgentServerCalls: string[] = [];
let mockRefreshKedaCalls: string[] = [];

mock.module("../src/server-router", () => ({
  resolveIdentity: async () => null,
  resolveAgentServer: async (_redis: unknown, agentId: string) => {
    mockResolveAgentServerCalls.push(agentId);
    return mockServerRoute.value;
  },
  forwardToServer: async () => "ok",
  forwardEventToServer: async (
    serverUrl: string,
    serverName: string,
    agentId: string,
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ) => {
    mockForwardCalls.push({ serverUrl, serverName, agentId, userId, type, payload });
    if (mockForwardError) throw mockForwardError;
    return "ok";
  },
  refreshKedaActivity: async (_redis: unknown, serverName: string) => {
    mockRefreshKedaCalls.push(serverName);
  },
}));

mock.module("../src/hash-router", () => ({
  getHashTargets: async () => ["10.0.0.1:3000"],
  refreshHashRing: async () => {},
}));

import { Hono } from "hono";
import { handleInternalEvent } from "../src/internal-event-handler";

// ── Fake Redis ───────────────────────────────────────────────────

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async <T>(key: string): Promise<T | null> => {
      const val = store.get(key);
      if (!val) return null;
      return JSON.parse(val) as T;
    },
    set: async (
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number },
    ): Promise<string | null> => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    lpush: async () => 1,
    ltrim: async () => "OK",
    expire: async () => true,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

const TEST_SECRET = "test-internal-secret-value";

function makeValidRequest(body?: unknown): Request {
  const payload = body ?? {
    agentId: "agent-001",
    userId: "user-001",
    type: "cron",
    payload: { cronId: "daily-check" },
  };
  return new Request("http://localhost/internal/event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": TEST_SECRET,
    },
    body: JSON.stringify(payload),
  });
}

const flush = () => new Promise((r) => setTimeout(r, 100));

// ── Unit tests ───────────────────────────────────────────────────

describe("handleInternalEvent", () => {
  const originalSecret = process.env.GATEWAY_INTERNAL_SECRET;

  beforeEach(() => {
    process.env.GATEWAY_INTERNAL_SECRET = TEST_SECRET;
    mockServerRoute.value = {
      serverName: "eliza-server-1",
      serverUrl: "http://eliza-server-1.default.svc:3000",
    };
    mockForwardError = null;
    mockForwardCalls = [];
    mockResolveAgentServerCalls = [];
    mockRefreshKedaCalls = [];
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.GATEWAY_INTERNAL_SECRET;
    } else {
      process.env.GATEWAY_INTERNAL_SECRET = originalSecret;
    }
  });

  // ── Auth rejection ────────────────────────────────────────────

  test("rejects request without X-Internal-Secret header (401)", async () => {
    const req = new Request("http://localhost/internal/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "a", userId: "u", type: "cron", payload: {} }),
    });
    const redis = createFakeRedis();
    const res = await handleInternalEvent(req, { redis: redis as any });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  test("rejects request with wrong X-Internal-Secret value (401)", async () => {
    const req = new Request("http://localhost/internal/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": "wrong-secret-value",
      },
      body: JSON.stringify({ agentId: "a", userId: "u", type: "cron", payload: {} }),
    });
    const redis = createFakeRedis();
    const res = await handleInternalEvent(req, { redis: redis as any });
    expect(res.status).toBe(401);
  });

  // ── Body validation ───────────────────────────────────────────

  test("returns 413 for payload exceeding 64KB", async () => {
    const largePayload = { agentId: "a1", userId: "u1", type: "cron", payload: { data: "x".repeat(70_000) } };
    const req = new Request("http://localhost/internal/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": TEST_SECRET,
      },
      body: JSON.stringify(largePayload),
    });
    const redis = createFakeRedis();
    const res = await handleInternalEvent(req, { redis: redis as any });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("payload too large");
  });

  test("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost/internal/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": TEST_SECRET,
      },
      body: "this is not json{",
    });
    const redis = createFakeRedis();
    const res = await handleInternalEvent(req, { redis: redis as any });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid JSON");
  });

  test("returns 400 for invalid body (missing agentId)", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(
      makeValidRequest({ userId: "u1", type: "cron", payload: {} }),
      { redis: redis as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request body");
    expect(body.details).toBeDefined();
  });

  test("returns 400 for invalid event type", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(
      makeValidRequest({
        agentId: "a1",
        userId: "u1",
        type: "invalid-type",
        payload: {},
      }),
      { redis: redis as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request body");
  });

  test("returns 400 for empty agentId", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(
      makeValidRequest({ agentId: "", userId: "u1", type: "cron", payload: {} }),
      { redis: redis as any },
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for empty userId", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(
      makeValidRequest({ agentId: "a1", userId: "", type: "cron", payload: {} }),
      { redis: redis as any },
    );
    expect(res.status).toBe(400);
  });

  // ── Happy path ────────────────────────────────────────────────

  test("returns 200 { queued: true } on valid request", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(makeValidRequest(), { redis: redis as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ queued: true });
  });

  test("calls resolveAgentServer with correct agentId", async () => {
    const redis = createFakeRedis();
    await handleInternalEvent(makeValidRequest(), { redis: redis as any });
    await flush();
    expect(mockResolveAgentServerCalls).toContain("agent-001");
  });

  test("calls refreshKedaActivity with correct serverName", async () => {
    const redis = createFakeRedis();
    await handleInternalEvent(makeValidRequest(), { redis: redis as any });
    await flush();
    expect(mockRefreshKedaCalls).toContain("eliza-server-1");
  });

  test("calls forwardEventToServer with correct params", async () => {
    const redis = createFakeRedis();
    await handleInternalEvent(makeValidRequest(), { redis: redis as any });
    await flush();
    expect(mockForwardCalls.length).toBe(1);
    expect(mockForwardCalls[0]).toEqual({
      serverUrl: "http://eliza-server-1.default.svc:3000",
      serverName: "eliza-server-1",
      agentId: "agent-001",
      userId: "user-001",
      type: "cron",
      payload: { cronId: "daily-check" },
    });
  });

  // ── All three event types ─────────────────────────────────────

  test("accepts 'notification' event type", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(
      makeValidRequest({
        agentId: "a1",
        userId: "u1",
        type: "notification",
        payload: { message: "hello" },
      }),
      { redis: redis as any },
    );
    expect(res.status).toBe(200);
  });

  test("accepts 'system' event type", async () => {
    const redis = createFakeRedis();
    const res = await handleInternalEvent(
      makeValidRequest({
        agentId: "a1",
        userId: "u1",
        type: "system",
        payload: { action: "restart" },
      }),
      { redis: redis as any },
    );
    expect(res.status).toBe(200);
  });

  // ── Fire-and-forget resilience ────────────────────────────────

  test("returns 200 even when agent server not found", async () => {
    mockServerRoute.value = null;
    const redis = createFakeRedis();
    const res = await handleInternalEvent(makeValidRequest(), { redis: redis as any });
    expect(res.status).toBe(200);
    await flush();
    expect(mockForwardCalls.length).toBe(0);
  });

  test("returns 200 even when forwarding fails", async () => {
    mockForwardError = new Error("Connection refused");
    const redis = createFakeRedis();
    const res = await handleInternalEvent(makeValidRequest(), { redis: redis as any });
    expect(res.status).toBe(200);
    await flush();
  });

  // ── No cross-contamination with webhook routes ────────────────

  test("does not interfere with webhook handler imports", async () => {
    const webhookMod = await import("../src/webhook-handler");
    expect(typeof webhookMod.handleWebhook).toBe("function");
  });
});

// ── Integration tests (Hono app) ────────────────────────────────

describe("handleInternalEvent integration (Hono app)", () => {
  const originalSecret = process.env.GATEWAY_INTERNAL_SECRET;

  beforeEach(() => {
    process.env.GATEWAY_INTERNAL_SECRET = TEST_SECRET;
    mockServerRoute.value = {
      serverName: "srv-integration",
      serverUrl: "http://srv-integration.ns.svc:3000",
    };
    mockForwardError = null;
    mockForwardCalls = [];
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.GATEWAY_INTERNAL_SECRET;
    } else {
      process.env.GATEWAY_INTERNAL_SECRET = originalSecret;
    }
  });

  function buildApp() {
    const app = new Hono();
    const fakeRedis = createFakeRedis();
    app.get("/health", (c) => c.json({ status: "healthy" }));
    app.post("/internal/event", async (c) => {
      return handleInternalEvent(c.req.raw, { redis: fakeRedis as any });
    });
    app.post("/webhook/:project/:platform", (c) =>
      c.json({ route: "webhook", project: c.req.param("project") }),
    );
    return app;
  }

  test("POST /internal/event returns 200 { queued: true } for valid request", async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request("http://localhost/internal/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": TEST_SECRET,
        },
        body: JSON.stringify({
          agentId: "agent-int",
          userId: "user-int",
          type: "system",
          payload: { action: "test" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ queued: true });
  });

  test("POST /internal/event returns 401 without secret", async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request("http://localhost/internal/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "a1",
          userId: "u1",
          type: "cron",
          payload: {},
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /internal/event returns 400 for bad body", async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request("http://localhost/internal/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": TEST_SECRET,
        },
        body: JSON.stringify({ agentId: "a1" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("GET /health still works alongside internal route", async () => {
    const app = buildApp();
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  test("POST /webhook/:project/:platform still routes correctly", async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request("http://localhost/webhook/cloud/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route).toBe("webhook");
    expect(body.project).toBe("cloud");
  });

  test("GET /internal/event returns 404 (only POST allowed)", async () => {
    const app = buildApp();
    const res = await app.fetch(new Request("http://localhost/internal/event"));
    expect(res.status).toBe(404);
  });
});
