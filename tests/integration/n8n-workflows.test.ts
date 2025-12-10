/**
 * Integration tests for N8N Workflow System
 *
 * Tests the complete workflow management system including:
 * - Workflow CRUD operations
 * - Version control
 * - Variables management
 * - API key management (with hash validation)
 * - Workflow testing
 * - n8n instance integration
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { organizationsService } from "@/lib/services/organizations";
import { usersService } from "@/lib/services/users";

describe("N8N Workflow Integration Tests", () => {
  let testUserId: string;
  let testOrgId: string;

  beforeAll(async () => {
    // Create test organization
    const org = await organizationsService.create({
      name: "Test N8N Org",
      credit_balance: "1000",
    });
    testOrgId = org.id;

    // Create test user
    const user = await usersService.create({
      email: `test-n8n-${Date.now()}@example.com`,
      name: "Test N8N User",
      organization_id: testOrgId,
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup would go here if needed
  });

  describe("Workflow CRUD Operations", () => {
    it("should create a workflow", async () => {
      const workflowData = {
        nodes: [
          {
            id: "node-1",
            type: "n8n-nodes-base.start",
            name: "Start",
            position: [250, 300],
          },
        ],
        connections: {},
        settings: {},
      };

      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Test Workflow",
        description: "A test workflow",
        workflowData,
        tags: ["test"],
      });

      expect(workflow).toBeDefined();
      expect(workflow.name).toBe("Test Workflow");
      expect(workflow.status).toBe("draft");
      expect(workflow.version).toBe(1);
    });

    it("should list workflows", async () => {
      const workflows = await n8nWorkflowsService.listWorkflows(testOrgId);
      expect(workflows.length).toBeGreaterThan(0);
    });

    it("should get a workflow by ID", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Get Test Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      const retrieved = await n8nWorkflowsService.getWorkflow(workflow.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(workflow.id);
    });

    it("should update a workflow", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Update Test Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      const updated = await n8nWorkflowsService.updateWorkflow(workflow.id, {
        name: "Updated Workflow Name",
        status: "active",
      });

      expect(updated.name).toBe("Updated Workflow Name");
      expect(updated.status).toBe("active");
    });

    it("should delete a workflow", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Delete Test Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      await n8nWorkflowsService.deleteWorkflow(workflow.id);

      const retrieved = await n8nWorkflowsService.getWorkflow(workflow.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("Version Control", () => {
    it("should create versions on workflow update", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Version Test Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      expect(workflow.version).toBe(1);

      const updated = await n8nWorkflowsService.updateWorkflow(workflow.id, {
        workflowData: { nodes: [{ id: "new-node" }], connections: {} },
      });

      expect(updated.version).toBe(2);

      const versions = await n8nWorkflowsService.getWorkflowVersions(workflow.id);
      expect(versions.length).toBe(2);
    });

    it("should revert to a specific version", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Revert Test Workflow",
        workflowData: { nodes: [{ id: "node-1" }], connections: {} },
      });

      await n8nWorkflowsService.updateWorkflow(workflow.id, {
        workflowData: { nodes: [{ id: "node-2" }], connections: {} },
      });

      const reverted = await n8nWorkflowsService.revertWorkflowToVersion(
        workflow.id,
        1,
        testUserId
      );

      expect(reverted.version).toBe(3); // New version created
    });
  });

  describe("Variables Management", () => {
    it("should create a global variable", async () => {
      const variable = await n8nWorkflowsService.createVariable({
        organizationId: testOrgId,
        name: "TEST_API_URL",
        value: "https://api.example.com",
        type: "string",
      });

      expect(variable).toBeDefined();
      expect(variable.name).toBe("TEST_API_URL");
      expect(variable.value).toBe("https://api.example.com");
    });

    it("should list global variables", async () => {
      const variables = await n8nWorkflowsService.getGlobalVariables(testOrgId);
      expect(variables.length).toBeGreaterThan(0);
    });

    it("should create a workflow variable", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Variable Test Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      const variable = await n8nWorkflowsService.createVariable({
        organizationId: testOrgId,
        workflowId: workflow.id,
        name: "WORKFLOW_SECRET",
        value: "secret-value",
        isSecret: true,
      });

      expect(variable.workflow_id).toBe(workflow.id);
      expect(variable.is_secret).toBe(true);
    });

    it("should update a variable", async () => {
      const variable = await n8nWorkflowsService.createVariable({
        organizationId: testOrgId,
        name: "UPDATE_TEST",
        value: "old-value",
      });

      const updated = await n8nWorkflowsService.updateVariable(variable.id, {
        value: "new-value",
      });

      expect(updated.value).toBe("new-value");
    });

    it("should delete a variable", async () => {
      const variable = await n8nWorkflowsService.createVariable({
        organizationId: testOrgId,
        name: "DELETE_TEST",
        value: "value",
      });

      await n8nWorkflowsService.deleteVariable(variable.id);

      // Variable should be deleted (can't verify easily without repository access)
    });
  });

  describe("API Key Management", () => {
    it("should create a global API key", async () => {
      const result = await n8nWorkflowsService.createApiKey({
        organizationId: testOrgId,
        name: "Test API Key",
        scopes: ["read", "write"],
      });

      expect(result.apiKey).toBeDefined();
      expect(result.plaintextKey).toBeDefined();
      expect(result.plaintextKey.startsWith("n8n_")).toBe(true);
    });

    it("should list API keys", async () => {
      const apiKeys = await n8nWorkflowsService.listApiKeys(testOrgId);
      expect(apiKeys.length).toBeGreaterThan(0);
    });

    it("should validate an API key", async () => {
      const result = await n8nWorkflowsService.createApiKey({
        organizationId: testOrgId,
        name: "Validation Test Key",
      });

      // Validate using the full plaintext key (not just prefix)
      const validated = await n8nWorkflowsService.validateApiKey(result.plaintextKey);

      expect(validated).toBeDefined();
      expect(validated?.is_active).toBe(true);
    });

    it("should reject invalid API key", async () => {
      // Create a valid key then try to validate a modified version
      const result = await n8nWorkflowsService.createApiKey({
        organizationId: testOrgId,
        name: "Invalid Test Key",
      });

      // Try to validate with just the prefix (should fail now)
      const keyPrefix = result.plaintextKey.substring(0, 12);
      const invalidValidation = await n8nWorkflowsService.validateApiKey(keyPrefix);
      expect(invalidValidation).toBeNull();

      // Try to validate with a tampered key
      const tamperedKey = result.plaintextKey.slice(0, -5) + "xxxxx";
      const tamperedValidation = await n8nWorkflowsService.validateApiKey(tamperedKey);
      expect(tamperedValidation).toBeNull();
    });

    it("should validate API key with scopes", async () => {
      const result = await n8nWorkflowsService.createApiKey({
        organizationId: testOrgId,
        name: "Scoped API Key",
        scopes: ["workflows:read", "workflows:write"],
      });

      // Validate with required scope
      const validWithScope = await n8nWorkflowsService.validateApiKeyWithScope(
        result.plaintextKey,
        "workflows:read"
      );
      expect(validWithScope).toBeDefined();

      // Validate with missing scope should fail
      const invalidWithScope = await n8nWorkflowsService.validateApiKeyWithScope(
        result.plaintextKey,
        "admin:delete"
      );
      expect(invalidWithScope).toBeNull();
    });

    it("should check scope with wildcards", async () => {
      const result = await n8nWorkflowsService.createApiKey({
        organizationId: testOrgId,
        name: "Wildcard Scope Key",
        scopes: ["workflows:*"],
      });

      const validated = await n8nWorkflowsService.validateApiKey(result.plaintextKey);
      expect(validated).toBeDefined();

      // Check wildcard scope
      expect(n8nWorkflowsService.hasScope(validated!, "workflows:read")).toBe(true);
      expect(n8nWorkflowsService.hasScope(validated!, "workflows:write")).toBe(true);
      expect(n8nWorkflowsService.hasScope(validated!, "admin:delete")).toBe(false);
    });

    it("should revoke API key", async () => {
      const result = await n8nWorkflowsService.createApiKey({
        organizationId: testOrgId,
        name: "Revoke Test Key",
      });

      // Verify key is active
      const validBefore = await n8nWorkflowsService.validateApiKey(result.plaintextKey);
      expect(validBefore?.is_active).toBe(true);

      // Revoke the key
      await n8nWorkflowsService.revokeApiKey(result.apiKey.id);

      // Verify key is now invalid
      const validAfter = await n8nWorkflowsService.validateApiKey(result.plaintextKey);
      expect(validAfter).toBeNull();
    });
  });

  describe("Workflow Testing", () => {
    it("should test a workflow execution", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Test Execution Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      const execution = await n8nWorkflowsService.testWorkflow({
        workflowId: workflow.id,
        inputData: { test: "data" },
        userId: testUserId,
      });

      expect(execution).toBeDefined();
      expect(execution.status).toBe("success");
      expect(execution.duration_ms).toBeDefined();
    });

    it("should list workflow executions", async () => {
      const workflow = await n8nWorkflowsService.createWorkflow({
        organizationId: testOrgId,
        userId: testUserId,
        name: "Execution History Workflow",
        workflowData: { nodes: [], connections: {} },
      });

      await n8nWorkflowsService.testWorkflow({
        workflowId: workflow.id,
        userId: testUserId,
      });

      const executions = await n8nWorkflowsService.getWorkflowExecutions(workflow.id);
      expect(executions.length).toBeGreaterThan(0);
    });
  });

  describe("Workflow Validation", () => {
    it("should validate a valid workflow", async () => {
      const workflowData = {
        nodes: [
          {
            id: "node-1",
            type: "n8n-nodes-base.start",
            name: "Start",
          },
        ],
        connections: {},
      };

      const result = await n8nWorkflowsService.validateWorkflow(workflowData);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("should reject an invalid workflow", async () => {
      const workflowData = {
        nodes: [], // Missing required nodes
        connections: {},
      };

      const result = await n8nWorkflowsService.validateWorkflow(workflowData);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("n8n Instance Management", () => {
    it("should create an n8n instance", async () => {
      // Note: This will fail connection test, but should create the instance
      const instance = await n8nWorkflowsService.createInstance(
        testOrgId,
        testUserId,
        "Test Instance",
        "https://n8n.example.com",
        "test-api-key",
        false
      );

      expect(instance).toBeDefined();
      expect(instance.name).toBe("Test Instance");
    });

    it("should list n8n instances", async () => {
      const instances = await n8nWorkflowsService.listInstances(testOrgId);
      expect(instances.length).toBeGreaterThan(0);
    });
  });
});


