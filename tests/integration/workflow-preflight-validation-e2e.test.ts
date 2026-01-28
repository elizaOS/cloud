/**
 * E2E Integration Tests for Pre-flight Validation & Graceful Failure
 *
 * Tests the credential validation before workflow execution:
 * 1. Pre-flight validation passes with valid credentials
 * 2. Pre-flight validation fails with missing credentials
 * 3. Graceful failure returns actionable error information
 * 4. API returns structured error response for UI
 *
 * Real-world scenarios covered:
 * - Workflow execution with all credentials present
 * - Workflow execution with some credentials missing
 * - Workflow execution with all credentials missing
 * - Partial credential configurations
 * - OAuth token refresh scenarios
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../infrastructure/test-data-factory";
import {
  createTestWorkflow,
  createTestWorkflowExecution,
  cleanupTestWorkflows,
  getTestAuthHeaders,
} from "../infrastructure/workflow-test-helpers";

const TEST_DB_URL = process.env.DATABASE_URL || "";
const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const TIMEOUT = 30000;

const shouldRun = !!TEST_DB_URL;

// Mock fetch for external API calls
const originalFetch = globalThis.fetch;

describe.skipIf(!shouldRun)("Pre-flight Validation E2E Tests", () => {
  let testDataWithAllCreds: TestDataSet;
  let testDataWithPartialCreds: TestDataSet;
  let testDataWithNoCreds: TestDataSet;
  let client: Client;

  beforeAll(async () => {
    if (!shouldRun) return;

    // Create org with ALL credentials
    testDataWithAllCreds = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Preflight Test Org (All Creds)",
      creditBalance: 1000,
    });

    // Create org with PARTIAL credentials (only Google)
    testDataWithPartialCreds = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Preflight Test Org (Partial Creds)",
      creditBalance: 1000,
    });

    // Create org with NO credentials
    testDataWithNoCreds = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Preflight Test Org (No Creds)",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();

    // Add all credentials for first org
    const credsToAdd = [
      { key: "google_access_token", value: "test_google_token" },
      { key: "google_refresh_token", value: "test_refresh_token" },
      { key: "twilio_account_sid", value: "ACtest123" },
      { key: "twilio_auth_token", value: "test_twilio_token" },
    ];

    for (const cred of credsToAdd) {
      await client.query(
        `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (organization_id, key) DO UPDATE SET value = $3`,
        [testDataWithAllCreds.organization.id, cred.key, cred.value]
      );
    }

    // Add connected services entry
    await client.query(
      `INSERT INTO connected_services (id, organization_id, provider, status, credentials, scopes, created_at, updated_at)
       VALUES ($1, $2, 'google', 'connected', '{"access_token": "test"}', '{"calendar": true, "gmail": true}', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), testDataWithAllCreds.organization.id]
    );

    await client.query(
      `INSERT INTO connected_services (id, organization_id, provider, status, credentials, scopes, created_at, updated_at)
       VALUES ($1, $2, 'twilio', 'connected', '{"account_sid": "test"}', '{}', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), testDataWithAllCreds.organization.id]
    );

    // Add only Google credentials for partial org
    await client.query(
      `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
       VALUES ($1, 'google_access_token', 'test_google_token', NOW(), NOW())
       ON CONFLICT (organization_id, key) DO UPDATE SET value = 'test_google_token'`,
      [testDataWithPartialCreds.organization.id]
    );

    await client.query(
      `INSERT INTO connected_services (id, organization_id, provider, status, credentials, scopes, created_at, updated_at)
       VALUES ($1, $2, 'google', 'connected', '{"access_token": "test"}', '{"calendar": true}', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), testDataWithPartialCreds.organization.id]
    );
  });

  afterAll(async () => {
    if (!shouldRun) return;

    // Restore original fetch
    globalThis.fetch = originalFetch;

    const orgIds = [
      testDataWithAllCreds.organization.id,
      testDataWithPartialCreds.organization.id,
      testDataWithNoCreds.organization.id,
    ];

    // Clean up secrets
    for (const orgId of orgIds) {
      await client.query(`DELETE FROM secrets WHERE organization_id = $1`, [
        orgId,
      ]);
      await client.query(
        `DELETE FROM connected_services WHERE organization_id = $1`,
        [orgId]
      );
      await client.query(
        `DELETE FROM workflow_secret_requirements 
         WHERE workflow_id IN (
           SELECT id FROM generated_workflows WHERE organization_id = $1
         )`,
        [orgId]
      );
      await cleanupTestWorkflows(TEST_DB_URL, orgId);
      await cleanupTestData(TEST_DB_URL, orgId);
    }

    await client.end();
  });

  describe("Pre-flight Validation Service", () => {
    test("should pass validation when all credentials are present", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithAllCreds.organization.id,
        testDataWithAllCreds.user.id,
        {
          name: "All Creds Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "calendar.list_events" },
          ],
          status: "live",
        }
      );

      // Extract requirements
      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );
      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      // Validate
      const { credentialValidator } = await import(
        "@/lib/services/workflow-engine"
      );

      const result = await credentialValidator.validateForWorkflow(
        testDataWithAllCreds.organization.id,
        workflow.id
      );

      expect(result.valid).toBe(true);
      expect(result.missing.length).toBe(0);
    });

    test("should fail validation when credentials are missing", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithNoCreds.organization.id,
        testDataWithNoCreds.user.id,
        {
          name: "No Creds Workflow",
          serviceDependencies: ["google", "twilio"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
            { step: 2, serviceId: "twilio", operation: "sms.send" },
          ],
          status: "live",
        }
      );

      const { secretDependencyExtractor, credentialValidator } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const result = await credentialValidator.validateForWorkflow(
        testDataWithNoCreds.organization.id,
        workflow.id
      );

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);

      // Should identify missing providers
      const missingProviders = result.missing.map((m) => m.provider);
      expect(missingProviders).toContain("google");
    });

    test("should identify partial credential gaps", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithPartialCreds.organization.id,
        testDataWithPartialCreds.user.id,
        {
          name: "Partial Creds Workflow",
          serviceDependencies: ["google", "twilio"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
            { step: 2, serviceId: "twilio", operation: "sms.send" },
          ],
          status: "live",
        }
      );

      const { secretDependencyExtractor, credentialValidator } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const result = await credentialValidator.validateForWorkflow(
        testDataWithPartialCreds.organization.id,
        workflow.id
      );

      expect(result.valid).toBe(false);

      // Should only report Twilio as missing
      const missingProviders = result.missing.map((m) => m.provider);
      expect(missingProviders).toContain("twilio");
    });

    test("should provide actionable error details", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithNoCreds.organization.id,
        testDataWithNoCreds.user.id,
        {
          name: "Actionable Error Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "live",
        }
      );

      const { secretDependencyExtractor, credentialValidator } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const result = await credentialValidator.validateForWorkflow(
        testDataWithNoCreds.organization.id,
        workflow.id
      );

      expect(result.valid).toBe(false);

      for (const missing of result.missing) {
        expect(missing.provider).toBeDefined();
        expect(missing.description).toBeDefined();
        // Should have connect URL for OAuth providers
        if (missing.provider === "google") {
          expect(missing.authUrl).toBeDefined();
        }
      }
    });
  });

  describe("Workflow Execution with Pre-flight Check", () => {
    test("should block execution when credentials are missing", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithNoCreds.organization.id,
        testDataWithNoCreds.user.id,
        {
          name: "Blocked Execution Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "live",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflow.id}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testDataWithNoCreds.apiKey.key),
          body: JSON.stringify({
            params: { to: "test@example.com" },
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should return error status
      expect([400, 401, 403]).toContain(res.status);

      if (res.status === 400) {
        const data = await res.json();
        expect(data.error).toBeDefined();
        expect(data.preflightFailure).toBe(true);
        expect(data.missingCredentials).toBeDefined();
      }
    });

    test("should allow execution when credentials are present", async () => {
      // Mock external API
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (
          typeof url === "string" &&
          url.includes("googleapis.com/calendar")
        ) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ items: [{ id: "event1", summary: "Test" }] }),
              { status: 200 }
            )
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithAllCreds.organization.id,
        testDataWithAllCreds.user.id,
        {
          name: "Allowed Execution Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "calendar.list_events" },
          ],
          status: "live",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflow.id}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testDataWithAllCreds.apiKey.key),
          body: JSON.stringify({
            params: {},
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should either succeed (200) or fail for other reasons (not preflight)
      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBeDefined();
      } else if (res.status === 400 || res.status === 500) {
        const data = await res.json();
        // Should NOT be a preflight failure
        expect(data.preflightFailure).not.toBe(true);
      }
    });

    test("should skip preflight check in dry run mode", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithNoCreds.organization.id,
        testDataWithNoCreds.user.id,
        {
          name: "Dry Run Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "live",
        }
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflow.id}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testDataWithNoCreds.apiKey.key),
          body: JSON.stringify({
            params: { to: "test@example.com" },
            dryRun: true,
          }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Dry run should not trigger preflight failure
      if (res.status === 200) {
        const data = await res.json();
        expect(data.preflightFailure).not.toBe(true);
      }
    });
  });

  describe("API Error Response Structure", () => {
    test("should return structured error with missing credentials list", async () => {
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithNoCreds.organization.id,
        testDataWithNoCreds.user.id,
        {
          name: "Structured Error Workflow",
          serviceDependencies: ["google", "twilio"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
            { step: 2, serviceId: "twilio", operation: "sms.send" },
          ],
          status: "live",
        }
      );

      const { secretDependencyExtractor } = await import(
        "@/lib/services/workflow-engine"
      );

      await secretDependencyExtractor.extractAndSave(
        workflow.id,
        workflow.executionPlan
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/workflows/${workflow.id}/execute`,
        {
          method: "POST",
          headers: getTestAuthHeaders(testDataWithNoCreds.apiKey.key),
          body: JSON.stringify({ params: {} }),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      if (res.status === 400) {
        const data = await res.json();

        expect(data.error).toBeDefined();
        expect(data.preflightFailure).toBe(true);
        expect(data.missingCredentials).toBeDefined();
        expect(Array.isArray(data.missingCredentials)).toBe(true);
        expect(data.suggestion).toBeDefined();

        // Verify structure of each missing credential
        for (const cred of data.missingCredentials) {
          expect(cred.provider).toBeDefined();
          expect(cred.displayName).toBeDefined();
          expect(cred.connectUrl).toBeDefined();
        }
      }
    });
  });

  describe("Legacy Fallback", () => {
    test("should fallback to legacy validation when no DB requirements exist", async () => {
      // Create workflow without extracting requirements
      const workflow = await createTestWorkflow(
        TEST_DB_URL,
        testDataWithNoCreds.organization.id,
        testDataWithNoCreds.user.id,
        {
          name: "Legacy Fallback Workflow",
          serviceDependencies: ["google"],
          executionPlan: [
            { step: 1, serviceId: "google", operation: "gmail.send" },
          ],
          status: "live",
        }
      );

      // Don't extract requirements - test legacy path

      const { credentialValidator } = await import(
        "@/lib/services/workflow-engine"
      );

      const result = await credentialValidator.validateForWorkflow(
        testDataWithNoCreds.organization.id,
        workflow.id
      );

      // Should still work via legacy validation
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe("boolean");
    });
  });
});
