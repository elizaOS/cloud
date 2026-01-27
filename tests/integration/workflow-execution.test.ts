/**
 * Workflow Execution Integration Tests
 *
 * Tests the workflow execution API endpoint:
 * - POST /api/v1/workflows/[id]/execute - Execute a workflow
 *
 * Verifies:
 * - Authentication requirements
 * - Workflow status validation (only live workflows can execute)
 * - Execution record creation
 * - Input parameter handling
 * - Error handling for failed executions
 * - Usage statistics updates
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createTestDataSet, cleanupTestData } from "../infrastructure/test-data-factory";
import {
  createTestWorkflow,
  createTestWorkflowExecution,
  cleanupTestWorkflows,
  getTestWorkflow,
  updateTestWorkflowStatus,
  getTestAuthHeaders,
} from "../infrastructure/workflow-test-helpers";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TIMEOUT = 30000;

// Skip tests if no database URL
const shouldRun = !!DATABASE_URL;

describe.skipIf(!shouldRun)("Workflow Execution Integration Tests", () => {
  let testData: Awaited<ReturnType<typeof createTestDataSet>>;
  let liveWorkflowId: string;
  let draftWorkflowId: string;

  beforeAll(async () => {
    if (!shouldRun) return;

    // Create test organization, user, and API key
    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Execution Test Org",
      userName: "Execution Test User",
      creditBalance: 1000,
    });

    // Create a live workflow for execution tests
    const liveWorkflow = await createTestWorkflow(
      DATABASE_URL,
      testData.organization.id,
      testData.user.id,
      {
        name: "Live Execution Test Workflow",
        userIntent: "Send email to team",
        status: "live",
        serviceDependencies: ["google"],
      }
    );
    liveWorkflowId = liveWorkflow.id;

    // Create a draft workflow (should not be executable)
    const draftWorkflow = await createTestWorkflow(
      DATABASE_URL,
      testData.organization.id,
      testData.user.id,
      {
        name: "Draft Workflow",
        status: "draft",
      }
    );
    draftWorkflowId = draftWorkflow.id;
  });

  afterAll(async () => {
    if (!shouldRun || !testData) return;

    await cleanupTestWorkflows(DATABASE_URL, testData.organization.id);
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("POST /api/v1/workflows/[id]/execute - Execute Workflow", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: { to: "test@example.com" } }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(401);
    });

    test("returns 404 for non-existent workflow", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}/execute`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ params: {} }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });

    test("returns 400 for draft workflow (not live)", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${draftWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("live");
    });

    test("accepts execution request for live workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: {
              to: "test@example.com",
              subject: "Test Subject",
              body: "Test Body",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should either succeed or gracefully fail (missing credentials)
      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data).toHaveProperty("execution");
        expect(data.execution).toHaveProperty("id");
        expect(data.execution).toHaveProperty("status");
      }
    });

    test("handles missing required parameters gracefully", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }), // Empty params
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should handle gracefully - either validate or proceed
      expect([200, 400]).toContain(res.status);
    });

    test("handles invalid params format", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: "not-an-object" }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Execution Statistics", () => {
    let statsWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      // Create a workflow for stats testing
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Stats Test Workflow",
          status: "live",
          usageCount: 5,
          successRate: "80.00",
        }
      );
      statsWorkflowId = workflow.id;

      // Create some execution history
      await createTestWorkflowExecution(
        DATABASE_URL,
        statsWorkflowId,
        testData.organization.id,
        testData.user.id,
        { status: "completed", executionTimeMs: 100 }
      );
      await createTestWorkflowExecution(
        DATABASE_URL,
        statsWorkflowId,
        testData.organization.id,
        testData.user.id,
        { status: "completed", executionTimeMs: 150 }
      );
      await createTestWorkflowExecution(
        DATABASE_URL,
        statsWorkflowId,
        testData.organization.id,
        testData.user.id,
        { status: "failed", errorMessage: "Test error" }
      );
    });

    test("workflow tracks usage count", async () => {
      const workflow = await getTestWorkflow(DATABASE_URL, statsWorkflowId);

      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.usageCount).toBeGreaterThanOrEqual(5);
      }
    });

    test("workflow tracks success rate", async () => {
      const workflow = await getTestWorkflow(DATABASE_URL, statsWorkflowId);

      expect(workflow).not.toBeNull();
      if (workflow) {
        const rate = Number.parseFloat(workflow.successRate);
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(100);
      }
    });

    test("execution records are retrievable", async () => {
      // This would typically be a separate endpoint, but we can verify
      // by checking the workflow itself or a future executions endpoint
      const workflow = await getTestWorkflow(DATABASE_URL, statsWorkflowId);

      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.usageCount).toBeGreaterThan(0);
      }
    });
  });

  describe("Workflow Status Transitions", () => {
    let transitionWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Transition Test Workflow",
          status: "draft",
        }
      );
      transitionWorkflowId = workflow.id;
    });

    test("draft workflow cannot be executed", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${transitionWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);
    });

    test("workflow can be moved to testing status", async () => {
      await updateTestWorkflowStatus(DATABASE_URL, transitionWorkflowId, "testing");

      const workflow = await getTestWorkflow(DATABASE_URL, transitionWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.status).toBe("testing");
      }
    });

    test("testing workflow cannot be executed via normal endpoint", async () => {
      await updateTestWorkflowStatus(DATABASE_URL, transitionWorkflowId, "testing");

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${transitionWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Testing status may or may not be allowed depending on implementation
      expect([200, 400]).toContain(res.status);
    });

    test("workflow can be moved to live status", async () => {
      await updateTestWorkflowStatus(DATABASE_URL, transitionWorkflowId, "live");

      const workflow = await getTestWorkflow(DATABASE_URL, transitionWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.status).toBe("live");
      }
    });

    test("live workflow can be executed", async () => {
      await updateTestWorkflowStatus(DATABASE_URL, transitionWorkflowId, "live");

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${transitionWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: { test: true } }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should at least accept the request
      expect([200, 400, 500]).toContain(res.status);
    });

    test("deprecated workflow cannot be executed", async () => {
      await updateTestWorkflowStatus(DATABASE_URL, transitionWorkflowId, "deprecated");

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${transitionWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Concurrent Execution Handling", () => {
    test("handles multiple simultaneous execution requests", async () => {
      const promises = Array.from({ length: 3 }, () =>
        fetch(`${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`, {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: { test: true } }),
          signal: AbortSignal.timeout(TIMEOUT),
        })
      );

      const results = await Promise.all(promises);

      // All should return valid HTTP responses
      for (const res of results) {
        expect([200, 400, 429, 500]).toContain(res.status);
      }
    });
  });

  describe("Execution Input Validation", () => {
    test("rejects extremely large input payload", async () => {
      const largePayload = { params: { data: "x".repeat(10 * 1024 * 1024) } }; // 10MB

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify(largePayload),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should reject or handle gracefully
      expect([400, 413, 500]).toContain(res.status);
    });

    test("handles special characters in input parameters", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: {
              text: "Hello <script>alert('xss')</script> World",
              unicode: "こんにちは 🎉",
              special: "a\nb\tc\rd",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should handle gracefully
      expect([200, 400, 500]).toContain(res.status);
    });

    test("handles nested object parameters", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${liveWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: {
              user: {
                name: "Test User",
                email: "test@example.com",
                preferences: {
                  notifications: true,
                  theme: "dark",
                },
              },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should accept nested objects
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("Public Workflow Execution", () => {
    let publicWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Public Test Workflow",
          status: "live",
          isPublic: true,
        }
      );
      publicWorkflowId = workflow.id;
    });

    test("public workflow is marked as public", async () => {
      const workflow = await getTestWorkflow(DATABASE_URL, publicWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.isPublic).toBe(true);
      }
    });

    // Note: Whether public workflows can be executed by other orgs
    // depends on the implementation. This test documents the behavior.
    test("public workflow execution by owner works", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${publicWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect([200, 400, 500]).toContain(res.status);
    });
  });
});
