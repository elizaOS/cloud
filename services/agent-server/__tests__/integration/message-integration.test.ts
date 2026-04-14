import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";

// ── Mock @elizaos/core (must be before any import that uses it) ──

const mockHandleMessage = mock((_rt: IAgentRuntime, _mem: Memory, callback?: HandlerCallback) =>
  callback ? callback({ text: "integration-response" }) : Promise.resolve([] as Memory[]),
);
const mockEnsureConnection = mock(() => Promise.resolve());
const mockCreateMessageMemory = mock(
  ({ entityId, roomId, content }: { entityId: string; roomId: string; content: unknown }) => ({
    entityId,
    roomId,
    content,
  }),
);

function createMockRuntime(): IAgentRuntime {
  return {
    emitEvent: mock(() => Promise.resolve()),
    ensureConnection: mockEnsureConnection,
    messageService: { handleMessage: mockHandleMessage },
    getService: mock(() => null),
    stop: mock(() => Promise.resolve()),
  } as IAgentRuntime;
}

mock.module("@elizaos/core", () => ({
  AgentRuntime: class {},
  ChannelType: { DM: "DM" },
  createMessageMemory: mockCreateMessageMemory,
  mergeCharacterDefaults: mock((c: unknown) => c),
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

interface TestAgentEntry {
  agentId: string;
  characterRef: string;
  runtime: IAgentRuntime;
  state: "running" | "stopped";
}

type AgentManagerWithTestState = AgentManager & { agents: Map<string, TestAgentEntry> };

// ── Helpers ─────────────────────────────────────────────────────

const TEST_SECRET = "integration-test-secret";
const AGENT_ID = "int-agent-001";

function buildApp(manager: AgentManager) {
  return new Elysia().use(createRoutes(manager, TEST_SECRET));
}

function messageRequest(
  agentId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost/agents/${agentId}/message`, {
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

describe("POST /agents/:id/message integration — platform metadata (ticket #55)", () => {
  let manager: AgentManager;
  let app: Elysia;

  beforeEach(() => {
    mockEnsureConnection.mockClear();
    mockHandleMessage.mockClear();
    mockCreateMessageMemory.mockClear();
    process.env.SERVER_NAME = "test-server";

    manager = new AgentManager();
    const agents = (manager as AgentManagerWithTestState).agents;
    agents.set(AGENT_ID, {
      agentId: AGENT_ID,
      characterRef: "test-char",
      runtime: createMockRuntime(),
      state: "running",
    });

    app = buildApp(manager);
  });

  test("accepts enriched body with platformName, senderName, chatId", async () => {
    const res = await app.handle(
      messageRequest(AGENT_ID, {
        userId: "user-1",
        text: "Hello from Telegram",
        platformName: "telegram",
        senderName: "Alice",
        chatId: "42",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("integration-response");
  });

  test("passes platformName as source to ensureConnection", async () => {
    await app.handle(
      messageRequest(AGENT_ID, {
        userId: "user-1",
        text: "Hello",
        platformName: "whatsapp",
        senderName: "Bob",
        chatId: "waid-123",
      }),
    );

    expect(mockEnsureConnection).toHaveBeenCalledTimes(1);
    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.source).toBe("whatsapp");
    expect(connectionArgs.userName).toBe("Bob");
  });

  test("passes platformName as source to createMessageMemory", async () => {
    await app.handle(
      messageRequest(AGENT_ID, {
        userId: "user-1",
        text: "Hello",
        platformName: "telegram",
      }),
    );

    expect(mockCreateMessageMemory).toHaveBeenCalledTimes(1);
    const memoryArgs = mockCreateMessageMemory.mock.calls[0][0] as {
      content: { source: string };
    };
    expect(memoryArgs.content.source).toBe("telegram");
  });

  test("backward compatible: accepts body with only userId and text", async () => {
    const res = await app.handle(
      messageRequest(AGENT_ID, { userId: "user-1", text: "Hello" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response).toBe("integration-response");

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.source).toBe("agent-server");
    expect(connectionArgs.userName).toBe("user-1");
  });

  test("backward compatible: accepts body with undefined metadata fields", async () => {
    const res = await app.handle(
      messageRequest(AGENT_ID, {
        userId: "user-1",
        text: "Hello",
        platformName: undefined,
        senderName: undefined,
        chatId: undefined,
      }),
    );
    expect(res.status).toBe(200);

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.source).toBe("agent-server");
    expect(connectionArgs.userName).toBe("user-1");
  });

  test("stores chatId in connection metadata", async () => {
    await app.handle(
      messageRequest(AGENT_ID, {
        userId: "user-1",
        text: "Hello",
        platformName: "telegram",
        chatId: "42",
      }),
    );

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.metadata).toEqual({
      chatId: "42",
      platformName: "telegram",
    });
  });

  test("returns 400 when userId is missing", async () => {
    const res = await app.handle(
      messageRequest(AGENT_ID, {
        text: "Hello",
        platformName: "telegram",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("userId and text are required");
  });

  test("returns 400 when text is missing", async () => {
    const res = await app.handle(
      messageRequest(AGENT_ID, {
        userId: "user-1",
        platformName: "telegram",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("userId and text are required");
  });

  test("returns 401 without auth token", async () => {
    const req = new Request(`http://localhost/agents/${AGENT_ID}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", text: "hello", platformName: "telegram" }),
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });

  test("returns 404 for agent not found", async () => {
    const res = await app.handle(
      messageRequest("nonexistent-agent", {
        userId: "user-1",
        text: "Hello",
        platformName: "telegram",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Agent not found");
  });
});
