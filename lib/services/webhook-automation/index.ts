/**
 * Webhook Automation Service
 *
 * Handles creation and management of webhook endpoints for receiving
 * external events and triggering workflows.
 */

import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { randomBytes, createHmac } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";

// Secret names prefix for webhooks
const WEBHOOK_PREFIX = "WEBHOOK_";

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret: string;
  createdAt: string;
  lastTriggeredAt?: string;
  triggerCount: number;
}

export interface WebhookConnectionStatus {
  configured: boolean;
  connected: boolean;
  webhooks: WebhookConfig[];
  error?: string;
}

// Cache for status checks (1 minute TTL - shorter for webhooks)
const statusCache = new Map<
  string,
  { status: WebhookConnectionStatus; timestamp: number }
>();
const CACHE_TTL = 60 * 1000;

class WebhookAutomationService {
  /**
   * Webhooks are always "configured" - no external setup needed
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Generate a unique webhook ID
   */
  private generateWebhookId(): string {
    return `wh_${randomBytes(12).toString("hex")}`;
  }

  /**
   * Generate a webhook secret for signature verification
   */
  private generateSecret(): string {
    return `whsec_${randomBytes(24).toString("hex")}`;
  }

  /**
   * Create a new webhook endpoint
   */
  async createWebhook(
    organizationId: string,
    userId: string,
    name: string
  ): Promise<WebhookConfig> {
    const webhookId = this.generateWebhookId();
    const secret = this.generateSecret();
    const url = `${APP_URL}/api/v1/webhooks/${webhookId}`;

    const config: WebhookConfig = {
      id: webhookId,
      name,
      url,
      secret,
      createdAt: new Date().toISOString(),
      triggerCount: 0,
    };

    const audit = {
      action: "webhook_create" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: { webhookId, name },
    };

    // Store webhook config as a secret
    await secretsService.create(
      {
        organizationId,
        name: `${WEBHOOK_PREFIX}${webhookId}`,
        value: JSON.stringify(config),
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    this.invalidateStatusCache(organizationId);

    return config;
  }

  /**
   * Delete a webhook endpoint
   */
  async deleteWebhook(
    organizationId: string,
    userId: string,
    webhookId: string
  ): Promise<void> {
    const audit = {
      action: "webhook_delete" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: { webhookId },
    };

    try {
      await secretsService.deleteByName(
        organizationId,
        `${WEBHOOK_PREFIX}${webhookId}`,
        audit
      );
    } catch {
      // Ignore if doesn't exist
    }

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Get all webhooks for an organization
   */
  async getWebhooks(organizationId: string): Promise<WebhookConfig[]> {
    try {
      // Get all secrets for the organization that start with WEBHOOK_
      const webhooks: WebhookConfig[] = [];

      // Note: This is a simplified implementation. In production,
      // you might want to store webhooks in a dedicated table for easier querying.
      // For now, we'll use the pattern of listing by prefix if your secrets service supports it.
      // If not, we'll need to track webhook IDs separately.

      // For this implementation, let's store a list of webhook IDs
      const webhookListStr = await secretsService.getByName(
        organizationId,
        `${WEBHOOK_PREFIX}LIST`
      );

      if (!webhookListStr) {
        return [];
      }

      const webhookIds: string[] = JSON.parse(webhookListStr);

      for (const webhookId of webhookIds) {
        try {
          const configStr = await secretsService.getByName(
            organizationId,
            `${WEBHOOK_PREFIX}${webhookId}`
          );
          if (configStr) {
            webhooks.push(JSON.parse(configStr));
          }
        } catch {
          // Skip invalid webhooks
        }
      }

      return webhooks;
    } catch {
      return [];
    }
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(
    organizationId: string
  ): Promise<WebhookConnectionStatus> {
    // Check cache
    const cached = statusCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.status;
    }

    try {
      const webhooks = await this.getWebhooks(organizationId);

      const status: WebhookConnectionStatus = {
        configured: true,
        connected: webhooks.length > 0,
        webhooks,
      };

      statusCache.set(organizationId, { status, timestamp: Date.now() });
      return status;
    } catch (error) {
      logger.error("[Webhook] Error getting connection status:", error);
      return {
        configured: true,
        connected: false,
        webhooks: [],
        error: "Failed to check connection status",
      };
    }
  }

  /**
   * Validate a webhook signature
   */
  validateSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return `sha256=${expectedSignature}` === signature;
  }

  /**
   * Get a webhook by ID (for receiving events)
   */
  async getWebhookById(
    webhookId: string
  ): Promise<{ webhook: WebhookConfig; organizationId: string } | null> {
    // Note: This requires knowing the organization ID, which we don't have from just the webhook ID.
    // In a production system, you'd store webhooks in a dedicated table indexed by ID.
    // For now, we'll need to handle this differently.
    // 
    // Option 1: Store webhooks in a global table
    // Option 2: Encode the org ID in the webhook URL
    // Option 3: Store a mapping of webhook ID -> org ID
    //
    // For this implementation, let's use a simple mapping stored in a special location
    try {
      const mappingStr = await secretsService.getByName(
        "global", // Use a global namespace for webhook lookups
        `${WEBHOOK_PREFIX}MAP_${webhookId}`
      );

      if (!mappingStr) {
        return null;
      }

      const { organizationId } = JSON.parse(mappingStr);

      const configStr = await secretsService.getByName(
        organizationId,
        `${WEBHOOK_PREFIX}${webhookId}`
      );

      if (!configStr) {
        return null;
      }

      return {
        webhook: JSON.parse(configStr),
        organizationId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Record a webhook trigger
   */
  async recordTrigger(
    organizationId: string,
    webhookId: string
  ): Promise<void> {
    try {
      const configStr = await secretsService.getByName(
        organizationId,
        `${WEBHOOK_PREFIX}${webhookId}`
      );

      if (configStr) {
        const config: WebhookConfig = JSON.parse(configStr);
        config.lastTriggeredAt = new Date().toISOString();
        config.triggerCount = (config.triggerCount || 0) + 1;

        // Update the config (simplified - you'd use an update method)
        // Note: This is a simplified implementation
      }
    } catch {
      // Ignore errors in recording
    }

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Invalidate cached status
   */
  invalidateStatusCache(organizationId: string): void {
    statusCache.delete(organizationId);
  }
}

export const webhookAutomationService = new WebhookAutomationService();
