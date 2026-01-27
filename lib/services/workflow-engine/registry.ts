/**
 * Workflow Registry
 *
 * Central registry for all available workflows. Handles workflow
 * discovery, execution, and management. Maps n8n workflows to
 * elizaOS-compatible actions.
 */

import { logger } from "@/lib/utils/logger";
import { n8nClient, type N8nExecutionResult } from "./n8n-client";
import {
  credentialValidator,
  type ValidationResult,
  WORKFLOW_CREDENTIALS,
} from "./credential-validator";

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  n8nWorkflowId?: string;
  webhookPath?: string;
  requiredInputs: WorkflowInput[];
  status: "stable" | "experimental" | "deprecated";
  createdBy: "system" | "ai_generated" | string;
  usageCount: number;
  successRate: number;
}

export interface WorkflowInput {
  name: string;
  type: "string" | "number" | "boolean" | "email" | "phone";
  description: string;
  required: boolean;
  default?: string | number | boolean;
}

export type WorkflowCategory =
  | "email"
  | "calendar"
  | "contacts"
  | "messaging"
  | "notes"
  | "tasks"
  | "custom";

export interface WorkflowExecutionRequest {
  organizationId: string;
  workflowId: string;
  inputs: Record<string, unknown>;
  userId?: string;
}

export interface WorkflowExecutionResponse {
  success: boolean;
  executionId?: string;
  result?: Record<string, unknown>;
  error?: string;
  credentialsRequired?: ValidationResult;
}

/**
 * Pre-built workflow templates
 */
const SYSTEM_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: "check_email",
    name: "Check Email",
    description: "Read and summarize recent emails from Gmail",
    category: "email",
    requiredInputs: [
      {
        name: "maxResults",
        type: "number",
        description: "Maximum number of emails to check",
        required: false,
        default: 10,
      },
      {
        name: "query",
        type: "string",
        description: "Optional search query (e.g., 'from:boss@example.com')",
        required: false,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
  {
    id: "send_email",
    name: "Send Email",
    description: "Send an email via Gmail",
    category: "email",
    requiredInputs: [
      {
        name: "to",
        type: "email",
        description: "Recipient email address",
        required: true,
      },
      {
        name: "subject",
        type: "string",
        description: "Email subject",
        required: true,
      },
      {
        name: "body",
        type: "string",
        description: "Email body content",
        required: true,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
  {
    id: "list_calendar",
    name: "List Calendar Events",
    description: "Get upcoming events from Google Calendar",
    category: "calendar",
    requiredInputs: [
      {
        name: "maxResults",
        type: "number",
        description: "Maximum number of events to return",
        required: false,
        default: 10,
      },
      {
        name: "timeMin",
        type: "string",
        description: "Start time (ISO format, defaults to now)",
        required: false,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
  {
    id: "create_calendar_event",
    name: "Create Calendar Event",
    description: "Create a new event in Google Calendar",
    category: "calendar",
    requiredInputs: [
      {
        name: "summary",
        type: "string",
        description: "Event title",
        required: true,
      },
      {
        name: "startTime",
        type: "string",
        description: "Start time (ISO format)",
        required: true,
      },
      {
        name: "endTime",
        type: "string",
        description: "End time (ISO format)",
        required: true,
      },
      {
        name: "description",
        type: "string",
        description: "Event description",
        required: false,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
  {
    id: "lookup_contact",
    name: "Lookup Contact",
    description: "Find a contact by name in Google Contacts",
    category: "contacts",
    requiredInputs: [
      {
        name: "query",
        type: "string",
        description: "Name or email to search for",
        required: true,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
  {
    id: "text_contact",
    name: "Text Contact",
    description: "Send a text message to a contact by name",
    category: "messaging",
    requiredInputs: [
      {
        name: "contactName",
        type: "string",
        description: "Name of the contact to text",
        required: true,
      },
      {
        name: "message",
        type: "string",
        description: "Message to send",
        required: true,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
  {
    id: "send_sms",
    name: "Send SMS",
    description: "Send an SMS message via Twilio",
    category: "messaging",
    requiredInputs: [
      {
        name: "to",
        type: "phone",
        description: "Phone number to send to (E.164 format)",
        required: true,
      },
      {
        name: "message",
        type: "string",
        description: "Message to send",
        required: true,
      },
    ],
    status: "stable",
    createdBy: "system",
    usageCount: 0,
    successRate: 0,
  },
];

class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  constructor() {
    // Initialize with system workflows
    for (const workflow of SYSTEM_WORKFLOWS) {
      this.workflows.set(workflow.id, workflow);
    }
  }

  /**
   * Get all available workflows
   */
  getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflows by category
   */
  getByCategory(category: WorkflowCategory): WorkflowDefinition[] {
    return this.getAll().filter((w) => w.category === category);
  }

  /**
   * Get a specific workflow by ID
   */
  get(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Find workflows by search query
   */
  search(query: string): WorkflowDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      (w) =>
        w.name.toLowerCase().includes(lowerQuery) ||
        w.description.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Register a new workflow
   */
  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
    logger.info("[WorkflowRegistry] Workflow registered", {
      workflowId: workflow.id,
      name: workflow.name,
    });
  }

  /**
   * Execute a workflow
   */
  async execute(
    request: WorkflowExecutionRequest,
  ): Promise<WorkflowExecutionResponse> {
    const workflow = this.workflows.get(request.workflowId);

    if (!workflow) {
      return {
        success: false,
        error: `Unknown workflow: ${request.workflowId}`,
      };
    }

    logger.info("[WorkflowRegistry] Executing workflow", {
      workflowId: request.workflowId,
      organizationId: request.organizationId,
    });

    // Validate credentials first
    const validation = await credentialValidator.validateForWorkflow(
      request.organizationId,
      request.workflowId,
    );

    if (!validation.valid) {
      logger.info("[WorkflowRegistry] Missing credentials", {
        workflowId: request.workflowId,
        missing: validation.missing.map((m) => m.provider),
      });

      return {
        success: false,
        error: credentialValidator.formatMissingCredentialsMessage(
          validation.missing,
        ),
        credentialsRequired: validation,
      };
    }

    // Validate required inputs
    for (const input of workflow.requiredInputs) {
      if (input.required && request.inputs[input.name] === undefined) {
        return {
          success: false,
          error: `Missing required input: ${input.name} (${input.description})`,
        };
      }
    }

    // Execute via n8n if configured
    if (workflow.n8nWorkflowId && n8nClient.isConfigured()) {
      const result = await n8nClient.executeWorkflow(
        workflow.n8nWorkflowId,
        request.inputs,
      );

      this.updateUsageStats(request.workflowId, result.success);

      return {
        success: result.success,
        executionId: result.executionId,
        result: result.data,
        error: result.error,
      };
    }

    // Execute via webhook if configured
    if (workflow.webhookPath) {
      const result = await n8nClient.executeViaWebhook(
        workflow.webhookPath,
        request.inputs,
      );

      this.updateUsageStats(request.workflowId, result.success);

      return {
        success: result.success,
        executionId: result.executionId,
        result: result.data,
        error: result.error,
      };
    }

    // No execution method configured - return placeholder
    logger.warn("[WorkflowRegistry] No execution method configured", {
      workflowId: request.workflowId,
    });

    return {
      success: false,
      error: `Workflow ${request.workflowId} is not connected to n8n yet. Please configure the n8n workflow ID.`,
    };
  }

  /**
   * Update usage statistics for a workflow
   */
  private updateUsageStats(workflowId: string, success: boolean): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const newCount = workflow.usageCount + 1;
    const currentSuccesses = workflow.successRate * workflow.usageCount;
    const newSuccessRate = (currentSuccesses + (success ? 1 : 0)) / newCount;

    this.workflows.set(workflowId, {
      ...workflow,
      usageCount: newCount,
      successRate: newSuccessRate,
    });
  }

  /**
   * Get required credentials for a workflow
   */
  getRequiredCredentials(
    workflowId: string,
  ): ReturnType<typeof WORKFLOW_CREDENTIALS extends Record<string, infer V> ? () => V : never> | undefined {
    return WORKFLOW_CREDENTIALS[workflowId];
  }

  /**
   * Sync workflows from n8n
   */
  async syncFromN8n(): Promise<void> {
    if (!n8nClient.isConfigured()) {
      logger.warn("[WorkflowRegistry] n8n not configured, skipping sync");
      return;
    }

    try {
      const n8nWorkflows = await n8nClient.getWorkflows();

      for (const n8nWorkflow of n8nWorkflows) {
        // Check if we already have this workflow registered
        const existing = Array.from(this.workflows.values()).find(
          (w) => w.n8nWorkflowId === n8nWorkflow.id,
        );

        if (!existing) {
          // Register new workflow from n8n
          this.register({
            id: `n8n_${n8nWorkflow.id}`,
            name: n8nWorkflow.name,
            description: `n8n workflow: ${n8nWorkflow.name}`,
            category: "custom",
            n8nWorkflowId: n8nWorkflow.id,
            requiredInputs: [],
            status: "experimental",
            createdBy: "system",
            usageCount: 0,
            successRate: 0,
          });
        }
      }

      logger.info("[WorkflowRegistry] Synced workflows from n8n", {
        count: n8nWorkflows.length,
      });
    } catch (error) {
      logger.error("[WorkflowRegistry] Failed to sync from n8n", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const workflowRegistry = new WorkflowRegistry();
