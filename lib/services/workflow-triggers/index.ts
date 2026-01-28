/**
 * Workflow Triggers Service
 *
 * Handles automatic workflow execution based on incoming messages,
 * schedules, or external webhooks. Provides trigger matching logic
 * and execution coordination.
 */

import { logger } from "@/lib/utils/logger";
import { workflowTriggersRepository } from "@/db/repositories/workflow-triggers";
import { generatedWorkflowsRepository } from "@/db/repositories/generated-workflows";
import { workflowExecutorService } from "@/lib/services/workflow-executor";
import type {
  WorkflowTrigger,
  NewWorkflowTrigger,
  TriggerConfig,
  ResponseConfig,
} from "@/db/schemas/workflow-triggers";

/**
 * Incoming message structure for trigger matching
 */
export interface IncomingMessageContext {
  from: string;
  to: string;
  body: string;
  provider: "twilio" | "blooio" | "telegram";
  providerMessageId?: string;
  mediaUrls?: string[];
  messageType?: "sms" | "mms" | "voice" | "imessage" | "telegram";
  metadata?: Record<string, unknown>;
}

/**
 * Trigger match result
 */
export interface TriggerMatchResult {
  trigger: WorkflowTrigger;
  matchedOn: string;
  matchedValue?: string;
}

/**
 * Trigger execution result
 */
export interface TriggerExecutionResult {
  success: boolean;
  workflowId: string;
  triggerId: string;
  executionId?: string;
  output?: Record<string, unknown>;
  response?: string;
  error?: string;
  executionTimeMs: number;
}

/**
 * Create trigger parameters
 */
export interface CreateTriggerParams {
  organizationId: string;
  workflowId: string;
  userId: string;
  name: string;
  description?: string;
  triggerType: WorkflowTrigger["trigger_type"];
  triggerConfig: TriggerConfig;
  responseConfig?: ResponseConfig;
  providerFilter?: WorkflowTrigger["provider_filter"];
  priority?: number;
  isActive?: boolean;
}

/**
 * Update trigger parameters
 */
export interface UpdateTriggerParams {
  name?: string;
  description?: string;
  triggerConfig?: TriggerConfig;
  responseConfig?: ResponseConfig;
  providerFilter?: WorkflowTrigger["provider_filter"];
  priority?: number;
  isActive?: boolean;
}

class WorkflowTriggerService {
  /**
   * Create a new trigger
   */
  async createTrigger(params: CreateTriggerParams): Promise<WorkflowTrigger> {
    logger.info("[WorkflowTriggers] Creating trigger", {
      workflowId: params.workflowId,
      name: params.name,
      triggerType: params.triggerType,
    });

    // Validate the workflow exists and is executable
    const workflow = await generatedWorkflowsRepository.getById(params.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    if (workflow.status === "draft" || workflow.status === "deprecated") {
      throw new Error(`Cannot create trigger for workflow with status: ${workflow.status}`);
    }

    // Validate trigger config based on type
    this.validateTriggerConfig(params.triggerType, params.triggerConfig);

    // Check for duplicate name
    const nameExists = await workflowTriggersRepository.nameExists(
      params.workflowId,
      params.name,
    );
    if (nameExists) {
      throw new Error(`Trigger with name "${params.name}" already exists for this workflow`);
    }

    const newTrigger: NewWorkflowTrigger = {
      organization_id: params.organizationId,
      workflow_id: params.workflowId,
      created_by_user_id: params.userId,
      name: params.name,
      description: params.description,
      trigger_type: params.triggerType,
      trigger_config: params.triggerConfig,
      response_config: params.responseConfig || { sendResponse: true },
      provider_filter: params.providerFilter || "all",
      priority: params.priority || 0,
      is_active: params.isActive ?? true,
    };

    const trigger = await workflowTriggersRepository.create(newTrigger);

    logger.info("[WorkflowTriggers] Trigger created", {
      triggerId: trigger.id,
      workflowId: params.workflowId,
    });

    return trigger;
  }

  /**
   * Update an existing trigger
   */
  async updateTrigger(
    triggerId: string,
    params: UpdateTriggerParams,
  ): Promise<WorkflowTrigger | null> {
    logger.info("[WorkflowTriggers] Updating trigger", { triggerId });

    const existing = await workflowTriggersRepository.getById(triggerId);
    if (!existing) {
      return null;
    }

    // Validate trigger config if provided
    if (params.triggerConfig) {
      this.validateTriggerConfig(existing.trigger_type, params.triggerConfig);
    }

    // Check for duplicate name if name is being changed
    if (params.name && params.name !== existing.name) {
      const nameExists = await workflowTriggersRepository.nameExists(
        existing.workflow_id,
        params.name,
        triggerId,
      );
      if (nameExists) {
        throw new Error(`Trigger with name "${params.name}" already exists for this workflow`);
      }
    }

    // Convert camelCase params to snake_case for database
    const dbUpdates: Record<string, unknown> = {};
    if (params.name !== undefined) dbUpdates.name = params.name;
    if (params.description !== undefined) dbUpdates.description = params.description;
    if (params.triggerConfig !== undefined) dbUpdates.trigger_config = params.triggerConfig;
    if (params.responseConfig !== undefined) dbUpdates.response_config = params.responseConfig;
    if (params.providerFilter !== undefined) dbUpdates.provider_filter = params.providerFilter;
    if (params.priority !== undefined) dbUpdates.priority = params.priority;
    if (params.isActive !== undefined) dbUpdates.is_active = params.isActive;

    return workflowTriggersRepository.update(triggerId, dbUpdates);
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(triggerId: string): Promise<void> {
    logger.info("[WorkflowTriggers] Deleting trigger", { triggerId });
    await workflowTriggersRepository.delete(triggerId);
  }

  /**
   * Get a trigger by ID
   */
  async getTrigger(triggerId: string): Promise<WorkflowTrigger | null> {
    return workflowTriggersRepository.getById(triggerId);
  }

  /**
   * List triggers for a workflow
   */
  async getWorkflowTriggers(
    workflowId: string,
    options?: { isActive?: boolean },
  ): Promise<WorkflowTrigger[]> {
    return workflowTriggersRepository.listByWorkflow(workflowId, options);
  }

  /**
   * List triggers for an organization
   */
  async getOrgTriggers(
    organizationId: string,
    options?: {
      isActive?: boolean;
      triggerType?: WorkflowTrigger["trigger_type"];
    },
  ): Promise<WorkflowTrigger[]> {
    return workflowTriggersRepository.listByOrganization(organizationId, options);
  }

  /**
   * Toggle trigger active status
   */
  async toggleTrigger(triggerId: string): Promise<WorkflowTrigger | null> {
    return workflowTriggersRepository.toggleActive(triggerId);
  }

  /**
   * Match incoming message against active triggers
   * Returns the first matching trigger (highest priority)
   */
  async matchTriggers(
    message: IncomingMessageContext,
    organizationId: string,
  ): Promise<TriggerMatchResult | null> {
    logger.info("[WorkflowTriggers] Matching triggers", {
      organizationId,
      provider: message.provider,
      from: message.from,
      bodyLength: message.body?.length || 0,
    });

    // Get active triggers for this org, filtered by provider
    const triggers = await workflowTriggersRepository.getActiveTriggersByOrg(
      organizationId,
      message.provider,
    );

    if (triggers.length === 0) {
      logger.info("[WorkflowTriggers] No active triggers found");
      return null;
    }

    logger.info("[WorkflowTriggers] Checking triggers", {
      count: triggers.length,
    });

    // Check each trigger in priority order
    for (const trigger of triggers) {
      const match = this.checkTriggerMatch(trigger, message);
      if (match) {
        logger.info("[WorkflowTriggers] Trigger matched", {
          triggerId: trigger.id,
          triggerName: trigger.name,
          matchedOn: match.matchedOn,
          matchedValue: match.matchedValue,
        });
        return match;
      }
    }

    logger.info("[WorkflowTriggers] No trigger matched");
    return null;
  }

  /**
   * Check if a single trigger matches the message
   */
  private checkTriggerMatch(
    trigger: WorkflowTrigger,
    message: IncomingMessageContext,
  ): TriggerMatchResult | null {
    const config = trigger.trigger_config;
    const messageBody = config.caseSensitive
      ? message.body
      : message.body.toLowerCase();

    switch (trigger.trigger_type) {
      case "message_keyword": {
        // Check for exact keyword match (word boundary)
        const keywords = config.keywords || [];
        for (const keyword of keywords) {
          const keywordToMatch = config.caseSensitive
            ? keyword
            : keyword.toLowerCase();
          
          // Create word boundary regex
          const regex = new RegExp(`\\b${this.escapeRegex(keywordToMatch)}\\b`, "i");
          if (regex.test(messageBody)) {
            return {
              trigger,
              matchedOn: "keyword",
              matchedValue: keyword,
            };
          }
        }
        break;
      }

      case "message_contains": {
        // Check for substring match
        const contains = config.contains || "";
        const containsToMatch = config.caseSensitive
          ? contains
          : contains.toLowerCase();
        
        if (messageBody.includes(containsToMatch)) {
          return {
            trigger,
            matchedOn: "contains",
            matchedValue: contains,
          };
        }
        break;
      }

      case "message_from": {
        // Check if sender is in allowed list
        const phoneNumbers = config.phoneNumbers || [];
        const normalizedFrom = this.normalizePhoneNumber(message.from);
        
        for (const phone of phoneNumbers) {
          if (this.normalizePhoneNumber(phone) === normalizedFrom) {
            return {
              trigger,
              matchedOn: "sender",
              matchedValue: message.from,
            };
          }
        }
        break;
      }

      case "message_regex": {
        // Check regex pattern match
        const pattern = config.pattern;
        if (pattern) {
          try {
            const flags = config.caseSensitive ? "" : "i";
            const regex = new RegExp(pattern, flags);
            const match = message.body.match(regex);
            if (match) {
              return {
                trigger,
                matchedOn: "regex",
                matchedValue: match[0],
              };
            }
          } catch (error) {
            logger.warn("[WorkflowTriggers] Invalid regex pattern", {
              triggerId: trigger.id,
              pattern,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
        break;
      }

      // Schedule and webhook triggers don't match on messages
      case "schedule":
      case "webhook":
        break;
    }

    return null;
  }

  /**
   * Execute a triggered workflow
   */
  async executeTrigger(
    matchResult: TriggerMatchResult,
    message: IncomingMessageContext,
  ): Promise<TriggerExecutionResult> {
    const startTime = Date.now();
    const { trigger } = matchResult;

    logger.info("[WorkflowTriggers] Executing trigger", {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id,
      matchedOn: matchResult.matchedOn,
    });

    try {
      // Get the workflow
      const workflow = await generatedWorkflowsRepository.getById(trigger.workflow_id);
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      // Build execution context with message data
      const executionParams = {
        // Message context
        message: {
          from: message.from,
          to: message.to,
          body: message.body,
          provider: message.provider,
          mediaUrls: message.mediaUrls,
        },
        // Trigger context
        trigger: {
          id: trigger.id,
          name: trigger.name,
          matchedOn: matchResult.matchedOn,
          matchedValue: matchResult.matchedValue,
        },
        // Execution plan from workflow
        executionPlan: workflow.execution_plan,
        // Any additional params can be extracted from message
        ...this.extractParamsFromMessage(message),
      };

      // Execute the workflow
      const result = await workflowExecutorService.execute({
        organizationId: trigger.organization_id,
        workflowId: trigger.workflow_id,
        input: executionParams,
      });

      const executionTimeMs = Date.now() - startTime;

      // Record the execution
      await workflowTriggersRepository.recordExecution(
        trigger.id,
        result.success,
        result.error,
      );

      // Update workflow stats
      await generatedWorkflowsRepository.incrementUsage(
        trigger.workflow_id,
        result.success,
        result.executionTimeMs,
      );

      // Build response if configured
      let response: string | undefined;
      if (trigger.response_config.sendResponse && result.success) {
        response = this.buildResponse(trigger.response_config, result.output || {});
      }

      logger.info("[WorkflowTriggers] Trigger execution complete", {
        triggerId: trigger.id,
        workflowId: trigger.workflow_id,
        success: result.success,
        executionTimeMs,
        hasResponse: !!response,
      });

      return {
        success: result.success,
        workflowId: trigger.workflow_id,
        triggerId: trigger.id,
        output: result.output,
        response,
        error: result.error,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      logger.error("[WorkflowTriggers] Trigger execution failed", {
        triggerId: trigger.id,
        workflowId: trigger.workflow_id,
        error: errorMessage,
      });

      // Record the failure
      await workflowTriggersRepository.recordExecution(trigger.id, false, errorMessage);

      return {
        success: false,
        workflowId: trigger.workflow_id,
        triggerId: trigger.id,
        error: errorMessage,
        executionTimeMs,
      };
    }
  }

  /**
   * Execute a trigger by webhook (for external triggers)
   */
  async executeWebhookTrigger(
    triggerId: string,
    payload: Record<string, unknown>,
    secret?: string,
  ): Promise<TriggerExecutionResult> {
    const startTime = Date.now();

    const trigger = await workflowTriggersRepository.getById(triggerId);
    if (!trigger) {
      throw new Error("Trigger not found");
    }

    if (!trigger.is_active) {
      throw new Error("Trigger is not active");
    }

    if (trigger.trigger_type !== "webhook") {
      throw new Error("Trigger is not a webhook trigger");
    }

    // Validate webhook secret if configured
    const config = trigger.trigger_config;
    if (config.webhookSecret && config.webhookSecret !== secret) {
      throw new Error("Invalid webhook secret");
    }

    logger.info("[WorkflowTriggers] Executing webhook trigger", {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id,
    });

    try {
      const workflow = await generatedWorkflowsRepository.getById(trigger.workflow_id);
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      const executionParams = {
        ...payload,
        executionPlan: workflow.execution_plan,
        trigger: {
          id: trigger.id,
          name: trigger.name,
          type: "webhook",
        },
      };

      const result = await workflowExecutorService.execute({
        organizationId: trigger.organization_id,
        workflowId: trigger.workflow_id,
        input: executionParams,
      });

      const executionTimeMs = Date.now() - startTime;

      await workflowTriggersRepository.recordExecution(
        trigger.id,
        result.success,
        result.error,
      );

      await generatedWorkflowsRepository.incrementUsage(
        trigger.workflow_id,
        result.success,
        result.executionTimeMs,
      );

      return {
        success: result.success,
        workflowId: trigger.workflow_id,
        triggerId: trigger.id,
        output: result.output,
        error: result.error,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await workflowTriggersRepository.recordExecution(trigger.id, false, errorMessage);

      return {
        success: false,
        workflowId: trigger.workflow_id,
        triggerId: trigger.id,
        error: errorMessage,
        executionTimeMs,
      };
    }
  }

  /**
   * Validate trigger configuration based on type
   */
  private validateTriggerConfig(
    triggerType: WorkflowTrigger["trigger_type"],
    config: TriggerConfig,
  ): void {
    switch (triggerType) {
      case "message_keyword":
        if (!config.keywords || config.keywords.length === 0) {
          throw new Error("Keyword trigger requires at least one keyword");
        }
        break;

      case "message_contains":
        if (!config.contains || config.contains.trim() === "") {
          throw new Error("Contains trigger requires a non-empty substring");
        }
        break;

      case "message_from":
        if (!config.phoneNumbers || config.phoneNumbers.length === 0) {
          throw new Error("From trigger requires at least one phone number");
        }
        break;

      case "message_regex":
        if (!config.pattern) {
          throw new Error("Regex trigger requires a pattern");
        }
        // Validate the regex is valid
        try {
          new RegExp(config.pattern);
        } catch {
          throw new Error("Invalid regex pattern");
        }
        break;

      case "schedule":
        if (!config.schedule) {
          throw new Error("Schedule trigger requires a cron expression");
        }
        // Basic cron validation (5 or 6 parts)
        const parts = config.schedule.split(" ");
        if (parts.length < 5 || parts.length > 6) {
          throw new Error("Invalid cron expression format");
        }
        break;

      case "webhook":
        // Webhook triggers don't require specific config
        break;
    }
  }

  /**
   * Build response message from template
   */
  private buildResponse(
    responseConfig: ResponseConfig,
    output: Record<string, unknown>,
  ): string {
    if (responseConfig.responseTemplate) {
      // Replace placeholders in template
      let response = responseConfig.responseTemplate;
      for (const [key, value] of Object.entries(output)) {
        response = response.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          String(value),
        );
      }
      return response;
    }

    // If a specific field is specified, use that
    if (responseConfig.responseField && output[responseConfig.responseField]) {
      return String(output[responseConfig.responseField]);
    }

    // Default: stringify the output
    if (typeof output.message === "string") {
      return output.message;
    }

    return "Workflow executed successfully.";
  }

  /**
   * Extract parameters from message body
   * Looks for common patterns like email, phone, dates
   */
  private extractParamsFromMessage(
    message: IncomingMessageContext,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    const body = message.body;

    // Extract email addresses
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/gi;
    const emails = body.match(emailRegex);
    if (emails && emails.length > 0) {
      params.email = emails[0];
      params.emails = emails;
    }

    // Extract phone numbers (various formats)
    const phoneRegex = /\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
    const phones = body.match(phoneRegex);
    if (phones && phones.length > 0) {
      params.phoneNumber = phones[0];
      params.phoneNumbers = phones;
    }

    // Extract dates (basic patterns)
    const datePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,  // MM/DD/YYYY
      /\b\d{4}-\d{2}-\d{2}\b/g,          // YYYY-MM-DD
      /\b(?:today|tomorrow|yesterday)\b/gi,
    ];
    for (const pattern of datePatterns) {
      const dates = body.match(pattern);
      if (dates && dates.length > 0) {
        params.date = dates[0];
        break;
      }
    }

    // Extract times
    const timeRegex = /\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b/gi;
    const times = body.match(timeRegex);
    if (times && times.length > 0) {
      params.time = times[0];
    }

    return params;
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, "");

    // Ensure it starts with +
    if (!normalized.startsWith("+")) {
      if (normalized.length === 10) {
        normalized = `+1${normalized}`;
      } else if (normalized.length === 11 && normalized.startsWith("1")) {
        normalized = `+${normalized}`;
      }
    }

    return normalized;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get organization trigger statistics
   */
  async getOrgStats(organizationId: string) {
    return workflowTriggersRepository.getOrgStats(organizationId);
  }
}

export const workflowTriggerService = new WorkflowTriggerService();
