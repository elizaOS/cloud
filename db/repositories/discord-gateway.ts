/**
 * Discord Gateway Repository
 *
 * Database operations for Discord bot connections, event routes, and event queue.
 */

import { eq, and, desc, sql, inArray, lt, or, isNull } from "drizzle-orm";
import { db } from "../client";
import {
  discordBotConnections,
  discordEventRoutes,
  discordEventQueue,
  type DiscordBotConnection,
  type NewDiscordBotConnection,
  type DiscordEventRoute,
  type NewDiscordEventRoute,
  type DiscordEventQueueItem,
  type NewDiscordEventQueueItem,
  type DiscordConnectionStatus,
  type DiscordEventType,
  type DiscordEventPayload,
} from "../schemas/discord-gateway";

// =============================================================================
// BOT CONNECTIONS
// =============================================================================

export class DiscordBotConnectionsRepository {
  /**
   * Get all bot connections for an organization.
   */
  async listByOrganization(organizationId: string): Promise<DiscordBotConnection[]> {
    return await db
      .select()
      .from(discordBotConnections)
      .where(eq(discordBotConnections.organization_id, organizationId))
      .orderBy(desc(discordBotConnections.created_at));
  }

  /**
   * Get a bot connection by platform connection ID.
   */
  async getByPlatformConnection(
    platformConnectionId: string
  ): Promise<DiscordBotConnection | null> {
    const [connection] = await db
      .select()
      .from(discordBotConnections)
      .where(eq(discordBotConnections.platform_connection_id, platformConnectionId))
      .limit(1);
    return connection ?? null;
  }

  /**
   * Get all bot connections with a specific status.
   */
  async listByStatus(status: DiscordConnectionStatus): Promise<DiscordBotConnection[]> {
    return await db
      .select()
      .from(discordBotConnections)
      .where(eq(discordBotConnections.status, status));
  }

  /**
   * Get all bot connections assigned to a specific pod.
   */
  async listByPod(podName: string): Promise<DiscordBotConnection[]> {
    return await db
      .select()
      .from(discordBotConnections)
      .where(eq(discordBotConnections.gateway_pod, podName));
  }

  /**
   * Get connections that need to be assigned to a pod (no pod assigned or pod is stale).
   */
  async listUnassigned(): Promise<DiscordBotConnection[]> {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
    return await db
      .select()
      .from(discordBotConnections)
      .where(
        and(
          or(
            isNull(discordBotConnections.gateway_pod),
            lt(discordBotConnections.last_heartbeat, staleThreshold)
          ),
          eq(discordBotConnections.status, "disconnected")
        )
      );
  }

  /**
   * Create a new bot connection.
   */
  async create(data: NewDiscordBotConnection): Promise<DiscordBotConnection> {
    const [connection] = await db
      .insert(discordBotConnections)
      .values({
        ...data,
        updated_at: new Date(),
      })
      .returning();
    return connection;
  }

  /**
   * Update bot connection status and related fields.
   */
  async updateStatus(
    id: string,
    status: DiscordConnectionStatus,
    options?: {
      errorMessage?: string;
      sessionId?: string;
      resumeGatewayUrl?: string;
      sequenceNumber?: number;
      gatewayPod?: string;
    }
  ): Promise<DiscordBotConnection | null> {
    const updateData: Partial<DiscordBotConnection> = {
      status,
      updated_at: new Date(),
    };

    if (options?.errorMessage !== undefined) {
      updateData.error_message = options.errorMessage;
    }
    if (options?.sessionId !== undefined) {
      updateData.session_id = options.sessionId;
    }
    if (options?.resumeGatewayUrl !== undefined) {
      updateData.resume_gateway_url = options.resumeGatewayUrl;
    }
    if (options?.sequenceNumber !== undefined) {
      updateData.sequence_number = options.sequenceNumber;
    }
    if (options?.gatewayPod !== undefined) {
      updateData.gateway_pod = options.gatewayPod;
    }

    if (status === "connected") {
      updateData.connected_at = new Date();
      updateData.error_message = null;
    } else if (status === "disconnected") {
      updateData.disconnected_at = new Date();
    }

    const [connection] = await db
      .update(discordBotConnections)
      .set(updateData)
      .where(eq(discordBotConnections.id, id))
      .returning();
    return connection ?? null;
  }

  /**
   * Update heartbeat timestamp.
   */
  async updateHeartbeat(id: string, sequenceNumber?: number): Promise<void> {
    const updateData: Partial<DiscordBotConnection> = {
      last_heartbeat: new Date(),
      updated_at: new Date(),
    };

    if (sequenceNumber !== undefined) {
      updateData.sequence_number = sequenceNumber;
    }

    await db
      .update(discordBotConnections)
      .set(updateData)
      .where(eq(discordBotConnections.id, id));
  }

  /**
   * Increment event counters.
   */
  async incrementEventCounters(
    id: string,
    received: number,
    routed: number
  ): Promise<void> {
    await db
      .update(discordBotConnections)
      .set({
        events_received: sql`${discordBotConnections.events_received} + ${received}`,
        events_routed: sql`${discordBotConnections.events_routed} + ${routed}`,
        last_event_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(discordBotConnections.id, id));
  }

  /**
   * Update guild count.
   */
  async updateGuildCount(id: string, guildCount: number): Promise<void> {
    await db
      .update(discordBotConnections)
      .set({
        guild_count: guildCount,
        updated_at: new Date(),
      })
      .where(eq(discordBotConnections.id, id));
  }

  /**
   * Assign a pod to handle the connection.
   */
  async assignPod(id: string, podName: string): Promise<DiscordBotConnection | null> {
    const [connection] = await db
      .update(discordBotConnections)
      .set({
        gateway_pod: podName,
        status: "starting",
        updated_at: new Date(),
      })
      .where(eq(discordBotConnections.id, id))
      .returning();
    return connection ?? null;
  }

  /**
   * Delete a bot connection.
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(discordBotConnections)
      .where(eq(discordBotConnections.id, id))
      .returning();
    return result.length > 0;
  }
}

// =============================================================================
// EVENT ROUTES
// =============================================================================

export class DiscordEventRoutesRepository {
  /**
   * Get all routes for an organization.
   */
  async listByOrganization(organizationId: string): Promise<DiscordEventRoute[]> {
    return await db
      .select()
      .from(discordEventRoutes)
      .where(eq(discordEventRoutes.organization_id, organizationId))
      .orderBy(desc(discordEventRoutes.priority));
  }

  /**
   * Get routes for a specific guild.
   */
  async listByGuild(
    platformConnectionId: string,
    guildId: string
  ): Promise<DiscordEventRoute[]> {
    return await db
      .select()
      .from(discordEventRoutes)
      .where(
        and(
          eq(discordEventRoutes.platform_connection_id, platformConnectionId),
          eq(discordEventRoutes.guild_id, guildId),
          eq(discordEventRoutes.enabled, true)
        )
      )
      .orderBy(desc(discordEventRoutes.priority));
  }

  /**
   * Find matching routes for an event.
   */
  async findMatchingRoutes(params: {
    platformConnectionId: string;
    guildId: string;
    channelId?: string;
    eventType: DiscordEventType;
  }): Promise<DiscordEventRoute[]> {
    const routes = await db
      .select()
      .from(discordEventRoutes)
      .where(
        and(
          eq(discordEventRoutes.platform_connection_id, params.platformConnectionId),
          eq(discordEventRoutes.guild_id, params.guildId),
          eq(discordEventRoutes.event_type, params.eventType),
          eq(discordEventRoutes.enabled, true)
        )
      )
      .orderBy(desc(discordEventRoutes.priority));

    // Filter by channel if specified in route
    return routes.filter(
      (route) => !route.channel_id || route.channel_id === params.channelId
    );
  }

  /**
   * Create a new event route.
   */
  async create(data: NewDiscordEventRoute): Promise<DiscordEventRoute> {
    const [route] = await db
      .insert(discordEventRoutes)
      .values({
        ...data,
        updated_at: new Date(),
      })
      .returning();
    return route;
  }

  /**
   * Update a route.
   */
  async update(
    id: string,
    data: Partial<NewDiscordEventRoute>
  ): Promise<DiscordEventRoute | null> {
    const [route] = await db
      .update(discordEventRoutes)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(discordEventRoutes.id, id))
      .returning();
    return route ?? null;
  }

  /**
   * Increment route counters.
   */
  async incrementCounters(id: string, matched: number, routed: number): Promise<void> {
    await db
      .update(discordEventRoutes)
      .set({
        events_matched: sql`${discordEventRoutes.events_matched} + ${matched}`,
        events_routed: sql`${discordEventRoutes.events_routed} + ${routed}`,
        last_routed_at: routed > 0 ? new Date() : undefined,
        updated_at: new Date(),
      })
      .where(eq(discordEventRoutes.id, id));
  }

  /**
   * Enable/disable a route.
   */
  async setEnabled(id: string, enabled: boolean): Promise<DiscordEventRoute | null> {
    const [route] = await db
      .update(discordEventRoutes)
      .set({
        enabled,
        updated_at: new Date(),
      })
      .where(eq(discordEventRoutes.id, id))
      .returning();
    return route ?? null;
  }

  /**
   * Delete a route.
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(discordEventRoutes)
      .where(eq(discordEventRoutes.id, id))
      .returning();
    return result.length > 0;
  }
}

// =============================================================================
// EVENT QUEUE
// =============================================================================

export class DiscordEventQueueRepository {
  /**
   * Add an event to the queue.
   */
  async enqueue(data: NewDiscordEventQueueItem): Promise<DiscordEventQueueItem> {
    const [item] = await db
      .insert(discordEventQueue)
      .values(data)
      .returning();
    return item;
  }

  /**
   * Get pending events ready for processing.
   */
  async getPending(limit = 100): Promise<DiscordEventQueueItem[]> {
    return await db
      .select()
      .from(discordEventQueue)
      .where(
        and(
          eq(discordEventQueue.status, "pending"),
          lt(discordEventQueue.process_after, new Date())
        )
      )
      .orderBy(discordEventQueue.created_at)
      .limit(limit);
  }

  /**
   * Get pending events for a specific organization.
   */
  async getPendingByOrganization(
    organizationId: string,
    limit = 100
  ): Promise<DiscordEventQueueItem[]> {
    return await db
      .select()
      .from(discordEventQueue)
      .where(
        and(
          eq(discordEventQueue.organization_id, organizationId),
          eq(discordEventQueue.status, "pending"),
          lt(discordEventQueue.process_after, new Date())
        )
      )
      .orderBy(discordEventQueue.created_at)
      .limit(limit);
  }

  /**
   * Mark event as processing.
   */
  async markProcessing(id: string): Promise<void> {
    await db
      .update(discordEventQueue)
      .set({
        status: "processing",
        last_attempt_at: new Date(),
        attempts: sql`${discordEventQueue.attempts} + 1`,
      })
      .where(eq(discordEventQueue.id, id));
  }

  /**
   * Mark event as completed.
   */
  async markCompleted(id: string): Promise<void> {
    await db
      .update(discordEventQueue)
      .set({
        status: "completed",
        completed_at: new Date(),
      })
      .where(eq(discordEventQueue.id, id));
  }

  /**
   * Mark event as failed.
   */
  async markFailed(id: string, errorMessage: string): Promise<void> {
    // Get current item to check attempts
    const [item] = await db
      .select()
      .from(discordEventQueue)
      .where(eq(discordEventQueue.id, id))
      .limit(1);

    if (!item) return;

    const newAttempts = (item.attempts ?? 0) + 1;
    const maxAttempts = item.max_attempts ?? 3;

    if (newAttempts >= maxAttempts) {
      // Move to dead letter
      await db
        .update(discordEventQueue)
        .set({
          status: "dead_letter",
          error_message: errorMessage,
          last_attempt_at: new Date(),
        })
        .where(eq(discordEventQueue.id, id));
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = Math.pow(2, newAttempts) * 1000; // 2s, 4s, 8s, etc.
      await db
        .update(discordEventQueue)
        .set({
          status: "pending",
          error_message: errorMessage,
          last_attempt_at: new Date(),
          process_after: new Date(Date.now() + retryDelay),
        })
        .where(eq(discordEventQueue.id, id));
    }
  }

  /**
   * Clean up old completed events.
   */
  async cleanupCompleted(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const result = await db
      .delete(discordEventQueue)
      .where(
        and(
          eq(discordEventQueue.status, "completed"),
          lt(discordEventQueue.completed_at, cutoff)
        )
      )
      .returning();
    return result.length;
  }

  /**
   * Get queue stats.
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    deadLetter: number;
  }> {
    const [stats] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
        processing: sql<number>`COUNT(*) FILTER (WHERE status = 'processing')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
        deadLetter: sql<number>`COUNT(*) FILTER (WHERE status = 'dead_letter')`,
      })
      .from(discordEventQueue);

    return {
      pending: Number(stats?.pending ?? 0),
      processing: Number(stats?.processing ?? 0),
      completed: Number(stats?.completed ?? 0),
      failed: Number(stats?.failed ?? 0),
      deadLetter: Number(stats?.deadLetter ?? 0),
    };
  }
}

// =============================================================================
// SINGLETON EXPORTS
// =============================================================================

export const discordBotConnectionsRepository = new DiscordBotConnectionsRepository();
export const discordEventRoutesRepository = new DiscordEventRoutesRepository();
export const discordEventQueueRepository = new DiscordEventQueueRepository();
