/**
 * Generated Workflows Repository
 *
 * Database operations for AI-generated workflows.
 */

import { db } from "@/db/client";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  generatedWorkflows,
  workflowExecutions,
  type GeneratedWorkflow,
  type NewGeneratedWorkflow,
  type WorkflowExecution,
  type NewWorkflowExecution,
} from "@/db/schemas/generated-workflows";

// ============================================================================
// Generated Workflows Repository
// ============================================================================

export const generatedWorkflowsRepository = {
  /**
   * Create a new workflow
   */
  async create(workflow: NewGeneratedWorkflow): Promise<GeneratedWorkflow> {
    const [created] = await db
      .insert(generatedWorkflows)
      .values(workflow)
      .returning();
    return created;
  },

  /**
   * Get workflow by ID
   */
  async getById(id: string): Promise<GeneratedWorkflow | null> {
    const [workflow] = await db
      .select()
      .from(generatedWorkflows)
      .where(eq(generatedWorkflows.id, id))
      .limit(1);
    return workflow || null;
  },

  /**
   * List workflows by organization
   */
  async listByOrganization(
    organizationId: string,
    options?: {
      status?: GeneratedWorkflow["status"];
      limit?: number;
      offset?: number;
    },
  ): Promise<GeneratedWorkflow[]> {
    const conditions = [
      eq(generatedWorkflows.organization_id, organizationId),
    ];

    if (options?.status) {
      conditions.push(eq(generatedWorkflows.status, options.status));
    }

    return db
      .select()
      .from(generatedWorkflows)
      .where(and(...conditions))
      .orderBy(desc(generatedWorkflows.created_at))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * List public workflows
   */
  async listPublic(options?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<GeneratedWorkflow[]> {
    const conditions = [
      eq(generatedWorkflows.is_public, true),
      eq(generatedWorkflows.status, "shared"),
    ];

    if (options?.category) {
      conditions.push(eq(generatedWorkflows.category, options.category));
    }

    if (options?.search) {
      const searchCondition = or(
        ilike(generatedWorkflows.name, `%${options.search}%`),
        ilike(generatedWorkflows.description, `%${options.search}%`),
        ilike(generatedWorkflows.user_intent, `%${options.search}%`),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    return db
      .select()
      .from(generatedWorkflows)
      .where(and(...conditions))
      .orderBy(desc(generatedWorkflows.usage_count))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * Update a workflow
   */
  async update(
    id: string,
    updates: Partial<Omit<GeneratedWorkflow, "id" | "created_at">>,
  ): Promise<GeneratedWorkflow | null> {
    const [updated] = await db
      .update(generatedWorkflows)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(generatedWorkflows.id, id))
      .returning();
    return updated || null;
  },

  /**
   * Update workflow status
   */
  async updateStatus(
    id: string,
    status: GeneratedWorkflow["status"],
  ): Promise<GeneratedWorkflow | null> {
    return this.update(id, { status });
  },

  /**
   * Increment usage count and update success rate
   */
  async incrementUsage(
    id: string,
    success: boolean,
    executionTimeMs?: number,
  ): Promise<void> {
    const workflow = await this.getById(id);
    if (!workflow) return;

    const newUsageCount = workflow.usage_count + 1;
    const newSuccessCount = workflow.success_count + (success ? 1 : 0);
    const newFailureCount = workflow.failure_count + (success ? 0 : 1);
    const successRate = (newSuccessCount / newUsageCount) * 100;

    // Calculate new average execution time
    let avgExecutionTime = workflow.avg_execution_time_ms;
    if (executionTimeMs !== undefined) {
      if (avgExecutionTime === null) {
        avgExecutionTime = executionTimeMs;
      } else {
        // Running average
        avgExecutionTime = Math.round(
          (avgExecutionTime * (newUsageCount - 1) + executionTimeMs) /
            newUsageCount,
        );
      }
    }

    await db
      .update(generatedWorkflows)
      .set({
        usage_count: newUsageCount,
        success_count: newSuccessCount,
        failure_count: newFailureCount,
        success_rate: successRate.toFixed(2),
        avg_execution_time_ms: avgExecutionTime,
        last_used_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(generatedWorkflows.id, id));
  },

  /**
   * Set MCP ID when workflow is shared
   */
  async setMcpId(id: string, mcpId: string): Promise<void> {
    await db
      .update(generatedWorkflows)
      .set({
        mcp_id: mcpId,
        status: "shared",
        is_public: true,
        shared_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(generatedWorkflows.id, id));
  },

  /**
   * Delete a workflow
   */
  async delete(id: string): Promise<void> {
    await db.delete(generatedWorkflows).where(eq(generatedWorkflows.id, id));
  },

  /**
   * Get workflows by service dependency
   */
  async getByServiceDependency(
    serviceId: string,
    organizationId?: string,
  ): Promise<GeneratedWorkflow[]> {
    const conditions = [
      sql`${generatedWorkflows.service_dependencies} @> ${JSON.stringify([serviceId])}::jsonb`,
    ];

    if (organizationId) {
      conditions.push(eq(generatedWorkflows.organization_id, organizationId));
    }

    return db
      .select()
      .from(generatedWorkflows)
      .where(and(...conditions))
      .orderBy(desc(generatedWorkflows.usage_count));
  },
};

// ============================================================================
// Workflow Executions Repository
// ============================================================================

export const workflowExecutionsRepository = {
  /**
   * Create a new execution record
   */
  async create(execution: NewWorkflowExecution): Promise<WorkflowExecution> {
    const [created] = await db
      .insert(workflowExecutions)
      .values(execution)
      .returning();
    return created;
  },

  /**
   * Get execution by ID
   */
  async getById(id: string): Promise<WorkflowExecution | null> {
    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, id))
      .limit(1);
    return execution || null;
  },

  /**
   * List executions for a workflow
   */
  async listByWorkflow(
    workflowId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowExecution[]> {
    const conditions = [eq(workflowExecutions.workflow_id, workflowId)];

    if (options?.status) {
      conditions.push(eq(workflowExecutions.status, options.status));
    }

    return db
      .select()
      .from(workflowExecutions)
      .where(and(...conditions))
      .orderBy(desc(workflowExecutions.started_at))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * Update execution
   */
  async update(
    id: string,
    updates: Partial<Omit<WorkflowExecution, "id" | "created_at">>,
  ): Promise<WorkflowExecution | null> {
    const [updated] = await db
      .update(workflowExecutions)
      .set(updates)
      .where(eq(workflowExecutions.id, id))
      .returning();
    return updated || null;
  },

  /**
   * Mark execution as completed
   */
  async complete(
    id: string,
    result: {
      success: boolean;
      data?: unknown;
      error?: string;
      message?: string;
    },
    executionTimeMs: number,
  ): Promise<void> {
    await db
      .update(workflowExecutions)
      .set({
        status: result.success ? "completed" : "failed",
        completed_at: new Date(),
        execution_time_ms: executionTimeMs,
        output_result: result,
        error_message: result.error,
      })
      .where(eq(workflowExecutions.id, id));
  },

  /**
   * Get execution stats for a workflow
   */
  async getStats(workflowId: string): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number | null;
  }> {
    const [stats] = await db
      .select({
        totalExecutions: sql<number>`count(*)::int`,
        successfulExecutions: sql<number>`count(*) filter (where ${workflowExecutions.status} = 'completed')::int`,
        failedExecutions: sql<number>`count(*) filter (where ${workflowExecutions.status} = 'failed')::int`,
        averageExecutionTime: sql<number | null>`avg(${workflowExecutions.execution_time_ms})::int`,
      })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflow_id, workflowId));

    return {
      totalExecutions: stats?.totalExecutions ?? 0,
      successfulExecutions: stats?.successfulExecutions ?? 0,
      failedExecutions: stats?.failedExecutions ?? 0,
      averageExecutionTime: stats?.averageExecutionTime ?? null,
    };
  },
};
