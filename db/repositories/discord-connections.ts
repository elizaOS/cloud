import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  discordConnections,
  type DiscordConnection,
  type NewDiscordConnection,
} from "@/db/schemas/discord-connections";

export const discordConnectionsRepository = {
  async create(data: NewDiscordConnection): Promise<DiscordConnection> {
    const [connection] = await db
      .insert(discordConnections)
      .values(data)
      .returning();
    return connection;
  },

  async findById(id: string): Promise<DiscordConnection | null> {
    const [connection] = await db
      .select()
      .from(discordConnections)
      .where(eq(discordConnections.id, id))
      .limit(1);
    return connection ?? null;
  },

  async findByOrganizationId(
    organizationId: string,
  ): Promise<DiscordConnection[]> {
    return db
      .select()
      .from(discordConnections)
      .where(eq(discordConnections.organization_id, organizationId));
  },

  async findByApplicationId(
    applicationId: string,
  ): Promise<DiscordConnection | null> {
    const [connection] = await db
      .select()
      .from(discordConnections)
      .where(eq(discordConnections.application_id, applicationId))
      .limit(1);
    return connection ?? null;
  },

  async findActiveUnassigned(): Promise<DiscordConnection[]> {
    return db
      .select()
      .from(discordConnections)
      .where(
        and(
          eq(discordConnections.is_active, true),
          isNull(discordConnections.assigned_pod),
        ),
      );
  },

  async findByAssignedPod(podName: string): Promise<DiscordConnection[]> {
    return db
      .select()
      .from(discordConnections)
      .where(
        and(
          eq(discordConnections.is_active, true),
          eq(discordConnections.assigned_pod, podName),
        ),
      );
  },

  async assignToPod(
    connectionId: string,
    podName: string,
  ): Promise<DiscordConnection | null> {
    const [connection] = await db
      .update(discordConnections)
      .set({
        assigned_pod: podName,
        status: "connecting",
        updated_at: new Date(),
      })
      .where(eq(discordConnections.id, connectionId))
      .returning();
    return connection ?? null;
  },

  async updateStatus(
    connectionId: string,
    status: string,
    errorMessage?: string,
  ): Promise<DiscordConnection | null> {
    const updates: Partial<DiscordConnection> = {
      status,
      updated_at: new Date(),
    };

    if (errorMessage !== undefined) {
      updates.error_message = errorMessage;
    }

    if (status === "connected") {
      updates.connected_at = new Date();
      updates.error_message = null;
    }

    if (status === "disconnected") {
      updates.assigned_pod = null;
    }

    const [connection] = await db
      .update(discordConnections)
      .set(updates)
      .where(eq(discordConnections.id, connectionId))
      .returning();
    return connection ?? null;
  },

  async updateHeartbeat(connectionId: string): Promise<void> {
    await db
      .update(discordConnections)
      .set({
        last_heartbeat: new Date(),
        updated_at: new Date(),
      })
      .where(eq(discordConnections.id, connectionId));
  },

  async updateStats(
    connectionId: string,
    stats: {
      guildCount?: number;
      eventsReceived?: number;
      eventsRouted?: number;
    },
  ): Promise<void> {
    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (stats.guildCount !== undefined) {
      updates.guild_count = stats.guildCount;
    }
    if (stats.eventsReceived !== undefined) {
      updates.events_received = stats.eventsReceived;
    }
    if (stats.eventsRouted !== undefined) {
      updates.events_routed = stats.eventsRouted;
    }

    await db
      .update(discordConnections)
      .set(updates)
      .where(eq(discordConnections.id, connectionId));
  },

  async reassignFromDeadPod(
    deadPodName: string,
    newPodName: string,
  ): Promise<number> {
    const result = await db
      .update(discordConnections)
      .set({
        assigned_pod: newPodName,
        status: "connecting",
        updated_at: new Date(),
      })
      .where(
        and(
          eq(discordConnections.assigned_pod, deadPodName),
          eq(discordConnections.is_active, true),
        ),
      )
      .returning();
    return result.length;
  },

  async clearPodAssignments(podName: string): Promise<number> {
    const result = await db
      .update(discordConnections)
      .set({
        assigned_pod: null,
        status: "disconnected",
        updated_at: new Date(),
      })
      .where(eq(discordConnections.assigned_pod, podName))
      .returning();
    return result.length;
  },

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(discordConnections)
      .where(eq(discordConnections.id, id))
      .returning();
    return result.length > 0;
  },

  async deactivate(id: string): Promise<DiscordConnection | null> {
    const [connection] = await db
      .update(discordConnections)
      .set({
        is_active: false,
        assigned_pod: null,
        status: "disconnected",
        updated_at: new Date(),
      })
      .where(eq(discordConnections.id, id))
      .returning();
    return connection ?? null;
  },

  async getAssignmentsForPod(
    podName: string,
  ): Promise<
    Array<{
      connectionId: string;
      organizationId: string;
      applicationId: string;
      botToken: string;
      intents: number;
    }>
  > {
    // First, get any unassigned connections and assign them to this pod
    const unassigned = await this.findActiveUnassigned();

    // Simple round-robin: assign first unassigned to requesting pod
    if (unassigned.length > 0) {
      await this.assignToPod(unassigned[0].id, podName);
    }

    // Get all connections assigned to this pod
    const connections = await this.findByAssignedPod(podName);

    return connections.map((conn) => ({
      connectionId: conn.id,
      organizationId: conn.organization_id,
      applicationId: conn.application_id,
      botToken: conn.bot_token_encrypted, // Will be decrypted by caller
      intents: conn.intents ?? 3276799,
    }));
  },
};
