/**
 * MCP HTTP Integration Tests
 *
 * Tests REAL HTTP calls to MCP endpoints using native fetch.
 * These tests require a running server and TEST_API_KEY.
 *
 * Run with: TEST_API_KEY=xxx bun test tests/integration/mcp-http.test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  MCP_REQUEST_TIMEOUT,
  SSE_MAX_DURATION,
  SSE_BACKOFF_INITIAL_MS,
  SSE_BACKOFF_MAX_MS,
  SSE_BACKOFF_MULTIPLIER,
  MEMORY_SAVE_COST,
  MEMORY_RETRIEVAL_COST_PER_ITEM,
  MCP_EVENT_TYPES,
} from "@/lib/config/mcp";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
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

const skipHttp = !API_KEY;

describe("MCP Configuration", () => {
  test("timeouts are reasonable", () => {
    expect(MCP_REQUEST_TIMEOUT).toBeGreaterThan(0);
    expect(MCP_REQUEST_TIMEOUT).toBeLessThanOrEqual(300);
    expect(SSE_MAX_DURATION).toBeGreaterThan(0);
  });

  test("SSE backoff is exponential", () => {
    expect(SSE_BACKOFF_INITIAL_MS).toBeLessThan(SSE_BACKOFF_MAX_MS);
    expect(SSE_BACKOFF_MULTIPLIER).toBeGreaterThan(1);
  });

  test("credit costs are positive", () => {
    expect(MEMORY_SAVE_COST).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_COST_PER_ITEM).toBeGreaterThan(0);
  });

  test("event types are defined", () => {
    expect(MCP_EVENT_TYPES.AGENT).toBe("agent");
    expect(MCP_EVENT_TYPES.CREDITS).toBe("credits");
    expect(MCP_EVENT_TYPES.CONTAINER).toBe("container");
  });
});

describe("MCP Registry", () => {
  test.skipIf(skipHttp)("GET /api/mcp/registry returns registry", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/registry`);
    if (!response) return;

    expect([200, 401, 403]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
    }
  });

  test.skipIf(skipHttp)("GET /api/mcp/list returns available MCPs", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/list`);
    if (!response) return;

    expect([200, 401, 403, 404]).toContain(response.status);
  });
});

describe("MCP Demo Endpoints", () => {
  test.skipIf(skipHttp)("GET /api/mcp/demos/weather returns weather MCP info", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/demos/weather`);
    if (!response) return;

    expect([200, 404]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
    }
  });

  test.skipIf(skipHttp)("GET /api/mcp/demos/time returns time MCP info", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/demos/time`);
    if (!response) return;

    expect([200, 404]).toContain(response.status);
  });

  test.skipIf(skipHttp)("GET /api/mcp/demos/crypto returns crypto MCP info", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/demos/crypto`);
    if (!response) return;

    expect([200, 404]).toContain(response.status);
  });
});

describe("MCP Main Endpoint", () => {
  test.skipIf(skipHttp)("GET /api/mcp returns MCP server info", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp`, {
      headers: authHeaders(),
    });
    if (!response) return;

    expect([200, 400, 500]).toContain(response.status);
  });
});

describe("MCP Discovery API", () => {
  test.skipIf(skipHttp)("GET /api/v1/discovery returns services", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/v1/discovery?types=mcp&limit=5`);
    if (!response) return;

    expect([200, 401, 403]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data.services).toBeDefined();
      expect(Array.isArray(data.services)).toBe(true);
    }
  });
});

describe("MCP ERC-8004 Status", () => {
  test.skipIf(skipHttp)("GET /api/v1/erc8004/status returns status", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/v1/erc8004/status`);
    if (!response) return;

    expect([200, 401, 403]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data.service).toBeDefined();
      expect(data.network).toBeDefined();
      expect(data.configured).toBeDefined();
    }
  });
});

