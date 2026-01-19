import { dbRead, dbWrite } from "../helpers";
import {
  workflows,
  workflowRuns,
  type Workflow,
  type NewWorkflow,
  type WorkflowStatus,
  type WorkflowRun,
  type NewWorkflowRun,
  type NodeExecutionResult,
  type WorkflowRunTriggerSource,
} from "../schemas";
import { eq, and, desc } from "drizzle-orm";

export type { Workflow, NewWorkflow, WorkflowRun, NewWorkflowRun };

/**
 * Repository for workflow database operations.
 *
 * Handles CRUD operations for workflows.
 *
 * Read operations → dbRead (read replica)
 * Write operations → dbWrite (NA primary)
 */
export class WorkflowsRepository {
  // ============================================================================
  // READ OPERATIONS (use read replica)
  // ============================================================================

  /**
   * Finds a workflow by ID.
   */
  async findById(id: string): Promise<Workflow | undefined> {
    return await dbRead.query.workflows.findFirst({
      where: eq(workflows.id, id),
    });
  }

  /**
   * Finds a workflow by ID with organization verification.
   */
  async findByIdAndOrganization(
    id: string,
    organizationId: string,
  ): Promise<Workflow | undefined> {
    return await dbRead.query.workflows.findFirst({
      where: and(
        eq(workflows.id, id),
        eq(workflows.organization_id, organizationId),
      ),
    });
  }

  /**
   * Lists all workflows for an organization, ordered by creation date.
   */
  async listByOrganization(
    organizationId: string,
    options?: {
      status?: WorkflowStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<Workflow[]> {
    const conditions = [eq(workflows.organization_id, organizationId)];

    if (options?.status) {
      conditions.push(eq(workflows.status, options.status));
    }

    return await dbRead.query.workflows.findMany({
      where: and(...conditions),
      orderBy: [desc(workflows.created_at)],
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  /**
   * Counts workflows for an organization.
   */
  async countByOrganization(
    organizationId: string,
    status?: WorkflowStatus,
  ): Promise<number> {
    const conditions = [eq(workflows.organization_id, organizationId)];

    if (status) {
      conditions.push(eq(workflows.status, status));
    }

    const result = await dbRead.query.workflows.findMany({
      where: and(...conditions),
      columns: { id: true },
    });

    return result.length;
  }

  /**
   * Lists all active workflows with schedule triggers.
   * Used by the scheduler to check for workflows that need to run.
   */
  async listScheduledWorkflows(): Promise<Workflow[]> {
    const allActive = await dbRead.query.workflows.findMany({
      where: eq(workflows.status, "active"),
    });

    // Filter to only schedule triggers (JSON filtering in JS)
    return allActive.filter(
      (w) => w.trigger_config.type === "schedule" && w.trigger_config.schedule,
    );
  }

  // ============================================================================
  // WRITE OPERATIONS (use NA primary)
  // ============================================================================

  /**
   * Creates a new workflow.
   */
  async create(data: NewWorkflow): Promise<Workflow> {
    const [workflow] = await dbWrite.insert(workflows).values(data).returning();
    return workflow;
  }

  /**
   * Updates an existing workflow.
   */
  async update(
    id: string,
    data: Partial<NewWorkflow>,
  ): Promise<Workflow | undefined> {
    const [updated] = await dbWrite
      .update(workflows)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(workflows.id, id))
      .returning();
    return updated;
  }

  /**
   * Updates a workflow with organization verification.
   */
  async updateByOrganization(
    id: string,
    organizationId: string,
    data: Partial<NewWorkflow>,
  ): Promise<Workflow | undefined> {
    const [updated] = await dbWrite
      .update(workflows)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(workflows.id, id),
          eq(workflows.organization_id, organizationId),
        ),
      )
      .returning();
    return updated;
  }

  /**
   * Deletes a workflow by ID.
   */
  async delete(id: string): Promise<void> {
    await dbWrite.delete(workflows).where(eq(workflows.id, id));
  }

  /**
   * Deletes a workflow with organization verification.
   */
  async deleteByOrganization(
    id: string,
    organizationId: string,
  ): Promise<boolean> {
    const result = await dbWrite
      .delete(workflows)
      .where(
        and(
          eq(workflows.id, id),
          eq(workflows.organization_id, organizationId),
        ),
      )
      .returning({ id: workflows.id });
    return result.length > 0;
  }
}

/**
 * Singleton instance of WorkflowsRepository.
 */
export const workflowsRepository = new WorkflowsRepository();

/**
 * Repository for workflow run database operations.
 *
 * Handles CRUD operations for workflow execution history.
 */
export class WorkflowRunsRepository {
  // ============================================================================
  // READ OPERATIONS (use read replica)
  // ============================================================================

  /**
   * Finds a workflow run by ID.
   */
  async findById(id: string): Promise<WorkflowRun | undefined> {
    return await dbRead.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, id),
    });
  }

  /**
   * Lists recent runs for a workflow, ordered by creation date (most recent first).
   */
  async listByWorkflow(
    workflowId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowRun[]> {
    return await dbRead.query.workflowRuns.findMany({
      where: eq(workflowRuns.workflow_id, workflowId),
      orderBy: [desc(workflowRuns.created_at)],
      limit: options?.limit ?? 20,
      offset: options?.offset,
    });
  }

  /**
   * Gets the most recent run for a workflow.
   */
  async getLatestRun(workflowId: string): Promise<WorkflowRun | undefined> {
    return await dbRead.query.workflowRuns.findFirst({
      where: eq(workflowRuns.workflow_id, workflowId),
      orderBy: [desc(workflowRuns.created_at)],
    });
  }

  // ============================================================================
  // WRITE OPERATIONS (use NA primary)
  // ============================================================================

  /**
   * Creates a new workflow run record.
   */
  async create(data: {
    workflowId: string;
    triggerSource: WorkflowRunTriggerSource;
  }): Promise<WorkflowRun> {
    const [run] = await dbWrite
      .insert(workflowRuns)
      .values({
        workflow_id: data.workflowId,
        trigger_source: data.triggerSource,
        status: "running",
        started_at: new Date(),
      })
      .returning();
    return run;
  }

  /**
   * Updates a workflow run with execution results.
   */
  async complete(
    id: string,
    data: {
      status: "success" | "error";
      nodeResults: NodeExecutionResult[];
      error?: string;
    },
  ): Promise<WorkflowRun | undefined> {
    const [updated] = await dbWrite
      .update(workflowRuns)
      .set({
        status: data.status,
        node_results: data.nodeResults,
        error: data.error,
        completed_at: new Date(),
      })
      .where(eq(workflowRuns.id, id))
      .returning();
    return updated;
  }

  /**
   * Deletes old runs for a workflow, keeping only the most recent N runs.
   */
  async pruneOldRuns(workflowId: string, keepCount: number = 50): Promise<void> {
    const allRuns = await dbRead.query.workflowRuns.findMany({
      where: eq(workflowRuns.workflow_id, workflowId),
      orderBy: [desc(workflowRuns.created_at)],
      columns: { id: true },
    });

    if (allRuns.length > keepCount) {
      const idsToDelete = allRuns.slice(keepCount).map((r) => r.id);
      for (const id of idsToDelete) {
        await dbWrite.delete(workflowRuns).where(eq(workflowRuns.id, id));
      }
    }
  }
}

/**
 * Singleton instance of WorkflowRunsRepository.
 */
export const workflowRunsRepository = new WorkflowRunsRepository();
