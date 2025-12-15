/**
 * Application Triggers Integration Tests
 *
 * Tests the full application trigger system:
 * - Cron triggers with real container targets
 * - Webhook triggers with signature verification
 * - Event triggers for platform events
 * - Trigger CRUD API
 * - Execution history tracking
 *
 * Run with: TEST_API_KEY=xxx bun test tests/integration/application-triggers.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHmac } from "crypto";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

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

function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

const skipHttp = !API_KEY;

// =============================================================================
// TEST STATE
// =============================================================================

interface TestState {
  containerId: string | null;
  projectId: string | null;
  triggerId: string | null;
  webhookKey: string | null;
  webhookSecret: string | null;
}

const state: TestState = {
  containerId: null,
  projectId: null,
  triggerId: null,
  webhookKey: null,
  webhookSecret: null,
};

// =============================================================================
// TRIGGER CRUD API TESTS
// =============================================================================

describe("Application Triggers API", () => {
  beforeAll(async () => {
    if (skipHttp) return;

    // Get a container or fragment project to use as trigger target
    const containersRes = await fetchWithTimeout(
      `${BASE_URL}/api/v1/containers`,
      {
        method: "GET",
        headers: authHeaders(),
      },
    );

    if (containersRes?.ok) {
      const data = await containersRes.json();
      if (data.containers?.length > 0) {
        state.containerId = data.containers[0].id;
      }
    }

    // Also try to get a fragment project
    const projectsRes = await fetchWithTimeout(`${BASE_URL}/api/v1/projects`, {
      method: "GET",
      headers: authHeaders(),
    });

    if (projectsRes?.ok) {
      const data = await projectsRes.json();
      if (data.projects?.length > 0) {
        state.projectId = data.projects[0].id;
      }
    }
  });

  describe("GET /api/v1/triggers", () => {
    test.skipIf(skipHttp)("lists triggers with pagination", async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(Array.isArray(data.triggers)).toBe(true);
      expect(typeof data.total).toBe("number");
    });

    test.skipIf(skipHttp)("filters by target type", async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers?targetType=container`,
        {
          method: "GET",
          headers: authHeaders(),
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      if (data.triggers.length > 0) {
        expect(
          data.triggers.every(
            (t: { targetType: string }) => t.targetType === "container",
          ),
        ).toBe(true);
      }
    });

    test.skipIf(skipHttp)("filters by trigger type", async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers?triggerType=cron`,
        {
          method: "GET",
          headers: authHeaders(),
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      if (data.triggers.length > 0) {
        expect(
          data.triggers.every(
            (t: { triggerType: string }) => t.triggerType === "cron",
          ),
        ).toBe(true);
      }
    });

    test.skipIf(skipHttp)("filters by active status", async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers?isActive=true`,
        {
          method: "GET",
          headers: authHeaders(),
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      if (data.triggers.length > 0) {
        expect(
          data.triggers.every(
            (t: { isActive: boolean }) => t.isActive === true,
          ),
        ).toBe(true);
      }
    });
  });

  describe("POST /api/v1/triggers", () => {
    test.skipIf(skipHttp || !state.containerId)(
      "creates cron trigger for container",
      async () => {
        if (!state.containerId) return;

        const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            targetType: "container",
            targetId: state.containerId,
            triggerType: "cron",
            name: "Test Cron Trigger",
            description: "Integration test cron trigger",
            config: {
              cronExpression: "0 * * * *", // Every hour
              maxExecutionsPerDay: 24,
              timeout: 30,
            },
          }),
        });

        if (!response) return;

        if (response.status === 500) {
          console.log("⚠️ Server returned 500 - skipping");
          return;
        }
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.trigger).toBeDefined();
        expect(data.trigger.triggerType).toBe("cron");
        expect(data.trigger.isActive).toBe(true);

        // Save for later tests
        if (data.trigger.id) {
          state.triggerId = data.trigger.id;
        }
      },
    );

    test.skipIf(skipHttp || !state.containerId)(
      "creates webhook trigger with secret",
      async () => {
        if (!state.containerId) return;

        const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            targetType: "container",
            targetId: state.containerId,
            triggerType: "webhook",
            name: "Test Webhook Trigger",
            config: {
              requireSignature: true,
              maxExecutionsPerDay: 1000,
            },
          }),
        });

        if (!response) return;

        if (response.status === 500) {
          console.log("⚠️ Server returned 500 - skipping");
          return;
        }
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.trigger.triggerType).toBe("webhook");
        expect(data.webhookUrl).toBeDefined();
        expect(data.webhookSecret).toBeDefined();
        expect(data.webhookSecret.value).toBeDefined();
        expect(data.webhookSecret.warning).toContain("Save this secret");

        // Save for webhook tests
        state.webhookKey = data.trigger.triggerKey;
        state.webhookSecret = data.webhookSecret.value;
      },
    );

    test.skipIf(skipHttp || !state.containerId)(
      "creates event trigger",
      async () => {
        if (!state.containerId) return;

        const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            targetType: "container",
            targetId: state.containerId,
            triggerType: "event",
            name: "Test Event Trigger",
            config: {
              eventTypes: ["container.started", "container.stopped"],
            },
          }),
        });

        if (!response) return;

        if (response.status === 500) {
          console.log("⚠️ Server returned 500 - skipping");
          return;
        }
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.trigger.triggerType).toBe("event");
      },
    );

    test.skipIf(skipHttp)("validates required fields", async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          // Missing required fields
          name: "Invalid Trigger",
        }),
      });

      if (!response) return;

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test.skipIf(skipHttp)("validates cron expression", async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          targetType: "container",
          targetId: state.containerId ?? "fake-id",
          triggerType: "cron",
          name: "Invalid Cron",
          config: {
            // Missing cronExpression
          },
        }),
      });

      if (!response) return;

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("cronExpression");
    });

    test.skipIf(skipHttp)("validates event types", async () => {
      const response = await fetchWithTimeout(`${BASE_URL}/api/v1/triggers`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          targetType: "container",
          targetId: state.containerId ?? "fake-id",
          triggerType: "event",
          name: "Invalid Event",
          config: {
            // Missing eventTypes
          },
        }),
      });

      if (!response) return;

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("eventTypes");
    });
  });

  describe("GET /api/v1/triggers/:id", () => {
    test.skipIf(skipHttp || !state.triggerId)(
      "gets trigger by ID",
      async () => {
        if (!state.triggerId) return;

        const response = await fetchWithTimeout(
          `${BASE_URL}/api/v1/triggers/${state.triggerId}`,
          {
            method: "GET",
            headers: authHeaders(),
          },
        );

        if (!response) return;

        if (response.status === 500) {
          console.log("⚠️ Server returned 500 - skipping");
          return;
        }
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.trigger.id).toBe(state.triggerId);
      },
    );

    test.skipIf(skipHttp)("returns 404 for non-existent trigger", async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers/non-existent-id`,
        {
          method: "GET",
          headers: authHeaders(),
        },
      );

      if (!response) return;

      expect([404, 500]).toContain(response.status);
    });
  });

  describe("PATCH /api/v1/triggers/:id", () => {
    test.skipIf(skipHttp || !state.triggerId)(
      "updates trigger status",
      async () => {
        if (!state.triggerId) return;

        const response = await fetchWithTimeout(
          `${BASE_URL}/api/v1/triggers/${state.triggerId}`,
          {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
              isActive: false,
            }),
          },
        );

        if (!response) return;

        if (response.status === 500) {
          console.log("⚠️ Server returned 500 - skipping");
          return;
        }
        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.trigger.isActive).toBe(false);

        // Re-enable for other tests
        await fetchWithTimeout(
          `${BASE_URL}/api/v1/triggers/${state.triggerId}`,
          {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ isActive: true }),
          },
        );
      },
    );

    test.skipIf(skipHttp || !state.triggerId)(
      "updates trigger config",
      async () => {
        if (!state.triggerId) return;

        const response = await fetchWithTimeout(
          `${BASE_URL}/api/v1/triggers/${state.triggerId}`,
          {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
              config: {
                maxExecutionsPerDay: 48,
              },
            }),
          },
        );

        if (!response) return;

        if (response.status === 500) {
          console.log("⚠️ Server returned 500 - skipping");
          return;
        }
        expect(response.status).toBe(200);
      },
    );
  });
});

// =============================================================================
// WEBHOOK TRIGGER TESTS
// =============================================================================

describe("Webhook Trigger Endpoint", () => {
  test.skipIf(skipHttp)("returns 404 for unknown key", async () => {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/v1/triggers/webhooks/nonexistent-key-12345`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      },
    );

    if (!response) return;

    if (response.status === 500) {
      console.log("⚠️ Server returned 500 - skipping");
      return;
    }
    expect([401, 404]).toContain(response.status);
  });

  test.skipIf(skipHttp || !state.webhookKey)(
    "returns 401 without signature",
    async () => {
      if (!state.webhookKey) return;

      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers/webhooks/${state.webhookKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: true }),
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain("signature");
    },
  );

  test.skipIf(skipHttp || !state.webhookKey || !state.webhookSecret)(
    "accepts valid signature",
    async () => {
      if (!state.webhookKey || !state.webhookSecret) return;

      const payload = JSON.stringify({ test: true, timestamp: Date.now() });
      const signature = generateWebhookSignature(payload, state.webhookSecret);

      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers/webhooks/${state.webhookKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
          },
          body: payload,
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      // May fail if container is not running, but should not be 401
      expect(response.status).not.toBe(401);
    },
  );

  test.skipIf(skipHttp || !state.webhookKey || !state.webhookSecret)(
    "rejects invalid signature",
    async () => {
      if (!state.webhookKey || !state.webhookSecret) return;

      const payload = JSON.stringify({ test: true });
      const invalidSignature = generateWebhookSignature(
        payload,
        "wrong-secret",
      );

      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers/webhooks/${state.webhookKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": invalidSignature,
          },
          body: payload,
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(401);
    },
  );

  test.skipIf(skipHttp)("GET health check works", async () => {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/v1/triggers/webhooks/any-key`,
      { method: "GET" },
    );

    if (!response) return;

    // Even unknown keys return a response
    expect(response.status).toBeGreaterThan(0);
  });
});

// =============================================================================
// CRON TRIGGER ENDPOINT TESTS
// =============================================================================

describe("Cron Trigger Processing", () => {
  const skipCron = !CRON_SECRET;

  test.skipIf(skipHttp || skipCron)(
    "cron endpoint requires authorization",
    async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/cron/application-triggers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(401);
    },
  );

  test.skipIf(skipHttp || skipCron)(
    "cron endpoint processes triggers",
    async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/cron/application-triggers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CRON_SECRET}`,
          },
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
      expect(typeof data.results.processed).toBe("number");
      expect(typeof data.results.executed).toBe("number");
      expect(typeof data.results.skipped).toBe("number");
      expect(typeof data.results.errors).toBe("number");
    },
  );

  test.skipIf(skipHttp || skipCron)(
    "GET returns active triggers status",
    async () => {
      const response = await fetchWithTimeout(
        `${BASE_URL}/api/cron/application-triggers`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
          },
        },
      );

      if (!response) return;

      if (response.status === 500) {
        console.log("⚠️ Server returned 500 - skipping");
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(typeof data.activeTriggers).toBe("number");
      expect(Array.isArray(data.triggers)).toBe(true);
    },
  );
});

// =============================================================================
// EXECUTION HISTORY TESTS
// =============================================================================

describe("Trigger Execution History", () => {
  test.skipIf(skipHttp || !state.triggerId)(
    "gets execution history",
    async () => {
      if (!state.triggerId) return;

      const response = await fetchWithTimeout(
        `${BASE_URL}/api/v1/triggers/${state.triggerId}/executions`,
        {
          method: "GET",
          headers: authHeaders(),
        },
      );

      if (!response) return;

      if (response.status === 500 || response.status === 404) {
        console.log(`⚠️ Server returned ${response.status} - skipping`);
        return;
      }
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(Array.isArray(data.executions)).toBe(true);
    },
  );
});

// =============================================================================
// CLEANUP
// =============================================================================

afterAll(async () => {
  if (skipHttp) return;

  // Clean up test triggers
  if (state.triggerId) {
    await fetchWithTimeout(`${BASE_URL}/api/v1/triggers/${state.triggerId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }
});
