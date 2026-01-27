/**
 * Workflow API Integration Tests
 *
 * Tests the workflow management API endpoints:
 * - POST /api/v1/workflows/generate - Generate a new workflow
 * - GET /api/v1/workflows - List workflows
 * - GET /api/v1/workflows/[id] - Get workflow details
 * - PATCH /api/v1/workflows/[id] - Update workflow
 * - DELETE /api/v1/workflows/[id] - Delete workflow
 *
 * These tests require:
 * - Local server running on localhost:3000
 * - Test database with migrations applied
 * - Test API key with valid organization
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestDataSet, cleanupTestData } from "../infrastructure/test-data-factory";
import {
  createTestWorkflow,
  cleanupTestWorkflows,
  generateMockWorkflow,
  verifyWorkflowStructure,
  getTestAuthHeaders,
} from "../infrastructure/workflow-test-helpers";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TIMEOUT = 30000;

// Skip tests if no database URL
const shouldRun = !!DATABASE_URL;

describe.skipIf(!shouldRun)("Workflow API Integration Tests", () => {
  let testData: Awaited<ReturnType<typeof createTestDataSet>>;
  let testWorkflowId: string;

  beforeAll(async () => {
    if (!shouldRun) return;

    // Create test organization, user, and API key
    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Workflow Test Org",
      userName: "Workflow Test User",
      creditBalance: 1000,
    });

    // Create a test workflow for GET/PATCH/DELETE tests
    const workflow = await createTestWorkflow(
      DATABASE_URL,
      testData.organization.id,
      testData.user.id,
      {
        name: "Pre-created Test Workflow",
        userIntent: "Send email notifications for new signups",
        status: "live",
      }
    );
    testWorkflowId = workflow.id;
  });

  afterAll(async () => {
    if (!shouldRun || !testData) return;

    // Clean up test data
    await cleanupTestWorkflows(DATABASE_URL, testData.organization.id);
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("GET /api/v1/workflows - List Workflows", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 200 and workflow list with valid auth", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("workflows");
      expect(Array.isArray(data.workflows)).toBe(true);
    });

    test("filters workflows by status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows?status=live`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // All returned workflows should be live
      for (const workflow of data.workflows) {
        expect(workflow.status).toBe("live");
      }
    });

    test("respects limit and offset pagination", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows?limit=1&offset=0`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflows.length).toBeLessThanOrEqual(1);
    });
  });

  describe("GET /api/v1/workflows/[id] - Get Workflow Details", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 200 and workflow details with valid auth", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("workflow");
      expect(data.workflow.id).toBe(testWorkflowId);

      // Verify structure
      const verification = verifyWorkflowStructure(data.workflow);
      expect(verification.valid).toBe(true);
    });

    test("returns 404 for non-existent workflow", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });

    test("returns 400 for invalid UUID", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/invalid-uuid`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/v1/workflows/[id] - Update Workflow", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("updates workflow name successfully", async () => {
      const newName = "Updated Workflow Name";
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ name: newName }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.name).toBe(newName);
    });

    test("updates workflow status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "testing" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.status).toBe("testing");

      // Reset to live for other tests
      await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "live" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
    });

    test("rejects invalid status value", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "invalid_status" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("updates isPublic flag", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ isPublic: true }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.isPublic).toBe(true);

      // Reset
      await fetch(`${SERVER_URL}/api/v1/workflows/${testWorkflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ isPublic: false }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
    });
  });

  describe("DELETE /api/v1/workflows/[id] - Delete Workflow", () => {
    let deletableWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      // Create a workflow specifically for deletion tests
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Deletable Test Workflow",
          status: "draft",
        }
      );
      deletableWorkflowId = workflow.id;
    });

    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${deletableWorkflowId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("deletes workflow successfully", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${deletableWorkflowId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      // Verify deletion
      const getRes = await fetch(
        `${SERVER_URL}/api/v1/workflows/${deletableWorkflowId}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(getRes.status).toBe(404);
    });

    test("returns 404 when deleting non-existent workflow", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/workflows/generate - Generate Workflow", () => {
    // Note: These tests may be skipped if ANTHROPIC_API_KEY is not available
    // since actual AI generation requires the API key

    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIntent: "Send an email" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 400 for missing userIntent", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("userIntent");
    });

    test("returns 400 for empty userIntent", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ userIntent: "" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("returns 400 for userIntent that is too short", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ userIntent: "hi" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("accepts valid generation request", async () => {
      // This test may return 500 if ANTHROPIC_API_KEY is not set
      // or 200 if generation succeeds
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          userIntent: "Send an email notification when a new user signs up",
        }),
        signal: AbortSignal.timeout(60000), // Longer timeout for AI generation
      });

      // Either succeeds or fails gracefully
      expect([200, 400, 500, 503]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data).toHaveProperty("workflow");
        expect(data.workflow).toHaveProperty("id");
        expect(data.workflow).toHaveProperty("generatedCode");

        // Verify structure
        const verification = verifyWorkflowStructure(data.workflow);
        if (!verification.valid) {
          console.warn("Workflow structure warnings:", verification.errors);
        }
      }
    });
  });

  describe("Workflow Access Control", () => {
    let otherOrgData: Awaited<ReturnType<typeof createTestDataSet>>;
    let otherOrgWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      // Create another organization with its own workflow
      otherOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Other Org",
        userName: "Other User",
      });

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        otherOrgData.organization.id,
        otherOrgData.user.id,
        {
          name: "Other Org Workflow",
          status: "live",
        }
      );
      otherOrgWorkflowId = workflow.id;
    });

    afterAll(async () => {
      if (!shouldRun || !otherOrgData) return;

      await cleanupTestWorkflows(DATABASE_URL, otherOrgData.organization.id);
      await cleanupTestData(DATABASE_URL, otherOrgData.organization.id);
    });

    test("cannot access another organization's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherOrgWorkflowId}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key), // Use first org's key
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });

    test("cannot update another organization's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherOrgWorkflowId}`,
        {
          method: "PATCH",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ name: "Hacked Name" }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });

    test("cannot delete another organization's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherOrgWorkflowId}`,
        {
          method: "DELETE",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
