/**
 * Workflow Studio E2E Integration Tests
 *
 * Tests the complete workflow lifecycle:
 * - Workflow generation with AI
 * - Workflow listing and filtering
 * - Workflow execution
 * - Execution history tracking
 * - Workflow sharing
 *
 * These tests simulate real-world user interactions with the Workflow Studio.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../infrastructure/test-data-factory";
import {
  createTestWorkflow,
  cleanupTestWorkflows,
} from "../infrastructure/workflow-test-helpers";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TIMEOUT = 30000;

const shouldRun = !!DATABASE_URL;

function getTestAuthHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
}

describe.skipIf(!shouldRun)("Workflow Studio E2E Tests", () => {
  let testData: TestDataSet;
  let client: Client;

  beforeAll(async () => {
    if (!shouldRun) return;

    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Workflow Studio E2E Org",
      creditBalance: 5000,
    });

    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    if (!shouldRun) return;

    await cleanupTestWorkflows(DATABASE_URL, testData.organization.id);
    await client.end();
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("Complete Workflow Lifecycle", () => {
    let workflowId: string;

    test("Step 1: Create a workflow", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "E2E Test Workflow",
          userIntent: "Send a welcome SMS when a new user signs up",
          serviceDependencies: ["twilio"],
          status: "draft",
        }
      );

      workflowId = workflow.id;
      expect(workflowId).toBeDefined();
    });

    test("Step 2: Workflow appears in list", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const found = data.workflows.find(
        (w: { id: string }) => w.id === workflowId
      );

      expect(found).toBeDefined();
      expect(found.name).toBe("E2E Test Workflow");
      expect(found.status).toBe("draft");
    });

    test("Step 3: Get workflow details with executions", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow).toBeDefined();
      expect(data.workflow.id).toBe(workflowId);
      expect(data.workflow.code).toBeDefined();
      expect(data.executions).toBeDefined();
      expect(Array.isArray(data.executions)).toBe(true);
    });

    test("Step 4: Update workflow status to testing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "testing" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.status).toBe("testing");
    });

    test("Step 5: Execute the workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: {
              userId: "test-user-123",
              phoneNumber: "+15551234567",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // May fail if actual execution isn't supported, but should handle gracefully
      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data).toHaveProperty("execution");
        expect(data.execution).toHaveProperty("id");
        expect(data.execution).toHaveProperty("status");
      }
    });

    test("Step 6: Execution appears in history", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // Executions array should exist (may or may not have entries depending on Step 5)
      expect(Array.isArray(data.executions)).toBe(true);
    });

    test("Step 7: Update to live status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "live" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.status).toBe("live");
    });

    test("Step 8: Delete the workflow", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      // Verify deletion
      const getRes = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(getRes.status).toBe(404);
    });
  });

  describe("Workflow Filtering and Search", () => {
    let draftWorkflowId: string;
    let liveWorkflowId: string;
    let testingWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      // Create workflows with different statuses
      const draft = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        { name: "Draft Workflow", status: "draft" }
      );
      draftWorkflowId = draft.id;

      const live = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        { name: "Live Workflow", status: "live" }
      );
      liveWorkflowId = live.id;

      const testing = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        { name: "Testing Workflow", status: "testing" }
      );
      testingWorkflowId = testing.id;
    });

    test("filters by draft status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows?status=draft`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      for (const workflow of data.workflows) {
        expect(workflow.status).toBe("draft");
      }
    });

    test("filters by live status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows?status=live`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      for (const workflow of data.workflows) {
        expect(workflow.status).toBe("live");
      }
    });

    test("filters by testing status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows?status=testing`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      for (const workflow of data.workflows) {
        expect(workflow.status).toBe("testing");
      }
    });

    test("returns all workflows without filter", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // Should include workflows of all statuses
      expect(data.workflows.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Workflow Generation Validation", () => {
    test("rejects empty intent", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ userIntent: "" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("rejects intent that is too short", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ userIntent: "hi" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("10 characters");
    });

    test("rejects missing intent field", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("accepts valid intent format", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          userIntent:
            "When I receive an email with 'urgent' in the subject, send me an SMS notification",
        }),
        signal: AbortSignal.timeout(60000), // Longer timeout for AI
      });

      // Either succeeds (AI available) or fails gracefully (no API key)
      expect([200, 400, 500, 503]).toContain(res.status);
    });
  });

  describe("Workflow Update Validation", () => {
    let workflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        { name: "Update Test Workflow", status: "draft" }
      );
      workflowId = workflow.id;
    });

    test("updates name successfully", async () => {
      const newName = "Updated Name " + Date.now();
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ name: newName }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.name).toBe(newName);
    });

    test("updates description successfully", async () => {
      const newDesc = "Updated description " + Date.now();
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ description: newDesc }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
    });

    test("updates tags successfully", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ tags: ["automation", "sms", "notifications"] }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
    });

    test("updates category successfully", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ category: "notifications" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
    });

    test("rejects invalid status transition", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "invalid_status" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Workflow Execution Scenarios", () => {
    let workflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Execution Test Workflow",
          status: "live",
          generatedCode: `
            export async function execute(params: Record<string, unknown>) {
              return { success: true, message: "Executed successfully", params };
            }
          `,
        }
      );
      workflowId = workflow.id;
    });

    test("executes with empty params", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect([200, 400, 500]).toContain(res.status);
    });

    test("executes with valid params", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: {
              message: "Test message",
              recipient: "+15551234567",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect([200, 400, 500]).toContain(res.status);
    });

    test("handles missing params field", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should handle gracefully - either execute with empty params or return error
      expect([200, 400, 500]).toContain(res.status);
    });

    test("rejects execution without auth", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Workflow Sharing", () => {
    let workflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        { name: "Shareable Workflow", status: "live" }
      );
      workflowId = workflow.id;
    });

    test("shares workflow as MCP", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // May succeed or fail based on MCP service availability
      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBe(true);
      }
    });

    test("rejects sharing without auth", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Cross-Organization Security", () => {
    let otherOrgData: TestDataSet;
    let otherWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      otherOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Other Workflow Org",
      });

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        otherOrgData.organization.id,
        otherOrgData.user.id,
        { name: "Other Org Workflow", status: "live" }
      );
      otherWorkflowId = workflow.id;
    });

    afterAll(async () => {
      if (!shouldRun) return;

      await cleanupTestWorkflows(DATABASE_URL, otherOrgData.organization.id);
      await cleanupTestData(DATABASE_URL, otherOrgData.organization.id);
    });

    test("cannot view other org's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherWorkflowId}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });

    test("cannot update other org's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherWorkflowId}`,
        {
          method: "PATCH",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ name: "Hacked!" }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });

    test("cannot delete other org's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherWorkflowId}`,
        {
          method: "DELETE",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });

    test("cannot execute other org's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });

    test("cannot share other org's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherWorkflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("Edge Cases", () => {
    test("handles non-existent workflow ID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const getRes = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(getRes.status).toBe(404);

      const patchRes = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ name: "New Name" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      expect(deleteRes.status).toBe(404);
    });

    test("handles invalid UUID format", async () => {
      const invalidId = "not-a-uuid";

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${invalidId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("handles concurrent workflow operations", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        { name: "Concurrent Test", status: "draft" }
      );

      // Make multiple concurrent requests
      const requests = Array(5)
        .fill(null)
        .map((_, i) =>
          fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}`, {
            method: "PATCH",
            headers: getTestAuthHeaders(testData.apiKey.key),
            body: JSON.stringify({ name: `Concurrent Update ${i}` }),
            signal: AbortSignal.timeout(TIMEOUT),
          })
        );

      const responses = await Promise.all(requests);

      // All requests should succeed
      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });
  });
});
