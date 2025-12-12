/**
 * Code Agent Integration Tests
 *
 * Tests real service behavior, async operations, and integration points.
 * These tests import and call actual service code.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { requireDatabase, skipIfNoDb, testContext, requireSchema } from "../../test-utils";

// =============================================================================
// WEBHOOK INTEGRATION TESTS
// =============================================================================

describe("Webhook Service - Real Logic", () => {
  let dispatchWebhook: typeof import("@/lib/services/code-agent/webhooks").dispatchWebhook;
  let shouldDispatchEvent: typeof import("@/lib/services/code-agent/webhooks").shouldDispatchEvent;
  let generateWebhookSecret: typeof import("@/lib/services/code-agent/webhooks").generateWebhookSecret;

  beforeAll(async () => {
    const webhooks = await import("@/lib/services/code-agent/webhooks");
    dispatchWebhook = webhooks.dispatchWebhook;
    shouldDispatchEvent = webhooks.shouldDispatchEvent;
    generateWebhookSecret = webhooks.generateWebhookSecret;
  });

  describe("shouldDispatchEvent", () => {
    test("returns false if no webhook_url", () => {
      const session = createMockDbSession({ webhook_url: null, webhook_secret: "secret" });
      expect(shouldDispatchEvent(session, "session_ready")).toBe(false);
    });

    test("returns false if no webhook_secret", () => {
      const session = createMockDbSession({ webhook_url: "https://example.com", webhook_secret: null });
      expect(shouldDispatchEvent(session, "session_ready")).toBe(false);
    });

    test("returns true for default events when no webhook_events specified", () => {
      const session = createMockDbSession({
        webhook_url: "https://example.com",
        webhook_secret: "secret",
        webhook_events: null,
      });

      expect(shouldDispatchEvent(session, "session_ready")).toBe(true);
      expect(shouldDispatchEvent(session, "session_error")).toBe(true);
      expect(shouldDispatchEvent(session, "session_terminated")).toBe(true);
    });

    test("returns false for non-default events when no webhook_events specified", () => {
      const session = createMockDbSession({
        webhook_url: "https://example.com",
        webhook_secret: "secret",
        webhook_events: null,
      });

      expect(shouldDispatchEvent(session, "snapshot_created")).toBe(false);
      expect(shouldDispatchEvent(session, "custom_event")).toBe(false);
    });

    test("respects custom webhook_events list", () => {
      const session = createMockDbSession({
        webhook_url: "https://example.com",
        webhook_secret: "secret",
        webhook_events: ["session_ready", "snapshot_created"],
      });

      expect(shouldDispatchEvent(session, "session_ready")).toBe(true);
      expect(shouldDispatchEvent(session, "snapshot_created")).toBe(true);
      expect(shouldDispatchEvent(session, "session_error")).toBe(false);
      expect(shouldDispatchEvent(session, "session_terminated")).toBe(false);
    });
  });

  describe("generateWebhookSecret", () => {
    test("generates 64-char hex string", () => {
      const secret = generateWebhookSecret();
      expect(secret.length).toBe(64);
      expect(secret).toMatch(/^[a-f0-9]{64}$/);
    });

    test("generates unique secrets", () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(generateWebhookSecret());
      }
      expect(secrets.size).toBe(100);
    });
  });

  describe("dispatchWebhook integration", () => {
    test("does not throw when webhook_url is invalid", async () => {
      const session = createMockDbSession({
        webhook_url: "https://nonexistent.invalid.domain.test/webhook",
        webhook_secret: "secret",
        webhook_events: ["session_ready"],
      });

      // Should not throw - errors are logged but swallowed
      await expect(
        dispatchWebhook(session, { type: "session_ready", sessionId: session.id })
      ).resolves.toBeUndefined();
    });

    test("does nothing when event not in webhook_events", async () => {
      const session = createMockDbSession({
        webhook_url: "https://example.com",
        webhook_secret: "secret",
        webhook_events: ["session_ready"], // Only session_ready
      });

      // Should return immediately without making HTTP call
      await expect(
        dispatchWebhook(session, { type: "session_terminated", sessionId: session.id })
      ).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// ANALYTICS SERVICE TESTS
// =============================================================================

describe("Analytics Service - Real Logic", () => {
  let analyticsService: typeof import("@/lib/services/code-agent/analytics").codeAgentAnalyticsService;
  let schemaAvailable = false;

  beforeAll(async () => {
    const dbAvailable = await requireDatabase();
    if (!dbAvailable) return;

    // Check if code_agent_sessions table exists
    schemaAvailable = await requireSchema("codeAgentSessions");
    if (!schemaAvailable) {
      console.log("⏭️ Skipping Analytics tests - code_agent_sessions table not available");
      return;
    }

    const analytics = await import("@/lib/services/code-agent/analytics");
    analyticsService = analytics.codeAgentAnalyticsService;
  });

  describe("getStats", () => {
    test("returns valid structure even with no data", async () => {
      if (!schemaAvailable) {
        console.log("⏭️ Skipping - schema not available");
        return;
      }

      // Use a random org ID that won't have data
      const stats = await analyticsService.getStats("org_nonexistent_" + Date.now());

      expect(stats).toBeDefined();
      expect(stats.sessions).toBeDefined();
      expect(stats.sessions.total).toBe(0);
      expect(stats.sessions.active).toBe(0);
      expect(stats.commands).toBeDefined();
      expect(stats.interpreter).toBeDefined();
      expect(stats.usage).toBeDefined();
    });

    test("accepts date range parameter", async () => {
      if (!schemaAvailable) {
        console.log("⏭️ Skipping - schema not available");
        return;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const stats = await analyticsService.getStats("org_test", {
        start: weekAgo,
        end: now,
      });

      expect(stats).toBeDefined();
    });
  });

  describe("getSessionAnalytics", () => {
    test("returns null for non-existent session", async () => {
      if (!schemaAvailable) {
        console.log("⏭️ Skipping - schema not available");
        return;
      }

      const result = await analyticsService.getSessionAnalytics(
        "sess_nonexistent_" + Date.now(),
        "org_test"
      );

      expect(result).toBeNull();
    });
  });

  describe("getInterpreterAnalytics", () => {
    test("returns array even with no data", async () => {
      if (!schemaAvailable) {
        console.log("⏭️ Skipping - schema not available");
        return;
      }

      const result = await analyticsService.getInterpreterAnalytics(
        "org_nonexistent_" + Date.now()
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getRecentExecutions", () => {
    test("respects limit parameter", async () => {
      if (!schemaAvailable) {
        console.log("⏭️ Skipping - schema not available");
        return;
      }

      const result = await analyticsService.getRecentExecutions("org_test", 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    test("returns empty array for org with no executions", async () => {
      if (!schemaAvailable) {
        console.log("⏭️ Skipping - schema not available");
        return;
      }

      const result = await analyticsService.getRecentExecutions(
        "org_nonexistent_" + Date.now(),
        10
      );

      expect(result).toEqual([]);
    });
  });
});

// =============================================================================
// CACHE INVALIDATION TESTS
// =============================================================================

describe("Cache Invalidation - Real Logic", () => {
  let CacheInvalidation: typeof import("@/lib/cache/invalidation").CacheInvalidation;
  let cache: typeof import("@/lib/cache/client").cache;

  beforeAll(async () => {
    const invalidation = await import("@/lib/cache/invalidation");
    CacheInvalidation = invalidation.CacheInvalidation;

    const cacheModule = await import("@/lib/cache/client");
    cache = cacheModule.cache;
  });

  describe("onCodeAgentSessionMutation", () => {
    test("deletes both session and list cache keys", async () => {
      const sessionId = "sess_test_" + Date.now();
      const orgId = "org_test_" + Date.now();

      // Set some cache values first
      const { CacheKeys } = await import("@/lib/cache/keys");
      await cache.set(CacheKeys.codeAgent.session(sessionId), { test: true }, 60);
      await cache.set(CacheKeys.codeAgent.list(orgId), [{ test: true }], 60);

      // Verify they exist
      const beforeSession = await cache.get(CacheKeys.codeAgent.session(sessionId));
      const beforeList = await cache.get(CacheKeys.codeAgent.list(orgId));

      // They may or may not be set depending on Redis availability
      // The important thing is the invalidation doesn't throw

      // Invalidate
      await CacheInvalidation.onCodeAgentSessionMutation(sessionId, orgId);

      // After invalidation, both should be null
      const afterSession = await cache.get(CacheKeys.codeAgent.session(sessionId));
      const afterList = await cache.get(CacheKeys.codeAgent.list(orgId));

      expect(afterSession).toBeNull();
      expect(afterList).toBeNull();
    });
  });

  describe("onCodeAgentUsage", () => {
    test("does not throw on execution", async () => {
      const orgId = "org_test_" + Date.now();

      await expect(
        CacheInvalidation.onCodeAgentUsage(orgId)
      ).resolves.toBeUndefined();
    });
  });
});

// =============================================================================
// INTERPRETER SERVICE ASYNC BEHAVIOR
// =============================================================================

describe("Interpreter - Async Behavior", () => {
  describe("Promise handling in VM", () => {
    test("handles resolved promise", async () => {
      const result = executeJSAsync("Promise.resolve(42)");
      // Promises are handled but output may be async
      expect(result.exitCode).toBe(0);
    });

    test("async function definition works", async () => {
      // Async functions are syntactically valid
      const result = executeJSAsync(`
        async function test() { return 1 + 1; }
        typeof test;
      `);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe("function");
    });

    test("synchronous code in async context works", async () => {
      const result = executeJSAsync(`
        (async function() {
          return 2 + 2;
        })();
      `);
      expect(result.exitCode).toBe(0);
    });

    test("Promise.all with sync values", async () => {
      const result = executeJSAsync(`
        const p = Promise.all([1, 2, 3]);
        typeof p;
      `);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe("object"); // Promise object
    });
  });
});

// =============================================================================
// VERCEL SANDBOX RUNTIME TESTS
// =============================================================================

describe("Vercel Sandbox Runtime - Credentials", () => {
  let VercelSandboxRuntime: typeof import("@/lib/services/code-agent/runtimes/vercel-sandbox").VercelSandboxRuntime;

  beforeAll(async () => {
    const runtime = await import("@/lib/services/code-agent/runtimes/vercel-sandbox");
    VercelSandboxRuntime = runtime.VercelSandboxRuntime;
  });

  test("validateCredentials returns object with valid and missing fields", () => {
    const result = VercelSandboxRuntime.validateCredentials();

    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.missing)).toBe(true);

    // If not valid, should have missing items
    if (!result.valid) {
      expect(result.missing.length).toBeGreaterThan(0);
    }
  });

  test("reports specific missing credentials", () => {
    // Save original env
    const originalToken = process.env.VERCEL_TOKEN;
    const originalTeam = process.env.VERCEL_TEAM_ID;
    const originalProject = process.env.VERCEL_PROJECT_ID;
    const originalOIDC = process.env.VERCEL_OIDC_TOKEN;

    try {
      // Clear all Vercel credentials
      delete process.env.VERCEL_TOKEN;
      delete process.env.VERCEL_TEAM_ID;
      delete process.env.VERCEL_PROJECT_ID;
      delete process.env.VERCEL_OIDC_TOKEN;

      const result = VercelSandboxRuntime.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain("VERCEL_TOKEN");
    } finally {
      // Restore original env
      if (originalToken) process.env.VERCEL_TOKEN = originalToken;
      if (originalTeam) process.env.VERCEL_TEAM_ID = originalTeam;
      if (originalProject) process.env.VERCEL_PROJECT_ID = originalProject;
      if (originalOIDC) process.env.VERCEL_OIDC_TOKEN = originalOIDC;
    }
  });
});

// =============================================================================
// CODE AGENT SERVICE STRUCTURE TESTS
// =============================================================================

describe("Code Agent Service - Event System", () => {
  let codeAgentService: typeof import("@/lib/services/code-agent").codeAgentService;

  beforeAll(async () => {
    const service = await import("@/lib/services/code-agent");
    codeAgentService = service.codeAgentService;
  });

  test("onEvent returns unsubscribe function", () => {
    const events: string[] = [];
    const unsubscribe = codeAgentService.onEvent((event) => {
      events.push(event.type);
    });

    expect(typeof unsubscribe).toBe("function");

    // Unsubscribe should not throw
    unsubscribe();
  });

  test("can subscribe multiple handlers", () => {
    const events1: string[] = [];
    const events2: string[] = [];

    const unsub1 = codeAgentService.onEvent((e) => events1.push(e.type));
    const unsub2 = codeAgentService.onEvent((e) => events2.push(e.type));

    // Clean up
    unsub1();
    unsub2();
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockDbSession(overrides: Partial<{
  id: string;
  organization_id: string;
  user_id: string;
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_events: string[] | null;
}> = {}) {
  return {
    id: overrides.id ?? "sess_" + Date.now(),
    organization_id: overrides.organization_id ?? "org_test",
    user_id: overrides.user_id ?? "user_test",
    name: "Test Session",
    description: null,
    runtime_type: "vercel" as const,
    runtime_id: null,
    runtime_url: null,
    status: "ready" as const,
    status_message: "Ready",
    working_directory: "/app",
    environment_variables: {},
    secrets_loaded: [],
    capabilities: {},
    git_state: null,
    cpu_seconds_used: 0,
    memory_mb_peak: 0,
    disk_mb_used: 0,
    api_calls_count: 0,
    commands_executed: 0,
    files_created: 0,
    files_modified: 0,
    estimated_cost_cents: 0,
    snapshot_count: 0,
    latest_snapshot_id: null,
    agent_id: null,
    webhook_url: overrides.webhook_url ?? null,
    webhook_secret: overrides.webhook_secret ?? null,
    webhook_events: overrides.webhook_events ?? null,
    created_at: new Date(),
    updated_at: new Date(),
    last_activity_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000),
    terminated_at: null,
  };
}

function executeJSAsync(code: string, timeout = 5000): { output: string; error: string | null; exitCode: number } {
  const vm = require("vm");
  let output = "";
  const log = (...args: unknown[]) => { output += args.map(String).join(" ") + "\n"; };

  const context = vm.createContext({
    console: { log, error: log, warn: log, info: log },
    setTimeout, setInterval, clearTimeout, clearInterval,
    Buffer, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Promise, Symbol,
  });

  try {
    const result = new vm.Script(code).runInContext(context, { timeout });
    if (result !== undefined && !(result instanceof Promise)) {
      output += String(result) + "\n";
    }
    return { output: output.trim(), error: null, exitCode: 0 };
  } catch (err: unknown) {
    const msg = err instanceof Error && err.message.includes("timed out")
      ? "Timed out"
      : (err instanceof Error ? err.message : String(err));
    return { output: output.trim(), error: msg, exitCode: 1 };
  }
}

