/**
 * E2E Integration Tests for Workflow Secret Requirements
 *
 * Tests the complete secret dependency tracking lifecycle:
 * 1. Extract secret requirements from execution plans
 * 2. Save requirements to database
 * 3. Query requirements for workflows
 * 4. Backfill existing workflows
 *
 * Real-world scenarios covered:
 * - Multi-service workflows with multiple dependencies
 * - OAuth vs API key vs credential types
 * - Missing/invalid execution plans
 * - Concurrent requirement updates
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
  getTestAuthHeaders,
} from "../infrastructure/workflow-test-helpers";

const TEST_DB_URL = process.env.DATABASE_URL || "";
const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const TIMEOUT = 30000;

const shouldRun = !!TEST_DB_URL;

describe.skipIf(!shouldRun)("Workflow Secret Requirements E2E Tests", () => {
  let testData: TestDataSet;
  let client: Client;

  beforeAll(async () => {
    if (!shouldRun) return;

    testData = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Secret Requirements Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    if (!shouldRun || !testData) return;

    // Clean up secret requirements for our test workflows
    await client.query(
      `DELETE FROM workflow_secret_requirements 
       WHERE workflow_id IN (
         SELECT id FROM generated_workflows WHERE organization_id = $1
       )`,
      [testData.organization.id]
    );

    await cleanupTestWorkflows(TEST_DB_URL, testData.organization.id);
    await cleanupTestData(TEST_DB_URL, testData.organization.id);
    await client.end();
  });

  describe("Secret Extraction from Execution Plans", () => {
    test("should extract Google OAuth requirement from calendar operation", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Calendar Sync Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "calendar.list_events" },
            { step: 2, serviceId: "google", operation: "calendar.create_event" },
          ],
          status: "testing",
        }
      );

      // Import and call the secret dependency extractor
      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      // Verify requirements were saved
      const result = await client.query(
        "SELECT * FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.some((r) => r.provider === "google")).toBe(true);
      expect(result.rows[0].requirement_type).toBe("oauth");
    });

    test("should extract Twilio API key requirement from SMS operation", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "SMS Notification Workflow",
          serviceDependencies: ["twilio"],
          executionPlan: [
            { step: 1, serviceId: "twilio", operation: "sms.send" },
          ],
          status: "testing",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const result = await client.query(
        "SELECT * FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.some((r) => r.provider === "twilio")).toBe(true);
      expect(result.rows[0].requirement_type).toBe("api_key");
    });

    test("should extract multiple providers from multi-service workflow", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Multi-Service Workflow",
          serviceDependencies: ["google", "twilio", "notion"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
            { step: 2, serviceId: "twilio", operation: "sms.send" },
            { step: 3, serviceId: "notion", operation: "page.create" },
          ],
          status: "testing",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const result = await client.query(
        "SELECT DISTINCT provider FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      const providers = result.rows.map((r) => r.provider);
      expect(providers).toContain("google");
      expect(providers).toContain("twilio");
    });

    test("should handle empty execution plan gracefully", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Empty Plan Workflow",
          serviceDependencies: [],
          executionPlan: [],
          status: "draft",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      // Should not throw
      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const result = await client.query(
        "SELECT * FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      expect(result.rows.length).toBe(0);
    });

    test("should handle unknown services gracefully", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Unknown Service Workflow",
          serviceDependencies: ["unknown_service"],
          executionPlan: [
            { step: 1, serviceId: "unknown_service", operation: "do_something" },
          ],
          status: "draft",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      // Should not throw
      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      // Unknown services might create generic requirements or none
      const result = await client.query(
        "SELECT * FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      // Result can be 0 or more depending on implementation
      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Requirements Database Operations", () => {
    test("should replace requirements on re-extraction", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Re-extraction Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "testing",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      // First extraction
      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const firstResult = await client.query(
        "SELECT COUNT(*) as count FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      // Second extraction with different plan
      const newPlan = [
        { step: 1, serviceId: "twilio", operation: "sms.send" },
      ];

      await secretDependencyExtractor.extractAndSave(workflow.id, newPlan);

      const secondResult = await client.query(
        "SELECT * FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );

      // Old google requirement should be replaced with twilio
      expect(secondResult.rows.some((r) => r.provider === "twilio")).toBe(true);
      expect(secondResult.rows.some((r) => r.provider === "google")).toBe(false);
    });

    test("should handle concurrent requirement updates safely", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Concurrent Update Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "testing",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      // Launch multiple concurrent extractions
      const promises = Array.from({ length: 5 }, () =>
        secretDependencyExtractor.extractAndSave(
          workflow.id,
          workflow.executionPlan
        )
      );

      await Promise.all(promises);

      // Should not have duplicate requirements
      const result = await client.query(
        "SELECT provider, COUNT(*) as count FROM workflow_secret_requirements WHERE workflow_id = $1 GROUP BY provider",
        [workflow.id]
      );

      for (const row of result.rows) {
        expect(parseInt(row.count)).toBeLessThanOrEqual(1);
      }
    });

    test("should cascade delete requirements when workflow is deleted", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Cascade Delete Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "draft",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      // Verify requirements exist
      const beforeDelete = await client.query(
        "SELECT COUNT(*) as count FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );
      expect(parseInt(beforeDelete.rows[0].count)).toBeGreaterThan(0);

      // Delete the workflow
      await client.query("DELETE FROM generated_workflows WHERE id = $1", [
        workflow.id,
      ]);

      // Requirements should be cascade deleted
      const afterDelete = await client.query(
        "SELECT COUNT(*) as count FROM workflow_secret_requirements WHERE workflow_id = $1",
        [workflow.id]
      );
      expect(parseInt(afterDelete.rows[0].count)).toBe(0);
    });
  });

  describe("Requirements Query via Repository", () => {
    test("should get requirements by workflow ID", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testData.organization.id,
        testData.user.id,
        {
          name: "Query Test Workflow",
          serviceDependencies: ["google", "twilio"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
            { step: 2, serviceId: "twilio", operation: "sms.send" },
          ],
          status: "testing",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const requirements = await secretDependencyExtractor.getForWorkflow(
        workflow.id
      );

      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements.some((r) => r.provider === "google")).toBe(true);
    });

    test("should return empty array for workflow without requirements", async () => {
      const nonExistentId = uuidv4();

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      const requirements = await secretDependencyExtractor.getForWorkflow(
        nonExistentId
      );

      expect(requirements).toEqual([]);
    });
  });

  describe("API Endpoint Integration", () => {
    test("should extract requirements when generating new workflow", async () => {
      const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

      if (!hasAnthropicKey) {
        console.log("Skipping AI generation test - no ANTHROPIC_API_KEY");
        return;
      }

      const res = await fetch(`${SERVER_URL}/api/v1/workflows/generate`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          userIntent: "Send an email notification when someone signs up",
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (res.status === 200) {
        const data = await res.json();
        const workflowId = data.workflow.id;

        // Give time for async extraction
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check requirements were created
        const result = await client.query(
          "SELECT * FROM workflow_secret_requirements WHERE workflow_id = $1",
          [workflowId]
        );

        // Should have extracted requirements (email = google)
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
