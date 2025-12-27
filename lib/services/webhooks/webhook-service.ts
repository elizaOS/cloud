/**
 * Webhook Service
 *
 * Unified service for managing webhooks across the platform.
 * Handles CRUD operations, execution, and event routing.
 */

import { db } from "@/db";
import {
  webhooks,
  webhookExecutions,
  type Webhook,
  type NewWebhook,
  type WebhookExecution,
  type WebhookConfig,
} from "@/db/schemas/webhooks";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "@/lib/utils/logger";
import {
  generateWebhookSecret,
  generateWebhookSignature,
  createSignatureHeaders,
} from "@/lib/utils/webhook-signature";
import { extractErrorMessage } from "@/lib/utils/error-handling";

// =============================================================================
// TYPES
// =============================================================================

export type WebhookTargetType =
  | "url"
  | "agent"
  | "application"
  | "workflow"
  | "a2a"
  | "mcp";

export interface CreateWebhookParams {
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  targetType: WebhookTargetType;
  targetId?: string;
  targetUrl?: string;
  config?: Partial<WebhookConfig>;
  metadata?: Record<string, unknown>;
}

export interface UpdateWebhookParams {
  name?: string;
  description?: string;
  targetUrl?: string;
  config?: Partial<WebhookConfig>;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ExecuteWebhookParams {
  webhookId: string;
  eventType?: string;
  payload: Record<string, unknown>;
  requestIp?: string;
  requestHeaders?: Record<string, string>;
}

export interface ExecuteWebhookResult {
  executionId: string;
  status: "success" | "error" | "timeout";
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  durationMs: number;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class WebhookService {
  // ===========================================================================
  // CREATE WEBHOOK
  // ===========================================================================

  async createWebhook(params: CreateWebhookParams): Promise<Webhook> {
    const {
      organizationId,
      createdBy,
      name,
      description,
      targetType,
      targetId,
      targetUrl,
      config = {},
      metadata = {},
    } = params;

    if (targetType === "url" && !targetUrl) {
      throw new Error("targetUrl is required for url target type");
    }

    if (targetType !== "url" && !targetId) {
      throw new Error("targetId is required for non-url target types");
    }

    const webhookKey = randomBytes(32).toString("hex");
    const secret = generateWebhookSecret();

    const finalConfig: WebhookConfig = {
      requireSignature: config.requireSignature ?? true,
      timeoutSeconds: config.timeoutSeconds ?? 10,
      retryCount: config.retryCount ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      maxExecutionsPerDay: config.maxExecutionsPerDay ?? 10000,
      ...config,
    };

    const [webhook] = await db
      .insert(webhooks)
      .values({
        organization_id: organizationId,
        created_by: createdBy,
        name,
        description,
        webhook_key: webhookKey,
        target_type: targetType,
        target_id: targetId || null,
        target_url: targetUrl || null,
        secret,
        config: finalConfig,
        metadata,
      })
      .returning();

    logger.info("[WebhookService] Created webhook", {
      webhookId: webhook.id,
      webhookKey,
      organizationId,
      targetType,
    });

    return webhook;
  }

  // ===========================================================================
  // GET WEBHOOK
  // ===========================================================================

  async getWebhookById(
    webhookId: string,
    organizationId: string,
  ): Promise<Webhook | null> {
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.id, webhookId),
          eq(webhooks.organization_id, organizationId),
        ),
      )
      .limit(1);

    return webhook || null;
  }

  async getWebhookByKey(webhookKey: string): Promise<Webhook | null> {
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.webhook_key, webhookKey))
      .limit(1);

    return webhook || null;
  }

  // ===========================================================================
  // LIST WEBHOOKS
  // ===========================================================================

  async listWebhooks(
    organizationId: string,
    options?: {
      targetType?: WebhookTargetType;
      targetId?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<Webhook[]> {
    const { targetType, targetId, isActive, limit = 100, offset = 0 } =
      options || {};

    const conditions = [eq(webhooks.organization_id, organizationId)];

    if (targetType) {
      conditions.push(eq(webhooks.target_type, targetType));
    }

    if (targetId) {
      conditions.push(eq(webhooks.target_id, targetId));
    }

    if (isActive !== undefined) {
      conditions.push(eq(webhooks.is_active, isActive));
    }

    return db
      .select()
      .from(webhooks)
      .where(and(...conditions))
      .orderBy(desc(webhooks.created_at))
      .limit(limit)
      .offset(offset);
  }

  // ===========================================================================
  // UPDATE WEBHOOK
  // ===========================================================================

  async updateWebhook(
    webhookId: string,
    organizationId: string,
    params: UpdateWebhookParams,
  ): Promise<Webhook> {
    const updateData: Partial<NewWebhook> = {
      updated_at: new Date(),
    };

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined)
      updateData.description = params.description;
    if (params.targetUrl !== undefined) updateData.target_url = params.targetUrl;
    if (params.isActive !== undefined) updateData.is_active = params.isActive;
    if (params.metadata !== undefined) updateData.metadata = params.metadata;

    if (params.config !== undefined) {
      const existing = await this.getWebhookById(webhookId, organizationId);
      if (!existing) {
        throw new Error("Webhook not found");
      }

      updateData.config = {
        ...(existing.config as WebhookConfig),
        ...params.config,
      };
    }

    const [updated] = await db
      .update(webhooks)
      .set(updateData)
      .where(
        and(
          eq(webhooks.id, webhookId),
          eq(webhooks.organization_id, organizationId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Webhook not found");
    }

    logger.info("[WebhookService] Updated webhook", {
      webhookId,
      organizationId,
    });

    return updated;
  }

  // ===========================================================================
  // DELETE WEBHOOK
  // ===========================================================================

  async deleteWebhook(
    webhookId: string,
    organizationId: string,
  ): Promise<void> {
    const deleted = await db
      .delete(webhooks)
      .where(
        and(
          eq(webhooks.id, webhookId),
          eq(webhooks.organization_id, organizationId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      throw new Error("Webhook not found");
    }

    logger.info("[WebhookService] Deleted webhook", {
      webhookId,
      organizationId,
    });
  }

  // ===========================================================================
  // EXECUTE WEBHOOK
  // ===========================================================================

  async executeWebhook(
    params: ExecuteWebhookParams,
  ): Promise<ExecuteWebhookResult> {
    const { webhookId, eventType, payload, requestIp, requestHeaders } =
      params;

    const webhook = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1)
      .then((rows) => rows[0] || null);

    if (!webhook || !webhook.is_active) {
      throw new Error("Webhook not found or inactive");
    }

    const config = webhook.config as WebhookConfig;
    const targetUrl = webhook.target_url || this.getTargetUrl(webhook);

    if (!targetUrl) {
      throw new Error("Webhook target URL not configured");
    }

    const startedAt = Date.now();
    const executionId = randomBytes(16).toString("hex");

    const executionRecord: Partial<WebhookExecution> = {
      id: executionId,
      webhook_id: webhookId,
      organization_id: webhook.organization_id,
      status: "pending",
      event_type: eventType || null,
      payload: payload,
      request_ip: requestIp || null,
      request_headers: requestHeaders || null,
      started_at: new Date(),
    };

    await db.insert(webhookExecutions).values(executionRecord);

    const result = await this.deliverWebhook(webhook, payload, config);

    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;

    await db
      .update(webhookExecutions)
      .set({
        status: result.status,
        response_status: result.responseStatus || null,
        response_body: result.responseBody || null,
        error_message: result.error || null,
        finished_at: new Date(),
        duration_ms: durationMs,
      })
      .where(eq(webhookExecutions.id, executionId));

    await this.updateWebhookStats(webhookId, result.status);

    return {
      executionId,
      status: result.status,
      responseStatus: result.responseStatus,
      responseBody: result.responseBody,
      error: result.error,
      durationMs,
    };
  }

  // ===========================================================================
  // DELIVER WEBHOOK
  // ===========================================================================

  private async deliverWebhook(
    webhook: Webhook,
    payload: Record<string, unknown>,
    config: WebhookConfig,
  ): Promise<{
    status: "success" | "error" | "timeout";
    responseStatus?: number;
    responseBody?: string;
    error?: string;
  }> {
    const targetUrl = webhook.target_url || this.getTargetUrl(webhook);
    if (!targetUrl) {
      return {
        status: "error",
        error: "Target URL not configured",
      };
    }

    const payloadString = JSON.stringify(payload);
    const timeoutMs = (config.timeoutSeconds || 10) * 1000;
    const retryCount = config.retryCount || 3;
    const retryDelays = [1000, 5000, 15000];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ElizaCloud-Webhooks/1.0",
      ...(config.headers || {}),
    };

    if (config.requireSignature !== false) {
      const signatureHeaders = createSignatureHeaders(
        payloadString,
        webhook.secret,
      );
      Object.assign(headers, signatureHeaders);
    }

    let lastError: string | undefined;
    let lastResponseStatus: number | undefined;
    let lastResponseBody: string | undefined;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelays[attempt - 1]),
        );
      }

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: payloadString,
        signal: abortController.signal,
      }).catch((error) => {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
          return { ok: false, status: 0, text: async () => "Timeout" };
        }
        throw error;
      });

      clearTimeout(timeoutId);

      lastResponseStatus = response.status;
      lastResponseBody = await response.text().catch(() => "");

      if (response.ok) {
        return {
          status: "success",
          responseStatus: response.status,
          responseBody: lastResponseBody,
        };
      }

      if (response.status < 500) {
        return {
          status: "error",
          responseStatus: response.status,
          responseBody: lastResponseBody,
          error: `HTTP ${response.status}`,
        };
      }

      lastError = `HTTP ${response.status}`;
    }

    return {
      status: "error",
      responseStatus: lastResponseStatus,
      responseBody: lastResponseBody,
      error: lastError || "Max retries exceeded",
    };
  }

  // ===========================================================================
  // GET TARGET URL
  // ===========================================================================

  private getTargetUrl(webhook: Webhook): string | null {
    if (webhook.target_url) {
      return webhook.target_url;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    switch (webhook.target_type) {
      case "a2a":
        return `${baseUrl}/api/a2a`;
      case "mcp":
        return `${baseUrl}/api/mcp`;
      default:
        return null;
    }
  }

  // ===========================================================================
  // UPDATE WEBHOOK STATS
  // ===========================================================================

  private async updateWebhookStats(
    webhookId: string,
    status: "success" | "error" | "timeout",
  ): Promise<void> {
    const webhook = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1)
      .then((rows) => rows[0] || null);

    if (!webhook) {
      return;
    }

    const updates: Partial<NewWebhook> = {
      execution_count: webhook.execution_count + 1,
      last_triggered_at: new Date(),
      updated_at: new Date(),
    };

    if (status === "success") {
      updates.success_count = webhook.success_count + 1;
      updates.last_success_at = new Date();
    } else {
      updates.error_count = webhook.error_count + 1;
      updates.last_error_at = new Date();
    }

    await db
      .update(webhooks)
      .set(updates)
      .where(eq(webhooks.id, webhookId));
  }

  // ===========================================================================
  // LIST EXECUTIONS
  // ===========================================================================

  async listExecutions(
    webhookId: string,
    organizationId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: "pending" | "success" | "error" | "timeout";
    },
  ): Promise<WebhookExecution[]> {
    const { limit = 50, offset = 0, status } = options || {};

    const conditions = [
      eq(webhookExecutions.webhook_id, webhookId),
      eq(webhookExecutions.organization_id, organizationId),
    ];

    if (status) {
      conditions.push(eq(webhookExecutions.status, status));
    }

    return db
      .select()
      .from(webhookExecutions)
      .where(and(...conditions))
      .orderBy(desc(webhookExecutions.created_at))
      .limit(limit)
      .offset(offset);
  }

  // ===========================================================================
  // CHECK RATE LIMIT
  // ===========================================================================

  async checkRateLimit(webhookId: string): Promise<boolean> {
    const webhook = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1)
      .then((rows) => rows[0] || null);

    if (!webhook) {
      return false;
    }

    const config = webhook.config as WebhookConfig;
    const maxExecutions = config.maxExecutionsPerDay || 10000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(webhookExecutions)
      .where(
        and(
          eq(webhookExecutions.webhook_id, webhookId),
          sql`${webhookExecutions.created_at} >= ${today}`,
        ),
      )
      .then((rows) => Number(rows[0]?.count || 0));

    return count < maxExecutions;
  }
}

export const webhookService = new WebhookService();

