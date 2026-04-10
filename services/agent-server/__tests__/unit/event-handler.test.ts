import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";

// ── Mock @elizaos/core ──────────────────────────────────────────

const mockEmitEvent = mock(() => Promise.resolve());
const mockHandleMessage = mock((_rt: IAgentRuntime, _mem: Memory, callback?: HandlerCallback) =>
  callback ? callback({ text: "agent-response" }) : Promise.resolve([] as Memory[]),
);
const mockEnsureConnection = mock(() => Promise.resolve());

function createMockRuntime(): IAgentRuntime {
  return {
    emitEvent: mockEmitEvent,
    ensureConnection: mockEnsureConnection,
    messageService: {
      handleMessage: mockHandleMessage,
    },
    getService: mock(() => null),
  } as IAgentRuntime;
}

let mockRuntime = createMockRuntime();

mock.module("@elizaos/core", () => ({
  ChannelType: { DM: "DM" },
  createMessageMemory: mock(({ entityId, roomId, content }) => ({
    entityId,
    roomId,
    content,
  })),
  stringToUuid: mock((s: string) => `uuid-${s}`),
}));

mock.module("../../src/redis", () => ({
  getRedis: mock(() => ({
    get: mock(() => null),
    set: mock(() => "OK"),
  })),
}));

// ── Import after mocks ──────────────────────────────────────────

import {
  type AgentEvent,
  type DispatchResult,
  dispatchEvent,
  EventBodySchema,
  MAX_EVENT_BODY_BYTES,
} from "../../src/handlers/event";

// ── Helpers ─────────────────────────────────────────────────────

const AGENT_ID = "agent-001";
const USER_ID = "user-001";

function validEventBody(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    userId: USER_ID,
    type: "cron",
    payload: { cronId: "daily-check" },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("EventBodySchema validation", () => {
  test("accepts valid cron body", () => {
    const result = EventBodySchema.safeParse(validEventBody());
    expect(result.success).toBe(true);
  });

  test("accepts valid notification body", () => {
    const result = EventBodySchema.safeParse(validEventBody({ type: "notification" }));
    expect(result.success).toBe(true);
  });

  test("accepts valid system body", () => {
    const result = EventBodySchema.safeParse(validEventBody({ type: "system" }));
    expect(result.success).toBe(true);
  });

  test("rejects missing userId", () => {
    const body = { type: "cron", payload: {} };
    const result = EventBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test("rejects empty userId", () => {
    const result = EventBodySchema.safeParse(validEventBody({ userId: "" }));
    expect(result.success).toBe(false);
  });

  test("rejects userId exceeding max length", () => {
    const result = EventBodySchema.safeParse(validEventBody({ userId: "a".repeat(257) }));
    expect(result.success).toBe(false);
  });

  test("rejects userId with path traversal characters (../../secret)", () => {
    const result = EventBodySchema.safeParse(validEventBody({ userId: "../../secret" }));
    expect(result.success).toBe(false);
  });

  test("rejects userId with slash", () => {
    const result = EventBodySchema.safeParse(validEventBody({ userId: "user/admin" }));
    expect(result.success).toBe(false);
  });

  test("accepts userId with allowed special chars (@._-)", () => {
    const result = EventBodySchema.safeParse(validEventBody({ userId: "user@host.com" }));
    expect(result.success).toBe(true);
  });

  test("rejects missing type", () => {
    const body = { userId: "u1", payload: {} };
    const result = EventBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test("rejects invalid type (unknown string)", () => {
    const result = EventBodySchema.safeParse(validEventBody({ type: "unknown-type" }));
    expect(result.success).toBe(false);
  });

  test("rejects missing payload", () => {
    const body = { userId: "u1", type: "cron" };
    const result = EventBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test("accepts empty payload object", () => {
    const result = EventBodySchema.safeParse(validEventBody({ payload: {} }));
    expect(result.success).toBe(true);
  });

  test("rejects payload that is an array", () => {
    const result = EventBodySchema.safeParse(validEventBody({ payload: [1, 2, 3] }));
    expect(result.success).toBe(false);
  });

  test("rejects payload that is a string", () => {
    const result = EventBodySchema.safeParse(validEventBody({ payload: "not-an-object" }));
    expect(result.success).toBe(false);
  });

  test("rejects payload that is null", () => {
    const result = EventBodySchema.safeParse(validEventBody({ payload: null }));
    expect(result.success).toBe(false);
  });

  test("rejects payload that is a number", () => {
    const result = EventBodySchema.safeParse(validEventBody({ payload: 42 }));
    expect(result.success).toBe(false);
  });
});

describe("MAX_EVENT_BODY_BYTES", () => {
  test("is 64KB", () => {
    expect(MAX_EVENT_BODY_BYTES).toBe(64 * 1024);
  });
});

describe("dispatchEvent — cron", () => {
  beforeEach(() => {
    mockRuntime = createMockRuntime();
    mockEmitEvent.mockClear();
  });

  test("calls runtime.emitEvent with cron type", async () => {
    const result = await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "cron", {
      cronId: "daily",
    });
    expect(mockRuntime.emitEvent).toHaveBeenCalledTimes(1);
    const callArgs = mockRuntime.emitEvent.mock.calls[0];
    const payload = callArgs[1] as DispatchResult & {
      userId: string;
      payload: AgentEvent["payload"];
      source: string;
    };
    expect(callArgs[0]).toBe("cron");
    expect(payload.userId).toBe(USER_ID);
    expect(payload.payload).toEqual({ cronId: "daily" });
    expect(payload.source).toBe("agent-server");
    expect(result).toEqual({});
  });
});

describe("dispatchEvent — notification", () => {
  beforeEach(() => {
    mockRuntime = createMockRuntime();
    mockEnsureConnection.mockClear();
    mockHandleMessage.mockClear();
  });

  test("calls ensureConnection and messageService.handleMessage", async () => {
    const result = await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "notification", {
      text: "Hello agent",
    });
    expect(mockRuntime.ensureConnection).toHaveBeenCalledTimes(1);
    expect(mockRuntime.messageService.handleMessage).toHaveBeenCalledTimes(1);
    expect(result.response).toBe("agent-response");
  });

  test("uses payload.message when payload.text is absent", async () => {
    await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "notification", {
      message: "Msg from payload.message",
    });
    expect(mockRuntime.messageService.handleMessage).toHaveBeenCalledTimes(1);
  });

  test("JSON-stringifies payload when neither text nor message present", async () => {
    await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "notification", { custom: "data" });
    expect(mockRuntime.messageService.handleMessage).toHaveBeenCalledTimes(1);
  });

  test("throws when runtime.messageService is unavailable", async () => {
    const errRuntime = createMockRuntime();
    errRuntime.messageService = undefined;

    await expect(
      dispatchEvent(errRuntime, AGENT_ID, USER_ID, "notification", { text: "hi" }),
    ).rejects.toThrow("Message service unavailable");
  });
});

describe("dispatchEvent — system", () => {
  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  test("health action returns agent status", async () => {
    const result = await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "system", {
      action: "health",
    });
    expect(result).toEqual({ status: "running", agentId: AGENT_ID });
  });

  test("config-reload action returns placeholder", async () => {
    const result = await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "system", {
      action: "config-reload",
    });
    expect(result).toEqual({ reloaded: false, reason: "not yet implemented" });
  });

  test("unknown action returns empty result", async () => {
    const result = await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "system", {
      action: "unknown",
    });
    expect(result).toEqual({});
  });

  test("missing action field returns empty result", async () => {
    const result = await dispatchEvent(mockRuntime, AGENT_ID, USER_ID, "system", {});
    expect(result).toEqual({});
  });
});

describe("dispatchEvent — error handling", () => {
  test("propagates error from runtime.emitEvent", async () => {
    const errRuntime = createMockRuntime();
    errRuntime.emitEvent = mock(() => Promise.reject(new Error("emit failed")));

    await expect(dispatchEvent(errRuntime, AGENT_ID, USER_ID, "cron", {})).rejects.toThrow(
      "emit failed",
    );
  });

  test("propagates error from messageService.handleMessage", async () => {
    const errRuntime = createMockRuntime();
    errRuntime.messageService.handleMessage = mock(() =>
      Promise.reject(new Error("message failed")),
    );

    await expect(
      dispatchEvent(errRuntime, AGENT_ID, USER_ID, "notification", { text: "hi" }),
    ).rejects.toThrow("message failed");
  });
});
