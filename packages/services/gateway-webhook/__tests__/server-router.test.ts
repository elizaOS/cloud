import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// ── Mock hash-router (DNS/pod resolution) ───────────────────────

let mockTargets: string[] = ["10.0.0.1:3000"];

mock.module("../src/hash-router", () => ({
  getHashTargets: async () => mockTargets,
  refreshHashRing: async () => {},
}));

// ── Mock fs (K8s service account token/cert) ────────────────────

mock.module("fs", () => ({
  readFileSync: () => {
    throw new Error("not in k8s");
  },
}));

// ── Import after mocks ──────────────────────────────────────────

import { forwardToServer, type ForwardMessageOptions } from "../src/server-router";

// ── Helpers ─────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof spyOn>;
let lastFetchBody: string | undefined;

function captureAndRespondOk() {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    lastFetchBody = init?.body as string;
    return new Response(JSON.stringify({ response: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("forwardToServer", () => {
  beforeEach(() => {
    mockTargets = ["10.0.0.1:3000"];
    lastFetchBody = undefined;
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(captureAndRespondOk());
    process.env.AGENT_SERVER_SHARED_SECRET = "test-secret";
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.AGENT_SERVER_SHARED_SECRET;
  });

  test("sends only userId and text when options are omitted", async () => {
    const result = await forwardToServer(
      "http://server.ns.svc:3000",
      "server-1",
      "agent-001",
      "user-001",
      "Hello",
    );

    expect(result).toBe("ok");
    expect(lastFetchBody).toBeDefined();
    const parsed = JSON.parse(lastFetchBody!);
    expect(parsed).toEqual({ userId: "user-001", text: "Hello" });
    expect(parsed.platformName).toBeUndefined();
    expect(parsed.senderName).toBeUndefined();
    expect(parsed.chatId).toBeUndefined();
  });

  test("includes all platform metadata when all options provided", async () => {
    const options: ForwardMessageOptions = {
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    };

    await forwardToServer(
      "http://server.ns.svc:3000",
      "server-1",
      "agent-001",
      "user-001",
      "Hello",
      options,
    );

    const parsed = JSON.parse(lastFetchBody!);
    expect(parsed).toEqual({
      userId: "user-001",
      text: "Hello",
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    });
  });

  test("includes only platformName and chatId when senderName is undefined", async () => {
    const options: ForwardMessageOptions = {
      platformName: "twilio",
      senderName: undefined,
      chatId: "+15551234567",
    };

    await forwardToServer(
      "http://server.ns.svc:3000",
      "server-1",
      "agent-001",
      "user-001",
      "Hello via SMS",
      options,
    );

    const parsed = JSON.parse(lastFetchBody!);
    expect(parsed.userId).toBe("user-001");
    expect(parsed.text).toBe("Hello via SMS");
    expect(parsed.platformName).toBe("twilio");
    expect(parsed.chatId).toBe("+15551234567");
    expect(parsed.senderName).toBeUndefined();
  });

  test("includes only platformName when chatId and senderName are undefined", async () => {
    const options: ForwardMessageOptions = {
      platformName: "blooio",
    };

    await forwardToServer(
      "http://server.ns.svc:3000",
      "server-1",
      "agent-001",
      "user-001",
      "Hi",
      options,
    );

    const parsed = JSON.parse(lastFetchBody!);
    expect(parsed.platformName).toBe("blooio");
    expect(parsed.senderName).toBeUndefined();
    expect(parsed.chatId).toBeUndefined();
  });

  test("sends enriched body to the correct endpoint path", async () => {
    await forwardToServer(
      "http://server.ns.svc:3000",
      "server-1",
      "agent-xyz",
      "user-001",
      "Hello",
      { platformName: "whatsapp", senderName: "Bob", chatId: "waid-123" },
    );

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("http://10.0.0.1:3000/agents/agent-xyz/message");
  });

  test("empty options object sends only userId and text", async () => {
    await forwardToServer(
      "http://server.ns.svc:3000",
      "server-1",
      "agent-001",
      "user-001",
      "Hello",
      {},
    );

    const parsed = JSON.parse(lastFetchBody!);
    expect(parsed).toEqual({ userId: "user-001", text: "Hello" });
  });
});
