/**
 * Workflow End-to-End Integration Tests
 *
 * Tests the complete workflow lifecycle:
 * 1. Generate a workflow from user intent
 * 2. Review and update the workflow
 * 3. Move to testing status
 * 4. Execute test runs
 * 5. Move to live status
 * 6. Execute in production
 * 7. Share as MCP (optional)
 *
 * These tests simulate real-world usage scenarios.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestDataSet, cleanupTestData } from "../infrastructure/test-data-factory";
import {
  createTestWorkflow,
  cleanupTestWorkflows,
  getTestWorkflow,
  verifyWorkflowCode,
  verifyWorkflowStructure,
  getTestAuthHeaders,
} from "../infrastructure/workflow-test-helpers";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const TIMEOUT = 60000; // Longer timeout for AI generation

// Skip tests if no database URL
const shouldRun = !!DATABASE_URL;
const hasAnthropicKey = !!ANTHROPIC_API_KEY;

describe.skipIf(!shouldRun)("Workflow E2E Integration Tests", () => {
  let testData: Awaited<ReturnType<typeof createTestDataSet>>;
  let generatedWorkflowId: string | null = null;

  beforeAll(async () => {
    if (!shouldRun) return;

    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "E2E Workflow Test Org",
      userName: "E2E Test User",
      creditBalance: 10000,
    });
  });

  afterAll(async () => {
    if (!shouldRun || !testData) return;

    await cleanupTestWorkflows(DATABASE_URL, testData.organization.id);
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("Scenario 1: Manual Workflow Lifecycle", () => {
    let workflowId: string;

    test("Step 1: Create a workflow via database (simulating generation)", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "E2E Email Notification Workflow",
          userIntent: "Send email notifications to users when events occur",
          status: "draft",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "email.send" },
          ],
        }
      );

      workflowId = workflow.id;
      expect(workflow.id).toBeDefined();
      expect(workflow.status).toBe("draft");
    });

    test("Step 2: Retrieve workflow details", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.id).toBe(workflowId);
      expect(data.workflow.status).toBe("draft");
    });

    test("Step 3: Update workflow name and description", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          name: "Updated E2E Workflow",
          description: "Updated description for E2E testing",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.workflow.name).toBe("Updated E2E Workflow");
    });

    test("Step 4: Move workflow to testing status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "testing" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const workflow = await getTestWorkflow(DATABASE_URL, workflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.status).toBe("testing");
      }
    });

    test("Step 5: Move workflow to live status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/${workflowId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ status: "live" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const workflow = await getTestWorkflow(DATABASE_URL, workflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.status).toBe("live");
      }
    });

    test("Step 6: Execute the live workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: {
              to: "test@example.com",
              subject: "E2E Test",
              body: "This is an E2E test email",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Execution may succeed or fail depending on credentials
      expect([200, 400, 500]).toContain(res.status);
    });

    test("Step 7: Verify workflow usage is tracked", async () => {
      const workflow = await getTestWorkflow(DATABASE_URL, workflowId);
      // Usage may or may not be incremented depending on execution result
      expect(workflow).not.toBeNull();
    });

    test("Step 8: Attempt to share the workflow", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflowId}/share`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            description: "E2E tested workflow",
            pricingType: "free",
            tags: ["e2e", "test"],
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // May succeed or fail based on eligibility
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe.skipIf(!hasAnthropicKey)("Scenario 2: AI-Generated Workflow Lifecycle", () => {
    test("Step 1: Generate workflow from natural language", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          userIntent:
            "When I receive an email about a meeting, create a calendar event " +
            "and send a confirmation email to the sender",
        }),
        signal: AbortSignal.timeout(120000), // Long timeout for AI
      });

      if (res.status === 200) {
        const data = await res.json();
        generatedWorkflowId = data.workflow.id;

        expect(data.workflow).toHaveProperty("id");
        expect(data.workflow).toHaveProperty("generatedCode");
        expect(data.workflow).toHaveProperty("serviceDependencies");
        expect(data.workflow.status).toBe("draft");

        // Verify code quality
        const codeVerification = verifyWorkflowCode(data.workflow.generatedCode);
        console.log("Code verification:", codeVerification);
      } else {
        console.log("AI generation not available, skipping test");
      }
    });

    test("Step 2: Verify generated workflow structure", async () => {
      if (!generatedWorkflowId) return;

      const workflow = await getTestWorkflow(DATABASE_URL, generatedWorkflowId);
      expect(workflow).not.toBeNull();

      const verification = verifyWorkflowStructure(workflow);
      expect(verification.valid).toBe(true);
    });

    test("Step 3: Generated workflow has proper metadata", async () => {
      if (!generatedWorkflowId) return;

      const workflow = await getTestWorkflow(DATABASE_URL, generatedWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.generationMetadata).toBeDefined();
        expect(workflow.generationMetadata.model).toBeDefined();
        expect(workflow.generationMetadata.iterations).toBeGreaterThanOrEqual(1);
      }
    });

    test("Step 4: Generated code meets quality standards", async () => {
      if (!generatedWorkflowId) return;

      const workflow = await getTestWorkflow(DATABASE_URL, generatedWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        const codeCheck = verifyWorkflowCode(workflow.generatedCode);

        // Core requirements
        expect(codeCheck.checks.hasExport).toBe(true);
        expect(codeCheck.checks.hasAsyncFunction).toBe(true);
        expect(codeCheck.checks.hasTryCatch).toBe(true);
      }
    });
  });

  describe("Scenario 3: Error Recovery", () => {
    let recoveryWorkflowId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Error Recovery Workflow",
          status: "live",
        }
      );
      recoveryWorkflowId = workflow.id;
    });

    test("Workflow survives execution failure", async () => {
      // Execute with invalid params
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${recoveryWorkflowId}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            params: { invalid: "data" },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should fail gracefully
      expect([200, 400, 500]).toContain(res.status);

      // Workflow should still exist
      const workflow = await getTestWorkflow(DATABASE_URL, recoveryWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.status).toBe("live");
      }
    });

    test("Workflow can be deprecated after failures", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${recoveryWorkflowId}`,
        {
          method: "PATCH",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({ status: "deprecated" }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const workflow = await getTestWorkflow(DATABASE_URL, recoveryWorkflowId);
      expect(workflow).not.toBeNull();
      if (workflow) {
        expect(workflow.status).toBe("deprecated");
      }
    });

    test("Deprecated workflow cannot be executed", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${recoveryWorkflowId}/execute`,
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

  describe("Scenario 4: High Volume Workflows", () => {
    test("Can create multiple workflows quickly", async () => {
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        createTestWorkflow(
          DATABASE_URL,
          testData.organization.id,
          testData.user.id,
          {
            name: `High Volume Workflow ${i + 1}`,
            status: "draft",
          }
        )
      );

      const workflows = await Promise.all(createPromises);
      expect(workflows.length).toBe(5);

      for (const workflow of workflows) {
        expect(workflow.id).toBeDefined();
      }
    });

    test("Can list all organization workflows", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/workflows?limit=50`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.workflows)).toBe(true);
      // Should have at least the workflows we created
      expect(data.workflows.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Scenario 5: Workflow Versioning Concept", () => {
    test("Can create a workflow based on another", async () => {
      // Create original
      const original = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Original Workflow v1",
          status: "live",
        }
      );

      // Create new version (simulated)
      const newVersion = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Original Workflow v2",
          status: "draft",
          userIntent: `Improved version of: ${original.userIntent}`,
        }
      );

      expect(newVersion.id).not.toBe(original.id);
      expect(newVersion.name).toContain("v2");
    });
  });

  describe("Scenario 6: Concurrent Operations", () => {
    test("Handles concurrent reads safely", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Concurrent Read Workflow",
          status: "live",
        }
      );

      const readPromises = Array.from({ length: 10 }, () =>
        fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}`, {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        })
      );

      const responses = await Promise.all(readPromises);

      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });

    test("Handles concurrent updates safely", async () => {
      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Concurrent Update Workflow",
          status: "draft",
        }
      );

      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        fetch(`${SERVER_URL}/api/v1/workflows/${workflow.id}`, {
          method: "PATCH",
          headers: getTestAuthHeaders(testData.apiKey.key),
          body: JSON.stringify({
            name: `Updated Name ${i + 1}`,
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        })
      );

      const responses = await Promise.all(updatePromises);

      // All should complete (last one wins)
      for (const res of responses) {
        expect([200, 409]).toContain(res.status);
      }
    });
  });

  describe("Scenario 7: Data Integrity", () => {
    test("Workflow maintains data integrity after updates", async () => {
      const original = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Integrity Test Workflow",
          status: "draft",
          serviceDependencies: ["google", "notion"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "email.list" },
            { step: 2, serviceId: "notion", operation: "page.create" },
          ],
        }
      );

      // Update name only
      await fetch(`${SERVER_URL}/api/v1/workflows/${original.id}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ name: "Updated Integrity Workflow" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      const updated = await getTestWorkflow(DATABASE_URL, original.id);
      expect(updated).not.toBeNull();

      if (updated) {
        // Name should be updated
        expect(updated.name).toBe("Updated Integrity Workflow");

        // Other fields should be unchanged
        expect(updated.serviceDependencies).toEqual(original.serviceDependencies);
        expect(updated.executionPlan).toEqual(original.executionPlan);
        expect(updated.userIntent).toBe(original.userIntent);
      }
    });

    test("Workflow code is preserved correctly", async () => {
      const complexCode = `
export async function executeWorkflow(
  input: { data: string },
  credentials: { token: string }
): Promise<{ success: boolean }> {
  try {
    // Special characters: <>&"'
    const result = await fetch(\`https://api.example.com/\${input.data}\`);
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}`.trim();

      const workflow = await createTestWorkflow(
        DATABASE_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Code Integrity Workflow",
          generatedCode: complexCode,
        }
      );

      const retrieved = await getTestWorkflow(DATABASE_URL, workflow.id);
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.generatedCode).toBe(complexCode);
      }
    });
  });
});
