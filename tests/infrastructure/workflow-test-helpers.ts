/**
 * Workflow Test Helpers
 *
 * Test utilities for workflow-related integration tests:
 * - Create test workflows in database
 * - Generate mock workflow data
 * - Clean up test workflows
 * - Verify workflow structure
 */

import { v4 as uuidv4 } from "uuid";
import { Client } from "pg";

export interface TestWorkflow {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  userIntent: string;
  generatedCode: string;
  serviceDependencies: string[];
  executionPlan: Array<{ step: number; serviceId: string; operation: string }>;
  testResults: {
    syntaxValid: boolean;
    hasErrorHandling: boolean;
    hasTypedReturn: boolean;
    warnings: string[];
  };
  generationMetadata: {
    model: string;
    iterations: number;
    tokensUsed: number;
    generatedAt: string;
  };
  status: "draft" | "testing" | "live" | "shared" | "deprecated";
  usageCount: number;
  successRate: string;
  isPublic: boolean;
  mcpId?: string;
}

export interface TestWorkflowExecution {
  id: string;
  workflowId: string;
  organizationId: string;
  userId?: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  executionTimeMs?: number;
  inputParams: Record<string, unknown>;
  outputResult?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Generate a valid mock workflow code
 */
export function generateMockWorkflowCode(operation = "email.send"): string {
  return `
import { google } from "googleapis";

interface WorkflowInput {
  to: string;
  subject: string;
  body: string;
}

interface WorkflowOutput {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Auto-generated workflow for: ${operation}
 */
export async function executeWorkflow(
  input: WorkflowInput,
  credentials: { access_token: string }
): Promise<WorkflowOutput> {
  try {
    // Validate input
    if (!input.to) {
      throw new Error("Recipient (to) is required");
    }
    if (!input.subject) {
      throw new Error("Subject is required");
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: credentials.access_token });

    const gmail = google.gmail({ version: "v1", auth });

    const message = [
      \`To: \${input.to}\`,
      \`Subject: \${input.subject}\`,
      "",
      input.body || "",
    ].join("\\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_")
      .replace(/=+$/, "");

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      success: true,
      messageId: response.data.id || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
`.trim();
}

/**
 * Generate mock workflow data for testing
 */
export function generateMockWorkflow(
  organizationId: string,
  userId: string,
  overrides: Partial<TestWorkflow> = {}
): TestWorkflow {
  const id = overrides.id || uuidv4();

  return {
    id,
    organizationId,
    userId,
    name: overrides.name || `Test Workflow ${id.slice(0, 8)}`,
    userIntent:
      overrides.userIntent || "Send an email to the team about the meeting",
    generatedCode:
      overrides.generatedCode || generateMockWorkflowCode("email.send"),
    serviceDependencies: overrides.serviceDependencies || ["google"],
    executionPlan: overrides.executionPlan || [
      { step: 1, serviceId: "google", operation: "email.send" },
    ],
    testResults: overrides.testResults || {
      syntaxValid: true,
      hasErrorHandling: true,
      hasTypedReturn: true,
      warnings: [],
    },
    generationMetadata: overrides.generationMetadata || {
      model: "claude-sonnet-4-20250514",
      iterations: 1,
      tokensUsed: 850,
      generatedAt: new Date().toISOString(),
    },
    status: overrides.status || "draft",
    usageCount: overrides.usageCount || 0,
    successRate: overrides.successRate || "0.00",
    isPublic: overrides.isPublic || false,
    mcpId: overrides.mcpId,
  };
}

/**
 * Create a test workflow directly in the database
 */
export async function createTestWorkflow(
  connectionString: string,
  organizationId: string,
  userId: string,
  overrides: Partial<TestWorkflow> = {}
): Promise<TestWorkflow> {
  const workflow = generateMockWorkflow(organizationId, userId, overrides);

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO generated_workflows (
        id, organization_id, created_by_user_id, name, user_intent,
        generated_code, service_dependencies, execution_plan,
        test_results, generation_metadata, status, usage_count,
        success_rate, is_public, mcp_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )`,
      [
        workflow.id,
        workflow.organizationId,
        workflow.userId,
        workflow.name,
        workflow.userIntent,
        workflow.generatedCode,
        JSON.stringify(workflow.serviceDependencies),
        JSON.stringify(workflow.executionPlan),
        JSON.stringify(workflow.testResults),
        JSON.stringify(workflow.generationMetadata),
        workflow.status,
        workflow.usageCount,
        workflow.successRate,
        workflow.isPublic,
        workflow.mcpId || null,
      ]
    );

    console.log(
      `[WorkflowTestHelper] Created test workflow: ${workflow.name} (${workflow.id})`
    );
    return workflow;
  } finally {
    await client.end();
  }
}

/**
 * Create a test workflow execution record
 */
export async function createTestWorkflowExecution(
  connectionString: string,
  workflowId: string,
  organizationId: string,
  userId: string | null,
  overrides: Partial<TestWorkflowExecution> = {}
): Promise<TestWorkflowExecution> {
  const execution: TestWorkflowExecution = {
    id: overrides.id || uuidv4(),
    workflowId,
    organizationId,
    userId: userId || undefined,
    status: overrides.status || "completed",
    startedAt: overrides.startedAt || new Date(),
    completedAt: overrides.completedAt || new Date(),
    executionTimeMs: overrides.executionTimeMs || 150,
    inputParams: overrides.inputParams || { to: "test@example.com" },
    outputResult: overrides.outputResult || { success: true },
    errorMessage: overrides.errorMessage,
  };

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO workflow_executions (
        id, workflow_id, organization_id, user_id, status,
        started_at, completed_at, execution_time_ms,
        input_params, output_result, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )`,
      [
        execution.id,
        execution.workflowId,
        execution.organizationId,
        execution.userId || null,
        execution.status,
        execution.startedAt,
        execution.completedAt || null,
        execution.executionTimeMs || null,
        JSON.stringify(execution.inputParams),
        execution.outputResult ? JSON.stringify(execution.outputResult) : null,
        execution.errorMessage || null,
      ]
    );

    console.log(
      `[WorkflowTestHelper] Created test execution: ${execution.id} for workflow ${workflowId}`
    );
    return execution;
  } finally {
    await client.end();
  }
}

/**
 * Get a workflow by ID from the database
 */
export async function getTestWorkflow(
  connectionString: string,
  workflowId: string
): Promise<TestWorkflow | null> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(
      "SELECT * FROM generated_workflows WHERE id = $1",
      [workflowId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.created_by_user_id,
      name: row.name,
      userIntent: row.user_intent,
      generatedCode: row.generated_code,
      serviceDependencies: row.service_dependencies,
      executionPlan: row.execution_plan,
      testResults: row.test_results,
      generationMetadata: row.generation_metadata,
      status: row.status,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      isPublic: row.is_public,
      mcpId: row.mcp_id,
    };
  } finally {
    await client.end();
  }
}

/**
 * Update workflow status
 */
export async function updateTestWorkflowStatus(
  connectionString: string,
  workflowId: string,
  status: TestWorkflow["status"]
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(
      "UPDATE generated_workflows SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, workflowId]
    );
  } finally {
    await client.end();
  }
}

/**
 * Clean up test workflows by organization ID
 */
export async function cleanupTestWorkflows(
  connectionString: string,
  organizationId: string
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Delete executions first (foreign key)
    await client.query(
      "DELETE FROM workflow_executions WHERE organization_id = $1",
      [organizationId]
    );

    // Then delete workflows
    await client.query(
      "DELETE FROM generated_workflows WHERE organization_id = $1",
      [organizationId]
    );

    console.log(
      `[WorkflowTestHelper] Cleaned up workflows for org: ${organizationId}`
    );
  } finally {
    await client.end();
  }
}

/**
 * Clean up a specific workflow and its executions
 */
export async function cleanupTestWorkflow(
  connectionString: string,
  workflowId: string
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Delete executions first (foreign key)
    await client.query(
      "DELETE FROM workflow_executions WHERE workflow_id = $1",
      [workflowId]
    );

    // Then delete the workflow
    await client.query("DELETE FROM generated_workflows WHERE id = $1", [
      workflowId,
    ]);

    console.log(`[WorkflowTestHelper] Cleaned up workflow: ${workflowId}`);
  } finally {
    await client.end();
  }
}

/**
 * Verify workflow structure meets requirements
 */
export function verifyWorkflowStructure(workflow: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!workflow || typeof workflow !== "object") {
    return { valid: false, errors: ["Workflow is not an object"] };
  }

  const w = workflow as Record<string, unknown>;

  // Required fields
  const requiredFields = [
    "id",
    "name",
    "userIntent",
    "generatedCode",
    "serviceDependencies",
    "executionPlan",
    "status",
  ];

  for (const field of requiredFields) {
    if (!(field in w)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Type checks
  if (typeof w.id !== "string") {
    errors.push("id must be a string");
  }

  if (typeof w.name !== "string" || (w.name as string).length === 0) {
    errors.push("name must be a non-empty string");
  }

  if (!Array.isArray(w.serviceDependencies)) {
    errors.push("serviceDependencies must be an array");
  }

  if (!Array.isArray(w.executionPlan)) {
    errors.push("executionPlan must be an array");
  }

  // Validate status
  const validStatuses = ["draft", "testing", "live", "shared", "deprecated"];
  if (!validStatuses.includes(w.status as string)) {
    errors.push(`Invalid status: ${w.status}. Must be one of: ${validStatuses.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify workflow code meets quality requirements
 */
export function verifyWorkflowCode(code: string): {
  valid: boolean;
  checks: {
    hasExport: boolean;
    hasAsyncFunction: boolean;
    hasTryCatch: boolean;
    hasTypedReturn: boolean;
    hasInputValidation: boolean;
  };
  warnings: string[];
} {
  const checks = {
    hasExport: code.includes("export"),
    hasAsyncFunction: code.includes("async function") || code.includes("async ("),
    hasTryCatch: code.includes("try") && code.includes("catch"),
    hasTypedReturn: code.includes("): Promise<") || code.includes(">: Promise<"),
    hasInputValidation:
      code.includes("if (!input") ||
      code.includes("if (input") ||
      code.includes("!== undefined") ||
      code.includes("=== undefined"),
  };

  const warnings: string[] = [];

  if (!checks.hasExport) {
    warnings.push("Code should export the executeWorkflow function");
  }
  if (!checks.hasAsyncFunction) {
    warnings.push("Code should use async function");
  }
  if (!checks.hasTryCatch) {
    warnings.push("Code should have try-catch error handling");
  }
  if (!checks.hasTypedReturn) {
    warnings.push("Code should have typed return (Promise<T>)");
  }
  if (!checks.hasInputValidation) {
    warnings.push("Consider adding input validation");
  }

  // Check for potential security issues
  if (code.match(/["']sk-[a-zA-Z0-9-]+["']/)) {
    warnings.push("Potential hardcoded API key detected");
  }

  if (code.includes("eval(") || code.includes("Function(")) {
    warnings.push("Potentially unsafe code execution detected");
  }

  return {
    valid:
      checks.hasExport && checks.hasAsyncFunction && checks.hasTryCatch,
    checks,
    warnings,
  };
}

/**
 * Generate test API request headers with auth
 */
export function getTestAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Wait for condition with timeout
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

export default {
  generateMockWorkflow,
  generateMockWorkflowCode,
  createTestWorkflow,
  createTestWorkflowExecution,
  getTestWorkflow,
  updateTestWorkflowStatus,
  cleanupTestWorkflows,
  cleanupTestWorkflow,
  verifyWorkflowStructure,
  verifyWorkflowCode,
  getTestAuthHeaders,
  waitForCondition,
};
