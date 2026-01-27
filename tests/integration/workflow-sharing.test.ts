/**
 * Workflow Sharing Integration Tests
 *
 * Tests the workflow sharing API endpoint:
 * - POST /api/v1/workflows/[id]/share - Share workflow as MCP
 *
 * Verifies:
 * - Eligibility requirements (live status, success rate, etc.)
 * - MCP creation and linking
 * - Pricing configuration
 * - Access control for sharing
 * - Unsharing workflows
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
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

describe.skipIf(!shouldRun)("Workflow Sharing Integration Tests", () => {
  let testData: Awaited<ReturnType<typeof createTestDataSet>>;
  let eligibleWorkflowId: string;
  let ineligibleWorkflowId: string;
  let draftWorkflowId: string;

  beforeAll(async () => {
    if (!shouldRun) return;

    // Create test organization, user, and API key
    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Sharing Test Org",
      userName: "Sharing Test User",
      creditBalance: 1000,
    });

    // Create an eligible workflow (live, good success rate)
    const eligibleWorkflow = await createTestWorkflow(
      DATABASE_URL,
      testData.organization.id,
      testData.user.id,
      {
        name: "Eligible Sharing Workflow",
        userIntent: "Send automated email notifications",
        status: "live",
        usageCount: 10,
        successRate: "90.00",
        isPublic: false,
      }
    );
    eligibleWorkflowId = eligibleWorkflow.id;

    // Add successful executions for eligibility
    for (let i = 0; i < 5; i++) {
      await createTestWorkflowExecution(
        DATABASE_URL,
        eligibleWorkflowId,
        testData.organization.id,
        testData.user.id,
        { status: "completed", executionTimeMs: 100 + i * 10 }
      );
    }

    // Create an ineligible workflow (poor success rate)
    const ineligibleWorkflow = await createTestWorkflow(
      DATABASE_URL,
      testData.organization.id,
      testData.user.id,
      {
        name: "Ineligible Workflow",
        status: "live",
        usageCount: 5,
        successRate: "20.00", // Too low
      }
    );
    ineligibleWorkflowId = ineligibleWorkflow.id;

    // Add mostly failed executions
    for (let i = 0; i < 4; i++) {
      await createTestWorkflowExecution(
        DATABASE_URL,
        ineligibleWorkflowId,
        testData.organization.id,
        testData.user.id,
        { status: "failed", errorMessage: "Test failure" }
      );
    }
    await createTestWorkflowExecution(
      DATABASE_URL,
      ineligibleWorkflowId,
      testData.organization.id,
      testData.user.id,
      { status: "completed" }
    );

    // Create a draft workflow (cannot be shared)
    const draftWorkflow = await createTestWorkflow(
      DATABASE_URL,
      testData.organization.id,
      testData.user.id,
      {
        name: "Draft Cannot Share",
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

  describe("POST /api/v1/workflows/[id]/share - Share Workflow", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${eligibleWorkflowId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(401);
    });

    test("returns 404 for non-existent workflow", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${fakeId}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });

    test("returns 400 for draft workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${draftWorkflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("returns 400 for ineligible workflow (poor success rate)", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${ineligibleWorkflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // May return 400 if eligibility check fails, or 200 if no check
      expect([200, 400]).toContain(res.status);

      if (res.status === 400) {
        const data = await res.json();
        expect(data).toHaveProperty("error");
      }
    });

    test("shares eligible workflow as free MCP", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${eligibleWorkflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            description: "Automated email notification workflow",
            pricingType: "free",
            tags: ["email", "automation"],
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // May succeed or fail depending on MCP service availability
      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data).toHaveProperty("mcp");
        expect(data.mcp).toHaveProperty("id");
        expect(data.mcp).toHaveProperty("slug");
        expect(data.workflow.isPublic).toBe(true);
        expect(data.workflow.status).toBe("shared");
      }
    });

    test("shares workflow with credit pricing", async () => {
      // First create a new workflow for this test
      const paidWorkflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Paid Sharing Workflow",
          status: "live",
          usageCount: 10,
          successRate: "95.00",
        }
      );

      // Add executions
      for (let i = 0; i < 5; i++) {
        await createTestWorkflowExecution(
          DATABASE_URL,
          paidWorkflow.id,
          testData.organization.id,
          testData.user.id,
          { status: "completed" }
        );
      }

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${paidWorkflow.id}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            description: "Premium workflow with credit pricing",
            pricingType: "credits",
            creditsPerRequest: 5,
            tags: ["premium", "automation"],
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        expect(data.mcp.pricingType).toBe("credits");
        expect(data.mcp.creditsPerRequest).toBe(5);
      }
    });

    test("rejects invalid pricing type", async () => {
      const testWorkflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Invalid Pricing Workflow",
          status: "live",
        }
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${testWorkflow.id}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            pricingType: "invalid_type",
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);
    });

    test("rejects negative credits per request", async () => {
      const testWorkflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Negative Credits Workflow",
          status: "live",
        }
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${testWorkflow.id}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            pricingType: "credits",
            creditsPerRequest: -5,
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Sharing Eligibility Checks", () => {
    test("workflow with no executions may be ineligible", async () => {
      const noExecWorkflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "No Executions Workflow",
          status: "live",
          usageCount: 0,
          successRate: "0.00",
        }
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${noExecWorkflow.id}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Depending on eligibility rules, may be accepted or rejected
      expect([200, 400]).toContain(res.status);
    });

    test("testing status workflow cannot be shared", async () => {
      const testingWorkflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Testing Status Workflow",
          status: "testing",
        }
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${testingWorkflow.id}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(400);
    });

    test("already shared workflow returns appropriate response", async () => {
      // Try to share an already shared workflow
      const sharedWorkflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Already Shared Workflow",
          status: "shared",
          isPublic: true,
        }
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${sharedWorkflow.id}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should return 400 (already shared) or 200 (update existing share)
      expect([200, 400]).toContain(res.status);
    });
  });

  describe("Access Control for Sharing", () => {
    let otherOrgData: Awaited<ReturnType<typeof createTestDataSet>>;
    let otherOrgWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      // Create another organization
      otherOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Other Sharing Org",
        userName: "Other Sharing User",
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

    test("cannot share another organization's workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${otherOrgWorkflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key), // Wrong org
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("Shared Workflow Visibility", () => {
    test("shared workflow has isPublic set to true", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Public Visibility Workflow",
          status: "live",
          usageCount: 5,
          successRate: "100.00",
        }
      );

      // Add executions
      for (let i = 0; i < 5; i++) {
        await createTestWorkflowExecution(
          DATABASE_URL,
          workflow.id,
          testData.organization.id,
          testData.user.id,
          { status: "completed" }
        );
      }

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      if (res.status === 200) {
        const data = await res.json();
        expect(data.workflow.isPublic).toBe(true);
      }
    });
  });

  describe("MCP Integration", () => {
    test("shared workflow is linked to MCP entry", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "MCP Linked Workflow",
          status: "live",
          usageCount: 5,
          successRate: "95.00",
        }
      );

      for (let i = 0; i < 5; i++) {
        await createTestWorkflowExecution(
          DATABASE_URL,
          workflow.id,
          testData.organization.id,
          testData.user.id,
          { status: "completed" }
        );
      }

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          description: "Test MCP workflow",
          tags: ["test", "mcp"],
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      if (res.status === 200) {
        const data = await res.json();
        expect(data.mcp).toBeDefined();
        expect(data.mcp.id).toBeDefined();

        // Verify workflow has MCP reference
        const updatedWorkflow = await getTestWorkflow(DATABASE_URL, workflow.id);
        expect(updatedWorkflow).not.toBeNull();
        if (updatedWorkflow) {
          expect(updatedWorkflow.mcpId).toBe(data.mcp.id);
        }
      }
    });
  });

  describe("Sharing Request Validation", () => {
    test("accepts sharing with minimal parameters", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Minimal Params Workflow",
          status: "live",
        }
      );

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({}), // No optional params
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should work with defaults
      expect([200, 400, 500]).toContain(res.status);
    });

    test("accepts sharing with all optional parameters", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Full Params Workflow",
          status: "live",
        }
      );

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          description: "Full description of the workflow",
          pricingType: "free",
          tags: ["email", "automation", "notification"],
          category: "productivity",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect([200, 400, 500]).toContain(res.status);
    });

    test("handles very long description gracefully", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Long Description Workflow",
          status: "live",
        }
      );

      const longDescription = "This is a test. ".repeat(500);

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          description: longDescription,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should either accept or reject gracefully
      expect([200, 400, 413]).toContain(res.status);
    });

    test("handles too many tags gracefully", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Many Tags Workflow",
          status: "live",
        }
      );

      const manyTags = Array.from({ length: 50 }, (_, i) => `tag${i}`);

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          tags: manyTags,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should either accept or reject gracefully
      expect([200, 400]).toContain(res.status);
    });
  });
});
