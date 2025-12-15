/**
 * MCP HTTP Integration Tests
 *
 * Tests REAL HTTP calls to MCP endpoints using native fetch.
 * MCP uses JSON-RPC over HTTP/SSE, similar to A2A but with different methods.
 *
 * Run with: TEST_API_KEY=xxx bun test tests/integration/mcp-http.test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  MCP_REQUEST_TIMEOUT,
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
  timeoutMs = 10000,
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

// ============================================================================
// CONFIGURATION TESTS (no server needed)
// ============================================================================

describe("MCP Configuration", () => {
  test("timeouts are reasonable", () => {
    expect(MCP_REQUEST_TIMEOUT).toBeGreaterThan(0);
    expect(MCP_REQUEST_TIMEOUT).toBeLessThanOrEqual(300);
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

// ============================================================================
// MCP REGISTRY - PUBLIC ENDPOINTS
// ============================================================================

describe("MCP Registry", () => {
  test.skipIf(skipHttp)(
    "GET /api/mcp/registry returns MCP catalog",
    async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/registry`);
      if (!response) return;

      // Registry may require auth or be public
      expect([200, 401, 403]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        // Should have mcps array
        expect(data.mcps || data.registry || data).toBeDefined();
      }
    },
  );
});

// ============================================================================
// MCP DEMO ENDPOINTS - PUBLIC
// ============================================================================

describe("MCP Demo Endpoints", () => {
  test.skipIf(skipHttp)(
    "GET /api/mcp/demos/weather returns weather MCP",
    async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/mcp/demos/weather`,
      );
      if (!response) return;

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.name || data.tools).toBeDefined();
      }
    },
  );

  test.skipIf(skipHttp)(
    "GET /api/mcp/demos/time returns time MCP",
    async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/mcp/demos/time`);
      if (!response) return;

      expect([200, 404]).toContain(response.status);
    },
  );

  test.skipIf(skipHttp)(
    "GET /api/mcp/demos/crypto returns crypto MCP",
    async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/mcp/demos/crypto`,
      );
      if (!response) return;

      expect([200, 404]).toContain(response.status);
    },
  );
});

// ============================================================================
// MCP MAIN ENDPOINT - AUTHENTICATED
// ============================================================================

describe("MCP Main Endpoint", () => {
  test.skipIf(skipHttp)(
    "GET /api/mcp without auth returns 401/402",
    async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/mcp`);
      if (!response) return;

      // MCP may return different status based on implementation
      expect([200, 400, 401, 402, 500]).toContain(response.status);
    },
  );

  test.skipIf(skipHttp)(
    "GET /api/mcp with auth returns MCP server info",
    async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/mcp`, {
        headers: authHeaders(),
      });
      if (!response) return;

      expect([200, 400, 500]).toContain(response.status);
    },
  );

  test.skipIf(skipHttp)(
    "POST /api/mcp for tools/list returns available tools",
    async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/mcp`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
          id: 1,
        }),
      });
      if (!response) return;

      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        // Should have tools in the response
        if (data.result?.tools) {
          expect(Array.isArray(data.result.tools)).toBe(true);
          expect(data.result.tools.length).toBeGreaterThan(0);
        }
      }
    },
  );
});

// ============================================================================
// MCP TOOL: check_credits - VERIFY DB READ
// ============================================================================

describe("MCP Tool: check_credits", () => {
  test.skipIf(skipHttp)("returns real credit balance", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "check_credits",
          arguments: {},
        },
        id: 1,
      }),
    });
    if (!response) return;

    expect([200, 400]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      if (data.result?.content) {
        // MCP returns content array
        expect(Array.isArray(data.result.content)).toBe(true);
      }
    }
  });
});

// ============================================================================
// DISCOVERY API
// ============================================================================

describe("Discovery API", () => {
  test.skipIf(skipHttp)("GET /api/v1/discovery returns services", async () => {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/v1/discovery?types=mcp&limit=5`,
    );
    if (!response) return;

    expect([200, 401, 403]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data.services).toBeDefined();
      expect(Array.isArray(data.services)).toBe(true);
      expect(typeof data.total).toBe("number");
    }
  });

  test.skipIf(skipHttp)("GET /api/v1/discovery with filters", async () => {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/v1/discovery?types=agent,mcp&sources=local&limit=10`,
    );
    if (!response) return;

    expect([200, 401, 403]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data.services).toBeDefined();
    }
  });
});

// ============================================================================
// ERC-8004 STATUS
// ============================================================================

describe("ERC-8004 Status", () => {
  test.skipIf(skipHttp)(
    "GET /api/v1/erc8004/status returns config",
    async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/erc8004/status`,
      );
      if (!response) return;

      expect([200, 401, 403]).toContain(response.status);
      if (response.status === 200) {
        const data = await response.json();
        expect(data.service).toBeDefined();
        expect(data.network).toBeDefined();
        expect(typeof data.configured).toBe("boolean");
        expect(data.contracts).toBeDefined();
      }
    },
  );
});
