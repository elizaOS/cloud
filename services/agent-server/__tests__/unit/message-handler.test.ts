import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";

// ── Mock @elizaos/core ──────────────────────────────────────────

const mockHandleMessage = mock((_rt: IAgentRuntime, _mem: Memory, callback?: HandlerCallback) =>
  callback ? callback({ text: "agent-response" }) : Promise.resolve([] as Memory[]),
);
const mockEnsureConnection = mock(() => Promise.resolve());
const mockCreateMessageMemory = mock(
  ({ entityId, roomId, content }: { entityId: string; roomId: string; content: unknown }) => ({
    entityId,
    roomId,
    content,
  }),
);
const mockStringToUuid = mock((s: string) => `uuid-${s}`);

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
  stringToUuid: mockStringToUuid,
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

import { AgentManager, type MessageMetadata } from "../../src/agent-manager";

// ── Helpers ─────────────────────────────────────────────────────

interface TestAgentEntry {
  agentId: string;
  characterRef: string;
  runtime: IAgentRuntime;
  state: "running" | "stopped";
}

type AgentManagerWithTestState = AgentManager & { agents: Map<string, TestAgentEntry> };

const AGENT_ID = "agent-001";
const USER_ID = "user-001";

function setupManager(): AgentManager {
  const manager = new AgentManager();
  const agents = (manager as AgentManagerWithTestState).agents;
  agents.set(AGENT_ID, {
    agentId: AGENT_ID,
    characterRef: "test-char",
    runtime: createMockRuntime(),
    state: "running",
  });
  return manager;
}

// ── Tests ───────────────────────────────────────────────────────

describe("AgentManager.handleMessage — platform metadata", () => {
  let manager: AgentManager;

  beforeEach(() => {
    mockEnsureConnection.mockClear();
    mockHandleMessage.mockClear();
    mockCreateMessageMemory.mockClear();
    mockStringToUuid.mockClear();
    process.env.SERVER_NAME = "test-server";
    manager = setupManager();
  });

  test("uses senderName as userName when metadata is provided", async () => {
    const metadata: MessageMetadata = {
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    };

    await manager.handleMessage(AGENT_ID, USER_ID, "Hello", metadata);

    expect(mockEnsureConnection).toHaveBeenCalledTimes(1);
    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.userName).toBe("Alice");
  });

  test("falls back to userId for userName when senderName is absent", async () => {
    await manager.handleMessage(AGENT_ID, USER_ID, "Hello");

    expect(mockEnsureConnection).toHaveBeenCalledTimes(1);
    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.userName).toBe(USER_ID);
  });

  test("uses platformName as source when metadata is provided", async () => {
    const metadata: MessageMetadata = {
      platformName: "whatsapp",
      senderName: "Bob",
      chatId: "waid-123",
    };

    await manager.handleMessage(AGENT_ID, USER_ID, "Hello", metadata);

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.source).toBe("whatsapp");

    expect(mockCreateMessageMemory).toHaveBeenCalledTimes(1);
    const memoryArgs = mockCreateMessageMemory.mock.calls[0][0] as {
      content: { source: string };
    };
    expect(memoryArgs.content.source).toBe("whatsapp");
  });

  test("falls back to 'agent-server' source when platformName is absent", async () => {
    await manager.handleMessage(AGENT_ID, USER_ID, "Hello");

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.source).toBe("agent-server");

    const memoryArgs = mockCreateMessageMemory.mock.calls[0][0] as {
      content: { source: string };
    };
    expect(memoryArgs.content.source).toBe("agent-server");
  });

  test("stores chatId and platformName in connection metadata", async () => {
    const metadata: MessageMetadata = {
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    };

    await manager.handleMessage(AGENT_ID, USER_ID, "Hello", metadata);

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.metadata).toEqual({
      chatId: "42",
      platformName: "telegram",
    });
  });

  test("omits connection metadata when chatId and platformName are absent", async () => {
    await manager.handleMessage(AGENT_ID, USER_ID, "Hello");

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.metadata).toBeUndefined();
  });

  test("preserves channelId as agentId-userId regardless of metadata", async () => {
    const metadata: MessageMetadata = {
      platformName: "telegram",
      chatId: "42",
    };

    await manager.handleMessage(AGENT_ID, USER_ID, "Hello", metadata);

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.channelId).toBe(`${AGENT_ID}-${USER_ID}`);
  });

  test("handles empty metadata object gracefully", async () => {
    await manager.handleMessage(AGENT_ID, USER_ID, "Hello", {});

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.userName).toBe(USER_ID);
    expect(connectionArgs.source).toBe("agent-server");
    expect(connectionArgs.metadata).toBeUndefined();
  });

  test("handles metadata with only senderName", async () => {
    const metadata: MessageMetadata = { senderName: "Charlie" };

    await manager.handleMessage(AGENT_ID, USER_ID, "Hello", metadata);

    const connectionArgs = mockEnsureConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(connectionArgs.userName).toBe("Charlie");
    expect(connectionArgs.source).toBe("agent-server");
    expect(connectionArgs.metadata).toBeUndefined();
  });

  test("returns agent response regardless of metadata", async () => {
    const response = await manager.handleMessage(AGENT_ID, USER_ID, "Hello", {
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    });
    expect(response).toBe("agent-response");
  });

  test("tracks inFlight count with metadata", async () => {
    expect(manager.getStatus().inFlight).toBe(0);

    const response = await manager.handleMessage(AGENT_ID, USER_ID, "Hello", {
      platformName: "telegram",
    });
    expect(response).toBeDefined();
    expect(manager.getStatus().inFlight).toBe(0);
  });
});
