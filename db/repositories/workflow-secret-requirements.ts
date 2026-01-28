/**
 * Workflow Secret Requirements Repository
 *
 * Database operations for workflow secret requirements.
 * Enables dynamic credential validation for workflows.
 */

import { db } from "@/db/client";
import { and, eq, sql, inArray } from "drizzle-orm";
import {
  workflowSecretRequirements,
  type WorkflowSecretRequirement,
  type NewWorkflowSecretRequirement,
} from "@/db/schemas/workflow-secret-requirements";

export const workflowSecretRequirementsRepository = {
  /**
   * Create a new secret requirement
   */
  async create(
    requirement: NewWorkflowSecretRequirement,
  ): Promise<WorkflowSecretRequirement> {
    const [created] = await db
      .insert(workflowSecretRequirements)
      .values(requirement)
      .returning();
    return created;
  },

  /**
   * Create multiple requirements at once
   */
  async createMany(
    requirements: NewWorkflowSecretRequirement[],
  ): Promise<WorkflowSecretRequirement[]> {
    if (requirements.length === 0) return [];
    return db
      .insert(workflowSecretRequirements)
      .values(requirements)
      .returning();
  },

  /**
   * Get requirement by ID
   */
  async getById(id: string): Promise<WorkflowSecretRequirement | null> {
    const [requirement] = await db
      .select()
      .from(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.id, id))
      .limit(1);
    return requirement || null;
  },

  /**
   * Get all requirements for a workflow
   */
  async getByWorkflowId(
    workflowId: string,
  ): Promise<WorkflowSecretRequirement[]> {
    return db
      .select()
      .from(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.workflow_id, workflowId))
      .orderBy(workflowSecretRequirements.step_number);
  },

  /**
   * Get requirements for multiple workflows at once
   */
  async getByWorkflowIds(
    workflowIds: string[],
  ): Promise<WorkflowSecretRequirement[]> {
    if (workflowIds.length === 0) return [];
    return db
      .select()
      .from(workflowSecretRequirements)
      .where(inArray(workflowSecretRequirements.workflow_id, workflowIds));
  },

  /**
   * Get all workflows that require a specific provider
   */
  async getByProvider(provider: string): Promise<WorkflowSecretRequirement[]> {
    return db
      .select()
      .from(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.provider, provider));
  },

  /**
   * Get unique providers required by a workflow
   */
  async getUniqueProvidersByWorkflow(workflowId: string): Promise<string[]> {
    const results = await db
      .selectDistinct({ provider: workflowSecretRequirements.provider })
      .from(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.workflow_id, workflowId));
    return results.map((r) => r.provider);
  },

  /**
   * Check if a workflow has any requirements
   */
  async hasRequirements(workflowId: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.workflow_id, workflowId));
    return (result?.count ?? 0) > 0;
  },

  /**
   * Delete all requirements for a workflow
   */
  async deleteByWorkflowId(workflowId: string): Promise<void> {
    await db
      .delete(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.workflow_id, workflowId));
  },

  /**
   * Replace all requirements for a workflow
   * (deletes existing and inserts new)
   */
  async replaceForWorkflow(
    workflowId: string,
    requirements: Omit<NewWorkflowSecretRequirement, "workflow_id">[],
  ): Promise<WorkflowSecretRequirement[]> {
    // Delete existing
    await this.deleteByWorkflowId(workflowId);

    // Insert new
    if (requirements.length === 0) return [];

    const withWorkflowId = requirements.map((req) => ({
      ...req,
      workflow_id: workflowId,
    }));

    return this.createMany(withWorkflowId);
  },

  /**
   * Delete a specific requirement
   */
  async delete(id: string): Promise<void> {
    await db
      .delete(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.id, id));
  },

  /**
   * Get statistics about provider usage across all workflows
   */
  async getProviderStats(): Promise<
    Array<{ provider: string; workflow_count: number }>
  > {
    const results = await db
      .select({
        provider: workflowSecretRequirements.provider,
        workflow_count: sql<number>`count(distinct ${workflowSecretRequirements.workflow_id})::int`,
      })
      .from(workflowSecretRequirements)
      .groupBy(workflowSecretRequirements.provider)
      .orderBy(sql`count(distinct ${workflowSecretRequirements.workflow_id}) desc`);

    return results;
  },

  /**
   * Get all distinct workflow IDs that require a specific provider
   */
  async getWorkflowIdsRequiringProvider(provider: string): Promise<string[]> {
    const results = await db
      .selectDistinct({
        workflow_id: workflowSecretRequirements.workflow_id,
      })
      .from(workflowSecretRequirements)
      .where(eq(workflowSecretRequirements.provider, provider));
    return results.map((r) => r.workflow_id);
  },
};
