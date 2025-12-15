import { eq, lt, and } from "drizzle-orm";
import { db } from "../client";
import {
  webhookEvents,
  type WebhookEvent,
  type NewWebhookEvent,
} from "../schemas/webhook-events";

export type { WebhookEvent, NewWebhookEvent };

export class WebhookEventsRepository {
  /**
   * Find a webhook event by its unique event ID.
   */
  async findByEventId(eventId: string): Promise<WebhookEvent | undefined> {
    return await db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.event_id, eventId),
    });
  }

  /**
   * Check if a webhook event has already been processed.
   */
  async isProcessed(eventId: string): Promise<boolean> {
    const event = await this.findByEventId(eventId);
    return !!event;
  }

  /**
   * Record a processed webhook event.
   */
  async create(data: NewWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db
      .insert(webhookEvents)
      .values({
        ...data,
        processed_at: new Date(),
      })
      .returning();
    return event;
  }

  /**
   * Delete old webhook events to prevent table growth.
   * Keeps events from the last `retentionDays` days.
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db
      .delete(webhookEvents)
      .where(lt(webhookEvents.processed_at, cutoffDate))
      .returning();

    return result.length;
  }

  /**
   * Delete old webhook events for a specific provider.
   */
  async cleanupOldEventsForProvider(
    provider: string,
    retentionDays: number = 30
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db
      .delete(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, provider),
          lt(webhookEvents.processed_at, cutoffDate)
        )
      )
      .returning();

    return result.length;
  }
}

export const webhookEventsRepository = new WebhookEventsRepository();

