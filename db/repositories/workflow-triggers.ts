/**
 * Workflow Triggers Repository
 *
 * Database operations for workflow triggers that automatically execute
 * workflows based on incoming messages, schedules, or webhooks.
 */

import { db } from "@/db/client";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  workflowTriggers,
  type WorkflowTrigger,
  type NewWorkflowTrigger,
} from "@/db/schemas/workflow-triggers";

export const workflowTriggersRepository = {
  /**
   * Create a new trigger
   */
  async create(trigger: NewWorkflowTrigger): Promise<WorkflowTrigger> {
    const [created] = await db
      .insert(workflowTriggers)
      .values(trigger)
      .returning();
    return created;
  },

  /**
   * Get trigger by ID
   */
  async getById(id: string): Promise<WorkflowTrigger | null> {
    const [trigger] = await db
      .select()
      .from(workflowTriggers)
      .where(eq(workflowTriggers.id, id))
      .limit(1);
    return trigger || null;
  },

  /**
   * List triggers by workflow
   */
  async listByWorkflow(
    workflowId: string,
    options?: {
      isActive?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowTrigger[]> {
    const conditions = [eq(workflowTriggers.workflow_id, workflowId)];

    if (options?.isActive !== undefined) {
      conditions.push(eq(workflowTriggers.is_active, options.isActive));
    }

    return db
      .select()
      .from(workflowTriggers)
      .where(and(...conditions))
      .orderBy(desc(workflowTriggers.priority), desc(workflowTriggers.created_at))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * List triggers by organization
   */
  async listByOrganization(
    organizationId: string,
    options?: {
      isActive?: boolean;
      triggerType?: WorkflowTrigger["trigger_type"];
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowTrigger[]> {
    const conditions = [eq(workflowTriggers.organization_id, organizationId)];

    if (options?.isActive !== undefined) {
      conditions.push(eq(workflowTriggers.is_active, options.isActive));
    }

    if (options?.triggerType) {
      conditions.push(eq(workflowTriggers.trigger_type, options.triggerType));
    }

    return db
      .select()
      .from(workflowTriggers)
      .where(and(...conditions))
      .orderBy(desc(workflowTriggers.priority), desc(workflowTriggers.created_at))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  },

  /**
   * Get active triggers for an organization, sorted by priority
   * Used for trigger matching on incoming messages
   */
  async getActiveTriggersByOrg(
    organizationId: string,
    providerFilter?: "all" | "twilio" | "blooio" | "telegram",
  ): Promise<WorkflowTrigger[]> {
    const conditions = [
      eq(workflowTriggers.organization_id, organizationId),
      eq(workflowTriggers.is_active, true),
    ];

    // If provider filter is specified, get triggers that match "all" OR the specific provider
    if (providerFilter && providerFilter !== "all") {
      conditions.push(
        sql`(${workflowTriggers.provider_filter} = 'all' OR ${workflowTriggers.provider_filter} = ${providerFilter})`,
      );
    }

    return db
      .select()
      .from(workflowTriggers)
      .where(and(...conditions))
      .orderBy(desc(workflowTriggers.priority));
  },

  /**
   * Update a trigger
   */
  async update(
    id: string,
    updates: Partial<Omit<WorkflowTrigger, "id" | "created_at">>,
  ): Promise<WorkflowTrigger | null> {
    const [updated] = await db
      .update(workflowTriggers)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(workflowTriggers.id, id))
      .returning();
    return updated || null;
  },

  /**
   * Toggle trigger active status
   */
  async toggleActive(id: string): Promise<WorkflowTrigger | null> {
    const trigger = await this.getById(id);
    if (!trigger) return null;

    return this.update(id, { is_active: !trigger.is_active });
  },

  /**
   * Record trigger execution
   */
  async recordExecution(
    id: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const updates: Partial<WorkflowTrigger> = {
      trigger_count: sql`${workflowTriggers.trigger_count} + 1` as unknown as number,
      last_triggered_at: new Date(),
      updated_at: new Date(),
    };

    if (!success && error) {
      updates.last_error = error;
      updates.last_error_at = new Date();
    }

    await db
      .update(workflowTriggers)
      .set(updates)
      .where(eq(workflowTriggers.id, id));
  },

  /**
   * Clear trigger error
   */
  async clearError(id: string): Promise<void> {
    await db
      .update(workflowTriggers)
      .set({
        last_error: null,
        last_error_at: null,
        updated_at: new Date(),
      })
      .where(eq(workflowTriggers.id, id));
  },

  /**
   * Delete a trigger
   */
  async delete(id: string): Promise<void> {
    await db.delete(workflowTriggers).where(eq(workflowTriggers.id, id));
  },

  /**
   * Delete all triggers for a workflow
   */
  async deleteByWorkflow(workflowId: string): Promise<void> {
    await db
      .delete(workflowTriggers)
      .where(eq(workflowTriggers.workflow_id, workflowId));
  },

  /**
   * Get trigger statistics for organization
   */
  async getOrgStats(organizationId: string): Promise<{
    totalTriggers: number;
    activeTriggers: number;
    totalExecutions: number;
    triggersByType: Record<string, number>;
  }> {
    const [stats] = await db
      .select({
        totalTriggers: sql<number>`count(*)::int`,
        activeTriggers: sql<number>`count(*) filter (where ${workflowTriggers.is_active} = true)::int`,
        totalExecutions: sql<number>`sum(${workflowTriggers.trigger_count})::int`,
      })
      .from(workflowTriggers)
      .where(eq(workflowTriggers.organization_id, organizationId));

    const typeStats = await db
      .select({
        triggerType: workflowTriggers.trigger_type,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowTriggers)
      .where(eq(workflowTriggers.organization_id, organizationId))
      .groupBy(workflowTriggers.trigger_type);

    const triggersByType: Record<string, number> = {};
    for (const stat of typeStats) {
      triggersByType[stat.triggerType] = stat.count;
    }

    return {
      totalTriggers: stats?.totalTriggers ?? 0,
      activeTriggers: stats?.activeTriggers ?? 0,
      totalExecutions: stats?.totalExecutions ?? 0,
      triggersByType,
    };
  },

  /**
   * Check if a trigger name exists for a workflow
   */
  async nameExists(
    workflowId: string,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const conditions = [
      eq(workflowTriggers.workflow_id, workflowId),
      eq(workflowTriggers.name, name),
    ];

    if (excludeId) {
      conditions.push(sql`${workflowTriggers.id} != ${excludeId}`);
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowTriggers)
      .where(and(...conditions));

    return (result?.count ?? 0) > 0;
  },
};
