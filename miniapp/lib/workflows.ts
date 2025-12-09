/**
 * Miniapp N8N Workflows Client
 *
 * Client SDK for interacting with n8n workflows from miniapps.
 * Uses the proxy layer to communicate with the Cloud API.
 *
 * Usage:
 * ```typescript
 * import { listWorkflows, createWorkflow, executeWorkflow } from '@/lib/workflows';
 *
 * // List workflows
 * const workflows = await listWorkflows();
 *
 * // Create a workflow
 * const workflow = await createWorkflow({
 *   name: 'My Workflow',
 *   workflowData: { nodes: [], connections: {} },
 * });
 *
 * // Execute a workflow
 * const result = await executeWorkflow(workflow.id, { input: 'data' });
 * ```
 */

import { getAuthToken } from "./use-auth";

const API_BASE = "/api/proxy/n8n/workflows";

// =============================================================================
// TYPES
// =============================================================================

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  workflowData?: Record<string, unknown>;
  status: "draft" | "active" | "archived";
  version: number;
  tags: string[];
  n8nWorkflowId?: string;
  isActiveInN8n: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowParams {
  name: string;
  description?: string;
  workflowData: Record<string, unknown>;
  tags?: string[];
}

export interface UpdateWorkflowParams {
  name?: string;
  description?: string;
  workflowData?: Record<string, unknown>;
  status?: "draft" | "active" | "archived";
  tags?: string[];
}

export interface ExecutionResult {
  id: string;
  status: "running" | "success" | "error" | "canceled";
  outputData?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  startedAt: string;
  finishedAt?: string;
}

export interface ExecuteWorkflowParams {
  inputData?: Record<string, unknown>;
}

// =============================================================================
// API HELPERS
// =============================================================================

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

// =============================================================================
// WORKFLOW OPERATIONS
// =============================================================================

/**
 * Lists all workflows for the current app.
 */
export async function listWorkflows(params?: {
  status?: "draft" | "active" | "archived";
  limit?: number;
  offset?: number;
}): Promise<Workflow[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  const path = query ? `?${query}` : "";

  const response = await fetchApi<{ success: boolean; workflows: Workflow[] }>(path);
  return response.workflows;
}

/**
 * Gets a workflow by ID.
 */
export async function getWorkflow(id: string): Promise<Workflow> {
  const response = await fetchApi<{ success: boolean; workflow: Workflow }>(`/${id}`);
  return response.workflow;
}

/**
 * Creates a new workflow.
 */
export async function createWorkflow(params: CreateWorkflowParams): Promise<Workflow> {
  const response = await fetchApi<{ success: boolean; workflow: Workflow }>("", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.workflow;
}

/**
 * Updates a workflow.
 */
export async function updateWorkflow(
  id: string,
  params: UpdateWorkflowParams
): Promise<Workflow> {
  const response = await fetchApi<{ success: boolean; workflow: Workflow }>(`/${id}`, {
    method: "PUT",
    body: JSON.stringify(params),
  });
  return response.workflow;
}

/**
 * Deletes a workflow.
 */
export async function deleteWorkflow(id: string): Promise<void> {
  await fetchApi<{ success: boolean }>(`/${id}`, {
    method: "DELETE",
  });
}

/**
 * Executes a workflow.
 */
export async function executeWorkflow(
  id: string,
  params: ExecuteWorkflowParams = {}
): Promise<ExecutionResult> {
  const response = await fetchApi<{ success: boolean; execution: ExecutionResult }>(
    `/${id}/execute`,
    {
      method: "POST",
      body: JSON.stringify(params),
    }
  );
  return response.execution;
}

/**
 * Tests a workflow execution.
 */
export async function testWorkflow(
  id: string,
  params: ExecuteWorkflowParams = {}
): Promise<ExecutionResult> {
  const response = await fetchApi<{ success: boolean; execution: ExecutionResult }>(
    `/${id}/test`,
    {
      method: "POST",
      body: JSON.stringify(params),
    }
  );
  return response.execution;
}

/**
 * Deploys a workflow to an n8n instance.
 */
export async function deployWorkflow(
  id: string,
  instanceId: string
): Promise<{ n8nWorkflowId: string }> {
  const response = await fetchApi<{ success: boolean; n8nWorkflowId: string }>(
    `/${id}/deploy`,
    {
      method: "POST",
      body: JSON.stringify({ instanceId }),
    }
  );
  return { n8nWorkflowId: response.n8nWorkflowId };
}

// =============================================================================
// TYPED WORKFLOW HELPER
// =============================================================================

/**
 * Creates a typed workflow interface for type-safe operations.
 *
 * Usage:
 * ```typescript
 * const myWorkflow = workflow('workflow-id');
 *
 * const result = await myWorkflow.execute({ input: 'data' });
 * const updated = await myWorkflow.update({ name: 'New Name' });
 * ```
 */
export function workflow(id: string) {
  return {
    id,

    async get(): Promise<Workflow> {
      return getWorkflow(id);
    },

    async update(params: UpdateWorkflowParams): Promise<Workflow> {
      return updateWorkflow(id, params);
    },

    async delete(): Promise<void> {
      return deleteWorkflow(id);
    },

    async execute(params: ExecuteWorkflowParams = {}): Promise<ExecutionResult> {
      return executeWorkflow(id, params);
    },

    async test(params: ExecuteWorkflowParams = {}): Promise<ExecutionResult> {
      return testWorkflow(id, params);
    },

    async deploy(instanceId: string): Promise<{ n8nWorkflowId: string }> {
      return deployWorkflow(id, instanceId);
    },
  };
}

