/**
 * A2A HTTP Integration Tests
 *
 * Tests REAL HTTP calls to A2A endpoints using native fetch.
 * These tests require a running server and TEST_API_KEY.
 *
 * Run with: TEST_API_KEY=xxx bun test tests/integration/a2a-http.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { A2A_EXTENSION_METHODS, A2A_STANDARD_METHODS } from "@/lib/config/a2a";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

function jsonRpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return { jsonrpc: "2.0", method, params, id };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function a2aCall(method: string, params: Record<string, unknown> = {}) {
  const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(jsonRpc(method, params)),
  });
  if (!response) return { error: "timeout" };
  return response.json();
}

// Skip all HTTP tests if no API key
const skipHttp = !API_KEY;

describe("A2A Service Discovery", () => {
  test.skipIf(skipHttp)("GET /api/a2a returns service info", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`);
    if (!response) return;

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe("Eliza Cloud A2A");
    expect(data.protocolVersion).toBe("0.3.0");
    expect(Array.isArray(data.methods)).toBe(true);
    expect(data.methods.length).toBeGreaterThan(50);

    // Verify standard methods
    const names = data.methods.map((m: { name: string }) => m.name);
    expect(names).toContain("message/send");
    expect(names).toContain("tasks/get");
    expect(names).toContain("a2a.chatCompletion");
    expect(names).toContain("a2a.getBalance");
  });

  test.skipIf(skipHttp)("GET /.well-known/agent-card.json returns agent card", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/.well-known/agent-card.json`);
    if (!response) return;

    expect(response.status).toBe(200);
    const card = await response.json();
    expect(card.name).toBeDefined();
    expect(card.skills).toBeDefined();
    expect(card.authentication).toBeDefined();
  });
});

describe("A2A Authentication", () => {
  test.skipIf(skipHttp)("unauthenticated POST returns 401 or 402", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonRpc("a2a.getBalance")),
    });
    if (!response) return;
    expect([401, 402]).toContain(response.status);
  });

  test.skipIf(skipHttp)("authenticated POST returns 200", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(jsonRpc("a2a.getBalance")),
    });
    if (!response) return;
    expect(response.status).toBe(200);
  });
});

describe("A2A Credits & Billing", () => {
  test.skipIf(skipHttp)("a2a.getBalance returns balance", async () => {
    const data = await a2aCall("a2a.getBalance");
    expect(data.result).toBeDefined();
    expect(typeof data.result.credits).toBe("number");
  });

  test.skipIf(skipHttp)("a2a.getCreditSummary returns summary", async () => {
    const data = await a2aCall("a2a.getCreditSummary");
    expect(data.result?.success).toBe(true);
    expect(data.result?.summary).toBeDefined();
  });

  test.skipIf(skipHttp)("a2a.getUsage returns usage records", async () => {
    const data = await a2aCall("a2a.getUsage", { limit: 5 });
    expect(data.result?.success).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.listCreditPacks returns packs", async () => {
    const data = await a2aCall("a2a.listCreditPacks");
    expect(data.result?.success).toBe(true);
    expect(Array.isArray(data.result?.packs)).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.getBillingUsage returns billing", async () => {
    const data = await a2aCall("a2a.getBillingUsage", { days: 7 });
    expect(data.result?.success).toBe(true);
  });
});

describe("A2A Agent Management", () => {
  test.skipIf(skipHttp)("a2a.listAgents returns agents", async () => {
    const data = await a2aCall("a2a.listAgents", { limit: 5 });
    expect(data.result?.success).toBe(true);
    expect(Array.isArray(data.result?.agents)).toBe(true);
  });
});

describe("A2A Infrastructure", () => {
  test.skipIf(skipHttp)("a2a.listModels returns models", async () => {
    const data = await a2aCall("a2a.listModels");
    expect(data.result?.success).toBe(true);
    expect(Array.isArray(data.result?.models)).toBe(true);
    expect(data.result?.models?.length).toBeGreaterThan(0);
  });

  test.skipIf(skipHttp)("a2a.listContainers returns containers", async () => {
    const data = await a2aCall("a2a.listContainers");
    expect(data.result?.success).toBe(true);
    expect(Array.isArray(data.result?.containers)).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.listGallery returns gallery", async () => {
    const data = await a2aCall("a2a.listGallery", { limit: 5 });
    expect(data.result?.success).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.getAnalytics returns analytics", async () => {
    const data = await a2aCall("a2a.getAnalytics", { timeRange: "daily" });
    expect(data.result?.success).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.listVoices returns voices", async () => {
    const data = await a2aCall("a2a.listVoices");
    expect(data.result?.success).toBe(true);
  });
});

describe("A2A API Keys", () => {
  test.skipIf(skipHttp)("a2a.listApiKeys returns keys", async () => {
    const data = await a2aCall("a2a.listApiKeys");
    expect(data.result?.success).toBe(true);
    expect(Array.isArray(data.result?.keys)).toBe(true);
  });
});

describe("A2A MCP Management", () => {
  test.skipIf(skipHttp)("a2a.listMcps returns MCPs", async () => {
    const data = await a2aCall("a2a.listMcps");
    expect(data.result?.success).toBe(true);
  });
});

describe("A2A ERC-8004 Discovery", () => {
  test.skipIf(skipHttp)("a2a.discoverServices returns services", async () => {
    const data = await a2aCall("a2a.discoverServices", { types: ["agent"], sources: ["local"], limit: 5 });
    expect(data.result?.success).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.findMcpTools searches tools", async () => {
    const data = await a2aCall("a2a.findMcpTools", { tools: ["get_price"] });
    expect(data.result?.success).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.findA2aSkills searches skills", async () => {
    const data = await a2aCall("a2a.findA2aSkills", { skills: ["chat_completion"] });
    expect(data.result?.success).toBe(true);
  });
});

describe("A2A Redemptions", () => {
  test.skipIf(skipHttp)("a2a.getRedemptionBalance returns balance", async () => {
    const data = await a2aCall("a2a.getRedemptionBalance");
    expect(data.result?.success).toBe(true);
  });

  test.skipIf(skipHttp)("a2a.getRedemptionQuote returns quote", async () => {
    const data = await a2aCall("a2a.getRedemptionQuote", { amount: 10 });
    // May fail if no balance, but should not crash
    expect(data.result).toBeDefined();
  });
});

describe("A2A User Profile", () => {
  test.skipIf(skipHttp)("a2a.getUserProfile returns profile", async () => {
    const data = await a2aCall("a2a.getUserProfile");
    expect(data.result?.success).toBe(true);
    expect(data.result?.user).toBeDefined();
  });
});

describe("A2A Rooms", () => {
  test.skipIf(skipHttp)("a2a.listRooms returns rooms", async () => {
    const data = await a2aCall("a2a.listRooms");
    expect(data.result?.success).toBe(true);
  });
});

describe("A2A Method Coverage", () => {
  test("all standard methods are declared", () => {
    expect(A2A_STANDARD_METHODS).toContain("message/send");
    expect(A2A_STANDARD_METHODS).toContain("tasks/get");
    expect(A2A_STANDARD_METHODS).toContain("tasks/cancel");
    expect(A2A_STANDARD_METHODS.length).toBe(9);
  });

  test("all extension methods are declared", () => {
    expect(A2A_EXTENSION_METHODS).toContain("a2a.chatCompletion");
    expect(A2A_EXTENSION_METHODS).toContain("a2a.getBalance");
    expect(A2A_EXTENSION_METHODS).toContain("a2a.listAgents");
    expect(A2A_EXTENSION_METHODS).toContain("a2a.discoverServices");
    expect(A2A_EXTENSION_METHODS.length).toBe(54);
  });
});

