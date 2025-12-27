/**
 * Event Emitter Service
 *
 * Unified event system that routes events to subscribed webhooks.
 * Simple, KISS approach - no complex event bus, just direct routing.
 */

import { webhookService } from "../webhooks/webhook-service";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db";
import { webhooks } from "@/db/schemas/webhooks";
import { eq, and, sql } from "drizzle-orm";

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookEvent {
  eventType: string;
  organizationId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// =============================================================================
// EVENT EMITTER SERVICE
// =============================================================================

class EventEmitterService {
  /**
   * Emit an event and route it to all matching webhooks
   */
  async emit(event: WebhookEvent): Promise<void> {
    const { eventType, organizationId, data, timestamp } = event;

    const matchingWebhooks = await this.findMatchingWebhooks(
      organizationId,
      eventType,
    );

    if (matchingWebhooks.length === 0) {
      return;
    }

    const payload = {
      eventType,
      timestamp,
      data,
      organizationId,
    };

    const executions = matchingWebhooks.map((webhook) =>
      this.deliverToWebhook(webhook.id, payload),
    );

    await Promise.allSettled(executions);

    logger.debug("[EventEmitter] Event emitted", {
      eventType,
      organizationId,
      webhookCount: matchingWebhooks.length,
    });
  }

  /**
   * Find webhooks that match the event
   */
  private async findMatchingWebhooks(
    organizationId: string,
    eventType: string,
  ) {
    const activeWebhooks = await db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.organization_id, organizationId),
          eq(webhooks.is_active, true),
        ),
      );

    return activeWebhooks.filter((webhook) => {
      const config = webhook.config as any;
      const eventTypes = config.eventTypes || [];

      if (eventTypes.length === 0) {
        return true;
      }

      return eventTypes.includes(eventType) || eventTypes.includes("*");
    });
  }

  /**
   * Deliver event to a webhook
   */
  private async deliverToWebhook(
    webhookId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const rateLimitOk = await webhookService.checkRateLimit(webhookId);
    if (!rateLimitOk) {
      logger.warn("[EventEmitter] Rate limit exceeded", { webhookId });
      return;
    }

    await webhookService.executeWebhook({
      webhookId,
      eventType: payload.eventType as string,
      payload,
    });
  }
}

export const eventEmitter = new EventEmitterService();

