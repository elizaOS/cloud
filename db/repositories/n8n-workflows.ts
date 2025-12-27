/**
 * N8N Workflows Repository
 *
 * Direct database access for n8n workflow tables.
 */

import { db } from "@/db/client";
import {
  n8nInstances,
  n8nWorkflows,
  n8nWorkflowVersions,
  n8nWorkflowVariables,
  n8nWorkflowApiKeys,
  n8nWorkflowExecutions,
  n8nWorkflowTriggers,
  type N8nInstance,
  type NewN8nInstance,
  type N8nWorkflow,
  type NewN8nWorkflow,
  type N8nWorkflowVersion,
  type NewN8nWorkflowVersion,
  type N8nWorkflowVariable,
  type NewN8nWorkflowVariable,
  type N8nWorkflowApiKey,
  type NewN8nWorkflowApiKey,
  type N8nWorkflowExecution,
  type NewN8nWorkflowExecution,
  type N8nWorkflowTrigger,
  type NewN8nWorkflowTrigger,
} from "@/db/schemas/n8n-workflows";
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm";

// =============================================================================
// N8N INSTANCES REPOSITORY
// =============================================================================

export const n8nInstancesRepository = {
  async create(data: NewN8nInstance): Promise<N8nInstance> {
    const [instance] = await db.insert(n8nInstances).values(data).returning();
    return instance;
  },

  async findById(id: string): Promise<N8nInstance | undefined> {
    const [instance] = await db
      .select()
      .from(n8nInstances)
      .where(eq(n8nInstances.id, id))
      .limit(1);
    return instance;
  },

  async findByOrganization(organizationId: string): Promise<N8nInstance[]> {
    return db
      .select()
      .from(n8nInstances)
      .where(eq(n8nInstances.organization_id, organizationId))
      .orderBy(asc(n8nInstances.name));
  },

  async findDefaultByOrganization(
    organizationId: string,
  ): Promise<N8nInstance | undefined> {
    const [instance] = await db
      .select()
      .from(n8nInstances)
      .where(
        and(
          eq(n8nInstances.organization_id, organizationId),
          eq(n8nInstances.is_default, true),
        ),
      )
      .limit(1);
    return instance;
  },

  async update(
    id: string,
    data: Partial<NewN8nInstance>,
  ): Promise<N8nInstance | undefined> {
    const [updated] = await db
      .update(n8nInstances)
      .set({ ...data, updated_at: new Date() })
      .where(eq(n8nInstances.id, id))
      .returning();
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.delete(n8nInstances).where(eq(n8nInstances.id, id));
  },
};

// =============================================================================
// WORKFLOWS REPOSITORY
// =============================================================================

export const n8nWorkflowsRepository = {
  async create(data: NewN8nWorkflow): Promise<N8nWorkflow> {
    const [workflow] = await db.insert(n8nWorkflows).values(data).returning();
    return workflow;
  },

  async findById(id: string): Promise<N8nWorkflow | undefined> {
    const [workflow] = await db
      .select()
      .from(n8nWorkflows)
      .where(eq(n8nWorkflows.id, id))
      .limit(1);
    return workflow;
  },

  async findByOrganization(
    organizationId: string,
    options: {
      status?: "draft" | "active" | "archived";
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<N8nWorkflow[]> {
    const { status, limit = 100, offset = 0 } = options;
    const conditions = [eq(n8nWorkflows.organization_id, organizationId)];

    if (status) {
      conditions.push(eq(n8nWorkflows.status, status));
    }

    return db
      .select()
      .from(n8nWorkflows)
      .where(and(...conditions))
      .orderBy(desc(n8nWorkflows.updated_at))
      .limit(limit)
      .offset(offset);
  },

  async update(
    id: string,
    data: Partial<NewN8nWorkflow>,
  ): Promise<N8nWorkflow | undefined> {
    const [updated] = await db
      .update(n8nWorkflows)
      .set({ ...data, updated_at: new Date() })
      .where(eq(n8nWorkflows.id, id))
      .returning();
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.delete(n8nWorkflows).where(eq(n8nWorkflows.id, id));
  },

  async incrementVersion(id: string): Promise<N8nWorkflow | undefined> {
    const [updated] = await db
      .update(n8nWorkflows)
      .set({
        version: sql`${n8nWorkflows.version} + 1`,
        updated_at: new Date(),
      })
      .where(eq(n8nWorkflows.id, id))
      .returning();
    return updated;
  },
};

// =============================================================================
// WORKFLOW VERSIONS REPOSITORY
// =============================================================================

export const n8nWorkflowVersionsRepository = {
  async create(data: NewN8nWorkflowVersion): Promise<N8nWorkflowVersion> {
    const [version] = await db
      .insert(n8nWorkflowVersions)
      .values(data)
      .returning();
    return version;
  },

  async findByWorkflow(
    workflowId: string,
    limit: number = 50,
  ): Promise<N8nWorkflowVersion[]> {
    return db
      .select()
      .from(n8nWorkflowVersions)
      .where(eq(n8nWorkflowVersions.workflow_id, workflowId))
      .orderBy(desc(n8nWorkflowVersions.version))
      .limit(limit);
  },

  async findByWorkflowAndVersion(
    workflowId: string,
    version: number,
  ): Promise<N8nWorkflowVersion | undefined> {
    const [versionRecord] = await db
      .select()
      .from(n8nWorkflowVersions)
      .where(
        and(
          eq(n8nWorkflowVersions.workflow_id, workflowId),
          eq(n8nWorkflowVersions.version, version),
        ),
      )
      .limit(1);
    return versionRecord;
  },
};

// =============================================================================
// WORKFLOW VARIABLES REPOSITORY
// =============================================================================

export const n8nWorkflowVariablesRepository = {
  async create(data: NewN8nWorkflowVariable): Promise<N8nWorkflowVariable> {
    const [variable] = await db
      .insert(n8nWorkflowVariables)
      .values(data)
      .returning();
    return variable;
  },

  async findById(id: string): Promise<N8nWorkflowVariable | undefined> {
    const [variable] = await db
      .select()
      .from(n8nWorkflowVariables)
      .where(eq(n8nWorkflowVariables.id, id))
      .limit(1);
    return variable;
  },

  async findByOrganization(
    organizationId: string,
  ): Promise<N8nWorkflowVariable[]> {
    return db
      .select()
      .from(n8nWorkflowVariables)
      .where(
        and(
          eq(n8nWorkflowVariables.organization_id, organizationId),
          isNull(n8nWorkflowVariables.workflow_id),
        ),
      )
      .orderBy(asc(n8nWorkflowVariables.name));
  },

  async findByWorkflow(workflowId: string): Promise<N8nWorkflowVariable[]> {
    return db
      .select()
      .from(n8nWorkflowVariables)
      .where(eq(n8nWorkflowVariables.workflow_id, workflowId))
      .orderBy(asc(n8nWorkflowVariables.name));
  },

  async findByOrganizationAndName(
    organizationId: string,
    name: string,
    workflowId?: string,
  ): Promise<N8nWorkflowVariable | undefined> {
    const conditions = [
      eq(n8nWorkflowVariables.organization_id, organizationId),
      eq(n8nWorkflowVariables.name, name),
    ];

    if (workflowId) {
      conditions.push(eq(n8nWorkflowVariables.workflow_id, workflowId));
    } else {
      conditions.push(isNull(n8nWorkflowVariables.workflow_id));
    }

    const [variable] = await db
      .select()
      .from(n8nWorkflowVariables)
      .where(and(...conditions))
      .limit(1);
    return variable;
  },

  async update(
    id: string,
    data: Partial<NewN8nWorkflowVariable>,
  ): Promise<N8nWorkflowVariable | undefined> {
    const [updated] = await db
      .update(n8nWorkflowVariables)
      .set({ ...data, updated_at: new Date() })
      .where(eq(n8nWorkflowVariables.id, id))
      .returning();
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db
      .delete(n8nWorkflowVariables)
      .where(eq(n8nWorkflowVariables.id, id));
  },
};

// =============================================================================
// WORKFLOW API KEYS REPOSITORY
// =============================================================================

export const n8nWorkflowApiKeysRepository = {
  async create(data: NewN8nWorkflowApiKey): Promise<N8nWorkflowApiKey> {
    const [apiKey] = await db
      .insert(n8nWorkflowApiKeys)
      .values(data)
      .returning();
    return apiKey;
  },

  async findById(id: string): Promise<N8nWorkflowApiKey | undefined> {
    const [apiKey] = await db
      .select()
      .from(n8nWorkflowApiKeys)
      .where(eq(n8nWorkflowApiKeys.id, id))
      .limit(1);
    return apiKey;
  },

  async findByOrganization(
    organizationId: string,
  ): Promise<N8nWorkflowApiKey[]> {
    return db
      .select()
      .from(n8nWorkflowApiKeys)
      .where(
        and(
          eq(n8nWorkflowApiKeys.organization_id, organizationId),
          isNull(n8nWorkflowApiKeys.workflow_id),
        ),
      )
      .orderBy(desc(n8nWorkflowApiKeys.created_at));
  },

  async findByWorkflow(workflowId: string): Promise<N8nWorkflowApiKey[]> {
    return db
      .select()
      .from(n8nWorkflowApiKeys)
      .where(eq(n8nWorkflowApiKeys.workflow_id, workflowId))
      .orderBy(desc(n8nWorkflowApiKeys.created_at));
  },

  async findByKeyPrefix(
    keyPrefix: string,
  ): Promise<N8nWorkflowApiKey | undefined> {
    const [apiKey] = await db
      .select()
      .from(n8nWorkflowApiKeys)
      .where(eq(n8nWorkflowApiKeys.key_prefix, keyPrefix))
      .limit(1);
    return apiKey;
  },

  async update(
    id: string,
    data: Partial<NewN8nWorkflowApiKey>,
  ): Promise<N8nWorkflowApiKey | undefined> {
    const [updated] = await db
      .update(n8nWorkflowApiKeys)
      .set({ ...data, updated_at: new Date() })
      .where(eq(n8nWorkflowApiKeys.id, id))
      .returning();
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.delete(n8nWorkflowApiKeys).where(eq(n8nWorkflowApiKeys.id, id));
  },
};

// =============================================================================
// WORKFLOW EXECUTIONS REPOSITORY
// =============================================================================

export const n8nWorkflowExecutionsRepository = {
  async create(data: NewN8nWorkflowExecution): Promise<N8nWorkflowExecution> {
    const [execution] = await db
      .insert(n8nWorkflowExecutions)
      .values(data)
      .returning();
    return execution;
  },

  async findById(id: string): Promise<N8nWorkflowExecution | undefined> {
    const [execution] = await db
      .select()
      .from(n8nWorkflowExecutions)
      .where(eq(n8nWorkflowExecutions.id, id))
      .limit(1);
    return execution;
  },

  async findByWorkflow(
    workflowId: string,
    limit: number = 50,
  ): Promise<N8nWorkflowExecution[]> {
    return db
      .select()
      .from(n8nWorkflowExecutions)
      .where(eq(n8nWorkflowExecutions.workflow_id, workflowId))
      .orderBy(desc(n8nWorkflowExecutions.created_at))
      .limit(limit);
  },

  async update(
    id: string,
    data: Partial<NewN8nWorkflowExecution>,
  ): Promise<N8nWorkflowExecution | undefined> {
    const [updated] = await db
      .update(n8nWorkflowExecutions)
      .set(data)
      .where(eq(n8nWorkflowExecutions.id, id))
      .returning();
    return updated;
  },
};

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// =============================================================================
// WORKFLOW TRIGGERS REPOSITORY
// =============================================================================

export const n8nWorkflowTriggersRepository = {
  async create(data: NewN8nWorkflowTrigger): Promise<N8nWorkflowTrigger> {
    const [trigger] = await db
      .insert(n8nWorkflowTriggers)
      .values(data)
      .returning();
    return trigger;
  },

  async findById(id: string): Promise<N8nWorkflowTrigger | undefined> {
    const [trigger] = await db
      .select()
      .from(n8nWorkflowTriggers)
      .where(eq(n8nWorkflowTriggers.id, id))
      .limit(1);
    return trigger;
  },

  async findByWorkflow(workflowId: string): Promise<N8nWorkflowTrigger[]> {
    return db
      .select()
      .from(n8nWorkflowTriggers)
      .where(eq(n8nWorkflowTriggers.workflow_id, workflowId))
      .orderBy(desc(n8nWorkflowTriggers.created_at));
  },

  async findByTypeAndActive(
    triggerType: "cron" | "webhook" | "a2a" | "mcp",
    isActive: boolean = true,
  ): Promise<N8nWorkflowTrigger[]> {
    return db
      .select()
      .from(n8nWorkflowTriggers)
      .where(
        and(
          eq(n8nWorkflowTriggers.trigger_type, triggerType),
          eq(n8nWorkflowTriggers.is_active, isActive),
        ),
      )
      .orderBy(asc(n8nWorkflowTriggers.trigger_key));
  },

  async findByTriggerKey(
    triggerKey: string,
  ): Promise<N8nWorkflowTrigger | undefined> {
    const [trigger] = await db
      .select()
      .from(n8nWorkflowTriggers)
      .where(eq(n8nWorkflowTriggers.trigger_key, triggerKey))
      .limit(1);
    return trigger;
  },

  async update(
    id: string,
    data: Partial<NewN8nWorkflowTrigger>,
  ): Promise<N8nWorkflowTrigger | undefined> {
    const [updated] = await db
      .update(n8nWorkflowTriggers)
      .set({ ...data, updated_at: new Date() })
      .where(eq(n8nWorkflowTriggers.id, id))
      .returning();
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.delete(n8nWorkflowTriggers).where(eq(n8nWorkflowTriggers.id, id));
  },

  async incrementExecutionCount(id: string): Promise<void> {
    await db
      .update(n8nWorkflowTriggers)
      .set({
        execution_count: sql`${n8nWorkflowTriggers.execution_count} + 1`,
        last_executed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(n8nWorkflowTriggers.id, id));
  },

  async incrementErrorCount(id: string, errorMessage?: string): Promise<void> {
    await db
      .update(n8nWorkflowTriggers)
      .set({
        error_count: sql`${n8nWorkflowTriggers.error_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(n8nWorkflowTriggers.id, id));
  },

  async updateLastError(id: string, errorMessage: string): Promise<void> {
    await db
      .update(n8nWorkflowTriggers)
      .set({
        error_count: sql`${n8nWorkflowTriggers.error_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(n8nWorkflowTriggers.id, id));
  },

  async getTodayExecutionCount(triggerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(n8nWorkflowExecutions)
      .where(
        and(
          eq(n8nWorkflowExecutions.trigger_id, triggerId),
          sql`${n8nWorkflowExecutions.created_at} >= ${today}`,
        ),
      );

    return result[0]?.count ?? 0;
  },

  async findByOrganization(
    organizationId: string,
  ): Promise<N8nWorkflowTrigger[]> {
    return db
      .select()
      .from(n8nWorkflowTriggers)
      .where(eq(n8nWorkflowTriggers.organization_id, organizationId))
      .orderBy(desc(n8nWorkflowTriggers.created_at));
  },
};

export type {
  N8nInstance,
  NewN8nInstance,
  N8nWorkflow,
  NewN8nWorkflow,
  N8nWorkflowVersion,
  NewN8nWorkflowVersion,
  N8nWorkflowVariable,
  NewN8nWorkflowVariable,
  N8nWorkflowApiKey,
  NewN8nWorkflowApiKey,
  N8nWorkflowExecution,
  NewN8nWorkflowExecution,
  N8nWorkflowTrigger,
  NewN8nWorkflowTrigger,
} from "@/db/schemas/n8n-workflows";
