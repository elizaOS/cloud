/**
 * n8n API Client
 *
 * Handles communication with the n8n workflow automation platform.
 * Used to execute workflows, manage workflow definitions, and handle
 * execution results.
 */

import { logger } from "@/lib/utils/logger";

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY;

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  status: "running" | "success" | "error" | "waiting";
  data?: {
    resultData?: {
      runData?: Record<string, unknown[]>;
      lastNodeExecuted?: string;
    };
  };
}

export interface N8nExecutionResult {
  success: boolean;
  executionId: string;
  status: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface N8nWebhookPayload {
  workflowId: string;
  data: Record<string, unknown>;
}

class N8nClient {
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor() {
    this.baseUrl = N8N_API_URL;
    this.apiKey = N8N_API_KEY;
  }

  /**
   * Check if n8n is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Make an authenticated request to n8n API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error("n8n API key not configured");
    }

    const url = `${this.baseUrl}/api/v1${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "X-N8N-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`n8n API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Get all workflows
   */
  async getWorkflows(): Promise<N8nWorkflow[]> {
    const response = await this.request<{ data: N8nWorkflow[] }>("/workflows");
    return response.data;
  }

  /**
   * Get a specific workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(`/workflows/${workflowId}`);
  }

  /**
   * Execute a workflow by ID
   */
  async executeWorkflow(
    workflowId: string,
    data?: Record<string, unknown>,
  ): Promise<N8nExecutionResult> {
    logger.info("[n8nClient] Executing workflow", { workflowId, hasData: !!data });

    try {
      const execution = await this.request<N8nExecution>(
        `/workflows/${workflowId}/execute`,
        {
          method: "POST",
          body: JSON.stringify({ data }),
        },
      );

      logger.info("[n8nClient] Workflow execution started", {
        workflowId,
        executionId: execution.id,
        status: execution.status,
      });

      return {
        success: execution.status === "success",
        executionId: execution.id,
        status: execution.status,
        data: execution.data?.resultData?.runData,
      };
    } catch (error) {
      logger.error("[n8nClient] Workflow execution failed", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        executionId: "",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a workflow via webhook trigger
   */
  async executeViaWebhook(
    webhookPath: string,
    data: Record<string, unknown>,
  ): Promise<N8nExecutionResult> {
    logger.info("[n8nClient] Executing via webhook", { webhookPath });

    try {
      const url = `${this.baseUrl}/webhook/${webhookPath}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Webhook execution failed: ${response.status}`);
      }

      const result = await response.json();

      return {
        success: true,
        executionId: result.executionId || "webhook",
        status: "success",
        data: result,
      };
    } catch (error) {
      logger.error("[n8nClient] Webhook execution failed", {
        webhookPath,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        executionId: "",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get execution status
   */
  async getExecution(executionId: string): Promise<N8nExecution> {
    return this.request<N8nExecution>(`/executions/${executionId}`);
  }

  /**
   * Wait for execution to complete (polling)
   */
  async waitForExecution(
    executionId: string,
    maxWaitMs = 30000,
    pollIntervalMs = 1000,
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const execution = await this.getExecution(executionId);

      if (execution.finished || execution.status !== "running") {
        return execution;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Execution timeout after ${maxWaitMs}ms`);
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(workflow: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    });
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(
    workflowId: string,
    workflow: Partial<N8nWorkflow>,
  ): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(`/workflows/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify(workflow),
    });
  }

  /**
   * Activate a workflow
   */
  async activateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(`/workflows/${workflowId}/activate`, {
      method: "POST",
    });
  }

  /**
   * Deactivate a workflow
   */
  async deactivateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(`/workflows/${workflowId}/deactivate`, {
      method: "POST",
    });
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.request(`/workflows/${workflowId}`, {
      method: "DELETE",
    });
  }

  /**
   * Test connection to n8n
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!this.apiKey) {
      return { connected: false, error: "API key not configured" };
    }

    try {
      await this.request("/workflows?limit=1");
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const n8nClient = new N8nClient();
