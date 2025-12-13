/**
 * Application Triggers Service
 * 
 * Manages triggers for all deployable components:
 * - Fragment Projects (Apps)
 * - Containers (Agents)
 * - User MCPs
 */

import { db } from "@/db";
import {
  applicationTriggers,
  applicationTriggerExecutions,
  type ApplicationTrigger,
  type NewApplicationTrigger,
  type ApplicationTriggerExecution,
  type ApplicationTriggerConfig,
} from "@/db/schemas/application-triggers";
import { fragmentProjects } from "@/db/schemas/fragment-projects";
import { containers } from "@/db/schemas/containers";
import { userMcps } from "@/db/schemas/user-mcps";
import { codeAgentSessions } from "@/db/schemas/code-agent-sessions";
import { organizations } from "@/db/schemas/organizations";
import { eq, and, sql, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "@/lib/utils/logger";
import { safeJsonParse } from "@/lib/utils/json-parsing";
import { generateWebhookSecret } from "@/lib/utils/webhook-signature";

// =============================================================================
// TYPES
// =============================================================================

type TargetType = "fragment_project" | "container" | "user_mcp" | "code_agent_session";
type TriggerType = "cron" | "webhook" | "event";

interface CreateTriggerParams {
  organizationId: string;
  createdBy: string;
  targetType: TargetType;
  targetId: string;
  triggerType: TriggerType;
  name: string;
  description?: string;
  config?: Partial<ApplicationTriggerConfig>;
  actionType?: string;
  actionConfig?: Record<string, unknown>;
}

interface ExecuteTriggerResult {
  executionId: string;
  status: string;
  output?: Record<string, unknown>;
  error?: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class ApplicationTriggersService {
  // ===========================================================================
  // CREATE TRIGGER
  // ===========================================================================

  async createTrigger(params: CreateTriggerParams): Promise<ApplicationTrigger> {
    const {
      organizationId,
      createdBy,
      targetType,
      targetId,
      triggerType,
      name,
      description,
      config = {},
      actionType = "call_endpoint",
      actionConfig = {},
    } = params;

    // Verify target exists and belongs to organization
    await this.verifyTarget(targetType, targetId, organizationId);

    // Generate unique trigger key
    const triggerKey = randomBytes(32).toString("hex");

    // Build final config
    const finalConfig: ApplicationTriggerConfig = { ...config };

    // For webhooks, generate secret
    if (triggerType === "webhook") {
      finalConfig.webhookSecret = generateWebhookSecret();
      finalConfig.requireSignature = config.requireSignature ?? true;
      finalConfig.maxExecutionsPerDay = config.maxExecutionsPerDay ?? 10000;
    }

    // For cron, validate expression
    if (triggerType === "cron" && !config.cronExpression) {
      throw new Error("cronExpression is required for cron triggers");
    }

    // For events, validate event types
    if (triggerType === "event" && (!config.eventTypes || config.eventTypes.length === 0)) {
      throw new Error("eventTypes is required for event triggers");
    }

    const [trigger] = await db
      .insert(applicationTriggers)
      .values({
        organization_id: organizationId,
        created_by: createdBy,
        target_type: targetType,
        target_id: targetId,
        trigger_type: triggerType,
        trigger_key: triggerKey,
        name,
        description,
        config: finalConfig,
        action_type: actionType,
        action_config: actionConfig,
      })
      .returning();

    logger.info("[Application Triggers] Created trigger", {
      triggerId: trigger.id,
      targetType,
      targetId,
      triggerType,
      organizationId,
    });

    return trigger;
  }

  // ===========================================================================
  // GET TRIGGERS
  // ===========================================================================

  async getTrigger(triggerId: string): Promise<ApplicationTrigger | null> {
    const [trigger] = await db
      .select()
      .from(applicationTriggers)
      .where(eq(applicationTriggers.id, triggerId))
      .limit(1);

    return trigger ?? null;
  }

  async findTriggerByKey(triggerKey: string): Promise<ApplicationTrigger | null> {
    const [trigger] = await db
      .select()
      .from(applicationTriggers)
      .where(eq(applicationTriggers.trigger_key, triggerKey))
      .limit(1);

    return trigger ?? null;
  }

  async listTriggersByTarget(
    targetType: TargetType,
    targetId: string
  ): Promise<ApplicationTrigger[]> {
    return db
      .select()
      .from(applicationTriggers)
      .where(
        and(
          eq(applicationTriggers.target_type, targetType),
          eq(applicationTriggers.target_id, targetId)
        )
      )
      .orderBy(desc(applicationTriggers.created_at));
  }

  async listTriggersByOrganization(
    organizationId: string,
    options?: { targetType?: TargetType; triggerType?: TriggerType; isActive?: boolean }
  ): Promise<ApplicationTrigger[]> {
    const conditions = [eq(applicationTriggers.organization_id, organizationId)];

    if (options?.targetType) {
      conditions.push(eq(applicationTriggers.target_type, options.targetType));
    }
    if (options?.triggerType) {
      conditions.push(eq(applicationTriggers.trigger_type, options.triggerType));
    }
    if (options?.isActive !== undefined) {
      conditions.push(eq(applicationTriggers.is_active, options.isActive));
    }

    return db
      .select()
      .from(applicationTriggers)
      .where(and(...conditions))
      .orderBy(desc(applicationTriggers.created_at));
  }

  async getActiveCronTriggers(): Promise<ApplicationTrigger[]> {
    return db
      .select()
      .from(applicationTriggers)
      .where(
        and(
          eq(applicationTriggers.trigger_type, "cron"),
          eq(applicationTriggers.is_active, true)
        )
      );
  }

  // ===========================================================================
  // UPDATE TRIGGER
  // ===========================================================================

  async updateTrigger(
    triggerId: string,
    updates: Partial<Pick<ApplicationTrigger, "name" | "description" | "config" | "action_config" | "is_active">>
  ): Promise<ApplicationTrigger> {
    const [updated] = await db
      .update(applicationTriggers)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(applicationTriggers.id, triggerId))
      .returning();

    if (!updated) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    return updated;
  }

  async regenerateWebhookSecret(triggerId: string): Promise<string> {
    const trigger = await this.getTrigger(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    if (trigger.trigger_type !== "webhook") {
      throw new Error("Can only regenerate secret for webhook triggers");
    }

    const newSecret = generateWebhookSecret();
    const newConfig = {
      ...trigger.config,
      webhookSecret: newSecret,
    };

    await db
      .update(applicationTriggers)
      .set({
        config: newConfig,
        updated_at: new Date(),
      })
      .where(eq(applicationTriggers.id, triggerId));

    return newSecret;
  }

  // ===========================================================================
  // DELETE TRIGGER
  // ===========================================================================

  async deleteTrigger(triggerId: string): Promise<void> {
    await db.delete(applicationTriggers).where(eq(applicationTriggers.id, triggerId));
  }

  // ===========================================================================
  // EXECUTE TRIGGER
  // ===========================================================================

  async executeTrigger(
    triggerId: string,
    inputData?: Record<string, unknown>,
    executionType: "scheduled" | "webhook" | "event" | "manual" = "manual",
    requestMetadata?: { ip?: string; userAgent?: string; headers?: Record<string, string> }
  ): Promise<ExecuteTriggerResult> {
    const trigger = await this.getTrigger(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    if (!trigger.is_active) {
      throw new Error("Trigger is not active");
    }

    // Check daily execution limits
    if (trigger.config.maxExecutionsPerDay) {
      const todayCount = await this.getTodayExecutionCount(triggerId);
      if (todayCount >= trigger.config.maxExecutionsPerDay) {
        throw new Error(`Daily execution limit exceeded (${trigger.config.maxExecutionsPerDay})`);
      }
    }

    // Verify organization is active
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, trigger.organization_id))
      .limit(1);

    if (!org?.is_active) {
      throw new Error("Organization is not active");
    }

    // Create execution record
    const [execution] = await db
      .insert(applicationTriggerExecutions)
      .values({
        trigger_id: triggerId,
        organization_id: trigger.organization_id,
        execution_type: executionType,
        status: "running",
        input_data: inputData,
        started_at: new Date(),
        request_metadata: requestMetadata,
      })
      .returning();

    try {
      // Execute based on action type
      const result = await this.performAction(trigger, inputData);

      // Update execution with success
      await db
        .update(applicationTriggerExecutions)
        .set({
          status: "success",
          output_data: result,
          finished_at: new Date(),
          duration_ms: Date.now() - execution.created_at.getTime(),
        })
        .where(eq(applicationTriggerExecutions.id, execution.id));

      // Update trigger stats
      await db
        .update(applicationTriggers)
        .set({
          execution_count: sql`${applicationTriggers.execution_count} + 1`,
          last_executed_at: new Date(),
        })
        .where(eq(applicationTriggers.id, triggerId));

      return {
        executionId: execution.id,
        status: "success",
        output: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Execution failed";

      // Update execution with error
      await db
        .update(applicationTriggerExecutions)
        .set({
          status: "error",
          error_message: errorMessage,
          finished_at: new Date(),
          duration_ms: Date.now() - execution.created_at.getTime(),
        })
        .where(eq(applicationTriggerExecutions.id, execution.id));

      // Update trigger error stats
      await db
        .update(applicationTriggers)
        .set({
          error_count: sql`${applicationTriggers.error_count} + 1`,
          last_error_at: new Date(),
          last_error_message: errorMessage,
        })
        .where(eq(applicationTriggers.id, triggerId));

      return {
        executionId: execution.id,
        status: "error",
        error: errorMessage,
      };
    }
  }

  // ===========================================================================
  // EXECUTION HISTORY
  // ===========================================================================

  async getExecutions(
    triggerId: string,
    limit: number = 50
  ): Promise<ApplicationTriggerExecution[]> {
    return db
      .select()
      .from(applicationTriggerExecutions)
      .where(eq(applicationTriggerExecutions.trigger_id, triggerId))
      .orderBy(desc(applicationTriggerExecutions.created_at))
      .limit(limit);
  }

  async getTodayExecutionCount(triggerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(applicationTriggerExecutions)
      .where(
        and(
          eq(applicationTriggerExecutions.trigger_id, triggerId),
          sql`${applicationTriggerExecutions.created_at} >= ${today}`
        )
      );

    return result?.count ?? 0;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async verifyTarget(
    targetType: TargetType,
    targetId: string,
    organizationId: string
  ): Promise<void> {
    let target;

    switch (targetType) {
      case "fragment_project":
        [target] = await db
          .select()
          .from(fragmentProjects)
          .where(
            and(
              eq(fragmentProjects.id, targetId),
              eq(fragmentProjects.organization_id, organizationId)
            )
          )
          .limit(1);
        break;

      case "container":
        [target] = await db
          .select()
          .from(containers)
          .where(
            and(
              eq(containers.id, targetId),
              eq(containers.organization_id, organizationId)
            )
          )
          .limit(1);
        break;

      case "user_mcp":
        [target] = await db
          .select()
          .from(userMcps)
          .where(
            and(
              eq(userMcps.id, targetId),
              eq(userMcps.organization_id, organizationId)
            )
          )
          .limit(1);
        break;

      case "code_agent_session":
        [target] = await db
          .select()
          .from(codeAgentSessions)
          .where(
            and(
              eq(codeAgentSessions.id, targetId),
              eq(codeAgentSessions.organization_id, organizationId)
            )
          )
          .limit(1);
        break;
    }

    if (!target) {
      throw new Error(`${targetType} not found or does not belong to organization`);
    }
  }

  private async performAction(
    trigger: ApplicationTrigger,
    inputData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { action_type, action_config, target_type, target_id } = trigger;

    switch (action_type) {
      case "call_endpoint":
        return this.callTargetEndpoint(target_type, target_id, trigger, inputData);

      case "restart":
        return this.restartTarget(target_type, target_id);

      case "execute_workflow":
        if (!action_config?.workflowId) {
          throw new Error("workflowId required for execute_workflow action");
        }
        return this.executeN8nWorkflow(action_config.workflowId as string, inputData);

      case "notify":
        return this.sendNotification(trigger, inputData);

      default:
        throw new Error(`Unknown action type: ${action_type}`);
    }
  }

  private async callTargetEndpoint(
    targetType: TargetType,
    targetId: string,
    trigger: ApplicationTrigger,
    inputData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    let endpoint: string | undefined;

    switch (targetType) {
      case "container": {
        const [container] = await db
          .select()
          .from(containers)
          .where(eq(containers.id, targetId))
          .limit(1);

        if (!container?.load_balancer_url) {
          throw new Error("Container does not have a load balancer URL");
        }

        const path = (trigger.action_config?.endpoint as string) || "/trigger";
        endpoint = `${container.load_balancer_url}${path}`;
        break;
      }

      case "user_mcp": {
        const [mcp] = await db
          .select()
          .from(userMcps)
          .where(eq(userMcps.id, targetId))
          .limit(1);

        if (mcp?.endpoint_type === "external" && mcp.external_endpoint) {
          endpoint = mcp.external_endpoint;
        } else if (mcp?.container_id) {
          const [container] = await db
            .select()
            .from(containers)
            .where(eq(containers.id, mcp.container_id))
            .limit(1);

          if (container?.load_balancer_url) {
            endpoint = `${container.load_balancer_url}${mcp.endpoint_path || "/mcp"}`;
          }
        }

        if (!endpoint) {
          throw new Error("MCP does not have a valid endpoint");
        }
        break;
      }

      case "fragment_project": {
        const [project] = await db
          .select()
          .from(fragmentProjects)
          .where(eq(fragmentProjects.id, targetId))
          .limit(1);

        if (project?.sandbox_url) {
          const path = (trigger.action_config?.endpoint as string) || "/api/trigger";
          endpoint = `${project.sandbox_url}${path}`;
        } else {
          throw new Error("Fragment project does not have a sandbox URL");
        }
        break;
      }
    }

    if (!endpoint) {
      throw new Error("Could not determine target endpoint");
    }

    const method = (trigger.action_config?.method as string) || "POST";
    const timeout = (trigger.config.timeout ?? 30) * 1000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...trigger.config.headers,
        },
        body: method !== "GET" ? JSON.stringify(inputData || {}) : undefined,
        signal: controller.signal,
      });

      const responseData = await safeJsonParse<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseData.error || response.statusText}`);
      }

      return responseData;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async restartTarget(
    targetType: TargetType,
    targetId: string
  ): Promise<Record<string, unknown>> {
    if (targetType !== "container") {
      throw new Error("Restart action only supported for containers");
    }

    const { containersService } = await import("@/lib/services/containers");
    await containersService.restartContainer(targetId);

    return { restarted: true, targetId };
  }

  private async executeN8nWorkflow(
    workflowId: string,
    inputData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { n8nWorkflowsService } = await import("@/lib/services/n8n-workflows");

    const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const execution = await n8nWorkflowsService.testWorkflow({
      workflowId,
      inputData,
      userId: workflow.user_id,
    });

    return {
      executionId: execution.id,
      status: execution.status,
    };
  }

  private async sendNotification(
    trigger: ApplicationTrigger,
    inputData?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const channels = trigger.action_config?.notificationChannels as string[] | undefined;
    
    logger.info("[Application Triggers] Processing notification", {
      triggerId: trigger.id,
      channels,
    });

    const results: Record<string, boolean> = {};

    // Notification channels can be configured per-trigger in action_config.notificationChannels
    // Supported: "slack", "email", "webhook"
    // Future: "discord", "telegram", "sms"
    
    if (!channels || channels.length === 0) {
      logger.warn("[Application Triggers] No notification channels configured", {
        triggerId: trigger.id,
      });
      return { notified: false, reason: "No channels configured" };
    }

    for (const channel of channels) {
      switch (channel) {
        case "slack": {
          // Slack notifications require SLACK_WEBHOOK_URL
          const webhookUrl = process.env.SLACK_WEBHOOK_URL;
          if (webhookUrl) {
            const sent = await this.sendSlackNotification(webhookUrl, trigger, inputData);
            results.slack = sent;
          } else {
            logger.debug("[Application Triggers] Slack webhook not configured");
            results.slack = false;
          }
          break;
        }
        case "webhook": {
          // Custom webhook URL from action_config.webhookUrl
          const webhookUrl = trigger.action_config?.webhookUrl as string | undefined;
          if (webhookUrl) {
            const sent = await this.sendWebhookNotification(webhookUrl, trigger, inputData);
            results.webhook = sent;
          } else {
            results.webhook = false;
          }
          break;
        }
        case "email":
          // Email notifications require future integration with email service
          logger.info("[Application Triggers] Email notifications not yet implemented");
          results.email = false;
          break;
        default:
          logger.warn("[Application Triggers] Unknown notification channel", { channel });
          results[channel] = false;
      }
    }

    return { 
      notified: Object.values(results).some(r => r), 
      channels: results,
    };
  }

  private async sendSlackNotification(
    webhookUrl: string,
    trigger: ApplicationTrigger,
    inputData?: Record<string, unknown>
  ): Promise<boolean> {
    const payload = {
      text: `🔔 Trigger Notification: ${trigger.name}`,
      attachments: [
        {
          color: "#36a64f",
          title: trigger.name,
          text: trigger.description || "Trigger executed",
          fields: inputData
            ? Object.entries(inputData).slice(0, 5).map(([key, value]) => ({
                title: key,
                value: String(value).slice(0, 100),
                short: true,
              }))
            : [],
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error("[Application Triggers] Slack notification failed", {
        triggerId: trigger.id,
        status: response.status,
      });
      return false;
    }

    return true;
  }

  private async sendWebhookNotification(
    webhookUrl: string,
    trigger: ApplicationTrigger,
    inputData?: Record<string, unknown>
  ): Promise<boolean> {
    const payload = {
      triggerId: trigger.id,
      triggerName: trigger.name,
      triggerType: trigger.trigger_type,
      timestamp: new Date().toISOString(),
      data: inputData,
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error("[Application Triggers] Webhook notification failed", {
        triggerId: trigger.id,
        webhookUrl,
        status: response.status,
      });
      return false;
    }

    return true;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const applicationTriggersService = new ApplicationTriggersService();

