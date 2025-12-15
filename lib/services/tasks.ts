/**
 * Tasks Service
 *
 * Manages tasks that can be created via web UI, Discord, or Telegram.
 * Generic cloud capability for cross-platform task management.
 */

import { and, desc, eq, gte, isNull, lte, or, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  orgTodos,
  OrgTodo,
  NewOrgTodo,
  orgTodoStatusEnum,
  orgTodoPriorityEnum,
} from "@/db/schemas/org-platforms";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoPriority = "low" | "medium" | "high" | "urgent";
export type TodoPlatform = "web" | "discord" | "telegram";

export interface CreateTodoParams {
  organizationId: string;
  title: string;
  description?: string;
  priority?: TodoPriority;
  dueDate?: Date;
  assigneePlatformId?: string;
  assigneePlatform?: "discord" | "telegram";
  assigneeName?: string;
  tags?: string[];
  createdByUserId?: string;
  sourcePlatform?: TodoPlatform;
  sourceServerId?: string;
  sourceChannelId?: string;
  sourceMessageId?: string;
  relatedProject?: string;
}

export interface UpdateTodoParams {
  title?: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: Date | null;
  assigneePlatformId?: string | null;
  assigneePlatform?: "discord" | "telegram" | null;
  assigneeName?: string | null;
  tags?: string[];
  relatedProject?: string | null;
}

export interface ListTodosParams {
  organizationId: string;
  status?: TodoStatus | TodoStatus[];
  priority?: TodoPriority | TodoPriority[];
  assigneePlatformId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  tags?: string[];
  sourcePlatform?: TodoPlatform;
  sourceServerId?: string;
  createdByUserId?: string;
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "due_date" | "priority" | "updated_at";
  orderDir?: "asc" | "desc";
}

export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class TasksService {
  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new todo
   */
  async create(params: CreateTodoParams): Promise<OrgTodo> {
    logger.info("[Tasks] Creating todo", {
      organizationId: params.organizationId,
      title: params.title,
      sourcePlatform: params.sourcePlatform,
    });

    const [todo] = await db
      .insert(orgTodos)
      .values({
        organization_id: params.organizationId,
        title: params.title,
        description: params.description,
        priority: params.priority || "medium",
        due_date: params.dueDate,
        assignee_platform_id: params.assigneePlatformId,
        assignee_platform: params.assigneePlatform,
        assignee_name: params.assigneeName,
        tags: params.tags || [],
        created_by_user_id: params.createdByUserId,
        source_platform: params.sourcePlatform || "web",
        source_server_id: params.sourceServerId,
        source_channel_id: params.sourceChannelId,
        source_message_id: params.sourceMessageId,
        related_project: params.relatedProject,
      })
      .returning();

    return todo;
  }

  /**
   * Get a todo by ID
   */
  async get(todoId: string, organizationId: string): Promise<OrgTodo | null> {
    const [todo] = await db
      .select()
      .from(orgTodos)
      .where(
        and(
          eq(orgTodos.id, todoId),
          eq(orgTodos.organization_id, organizationId),
        ),
      )
      .limit(1);

    return todo || null;
  }

  /**
   * Update a todo
   */
  async update(
    todoId: string,
    organizationId: string,
    updates: UpdateTodoParams,
  ): Promise<OrgTodo> {
    logger.info("[Tasks] Updating todo", {
      todoId,
      organizationId,
      updates: Object.keys(updates),
    });

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.due_date !== undefined) updateData.due_date = updates.dueDate;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.relatedProject !== undefined)
      updateData.related_project = updates.relatedProject;

    // Handle assignee updates
    if (updates.assigneePlatformId !== undefined) {
      updateData.assignee_platform_id = updates.assigneePlatformId;
    }
    if (updates.assigneePlatform !== undefined) {
      updateData.assignee_platform = updates.assigneePlatform;
    }
    if (updates.assigneeName !== undefined) {
      updateData.assignee_name = updates.assigneeName;
    }

    // Handle status changes
    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === "completed") {
        updateData.completed_at = new Date();
      } else {
        updateData.completed_at = null;
      }
    }

    const [updated] = await db
      .update(orgTodos)
      .set(updateData)
      .where(
        and(
          eq(orgTodos.id, todoId),
          eq(orgTodos.organization_id, organizationId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Todo not found");
    }

    return updated;
  }

  /**
   * Delete a todo
   */
  async delete(todoId: string, organizationId: string): Promise<void> {
    logger.info("[Tasks] Deleting todo", { todoId, organizationId });

    const result = await db
      .delete(orgTodos)
      .where(
        and(
          eq(orgTodos.id, todoId),
          eq(orgTodos.organization_id, organizationId),
        ),
      );
  }

  /**
   * List todos with filters
   */
  async list(
    params: ListTodosParams,
  ): Promise<{ todos: OrgTodo[]; total: number }> {
    const {
      organizationId,
      status,
      priority,
      assigneePlatformId,
      dueBefore,
      dueAfter,
      tags,
      sourcePlatform,
      sourceServerId,
      createdByUserId,
      limit = 50,
      offset = 0,
      orderBy = "created_at",
      orderDir = "desc",
    } = params;

    // Build conditions
    const conditions = [eq(orgTodos.organization_id, organizationId)];

    if (status) {
      if (Array.isArray(status)) {
        conditions.push(inArray(orgTodos.status, status));
      } else {
        conditions.push(eq(orgTodos.status, status));
      }
    }

    if (priority) {
      if (Array.isArray(priority)) {
        conditions.push(inArray(orgTodos.priority, priority));
      } else {
        conditions.push(eq(orgTodos.priority, priority));
      }
    }

    if (assigneePlatformId) {
      conditions.push(eq(orgTodos.assignee_platform_id, assigneePlatformId));
    }

    if (dueBefore) {
      conditions.push(lte(orgTodos.due_date, dueBefore));
    }

    if (dueAfter) {
      conditions.push(gte(orgTodos.due_date, dueAfter));
    }

    if (sourcePlatform) {
      conditions.push(eq(orgTodos.source_platform, sourcePlatform));
    }

    if (sourceServerId) {
      conditions.push(eq(orgTodos.source_server_id, sourceServerId));
    }

    if (createdByUserId) {
      conditions.push(eq(orgTodos.created_by_user_id, createdByUserId));
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgTodos)
      .where(and(...conditions));

    // Build order clause
    const orderColumn = {
      created_at: orgTodos.created_at,
      due_date: orgTodos.due_date,
      priority: orgTodos.priority,
      updated_at: orgTodos.updated_at,
    }[orderBy];

    const orderFn =
      orderDir === "desc" ? desc : (col: typeof orderColumn) => col;

    // Get todos
    const todos = await db
      .select()
      .from(orgTodos)
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);

    return { todos, total: count };
  }

  // ===========================================================================
  // STATUS OPERATIONS
  // ===========================================================================

  /**
   * Mark a todo as in progress
   */
  async startProgress(
    todoId: string,
    organizationId: string,
  ): Promise<OrgTodo> {
    return this.update(todoId, organizationId, { status: "in_progress" });
  }

  /**
   * Mark a todo as completed
   */
  async complete(todoId: string, organizationId: string): Promise<OrgTodo> {
    return this.update(todoId, organizationId, { status: "completed" });
  }

  /**
   * Mark a todo as cancelled
   */
  async cancel(todoId: string, organizationId: string): Promise<OrgTodo> {
    return this.update(todoId, organizationId, { status: "cancelled" });
  }

  /**
   * Reopen a completed/cancelled todo
   */
  async reopen(todoId: string, organizationId: string): Promise<OrgTodo> {
    return this.update(todoId, organizationId, { status: "pending" });
  }

  // ===========================================================================
  // ASSIGNMENT OPERATIONS
  // ===========================================================================

  /**
   * Assign a todo to a platform user
   */
  async assign(
    todoId: string,
    organizationId: string,
    assignee: {
      platformId: string;
      platform: "discord" | "telegram";
      name?: string;
    },
  ): Promise<OrgTodo> {
    return this.update(todoId, organizationId, {
      assigneePlatformId: assignee.platformId,
      assigneePlatform: assignee.platform,
      assigneeName: assignee.name,
    });
  }

  /**
   * Unassign a todo
   */
  async unassign(todoId: string, organizationId: string): Promise<OrgTodo> {
    return this.update(todoId, organizationId, {
      assigneePlatformId: null,
      assigneePlatform: null,
      assigneeName: null,
    });
  }

  // ===========================================================================
  // STATS & QUERIES
  // ===========================================================================

  /**
   * Get todo statistics for an organization
   */
  async getStats(organizationId: string): Promise<TodoStats> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const [result] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${orgTodos.status} = 'pending')::int`,
        inProgress: sql<number>`count(*) filter (where ${orgTodos.status} = 'in_progress')::int`,
        completed: sql<number>`count(*) filter (where ${orgTodos.status} = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where ${orgTodos.status} = 'cancelled')::int`,
        overdue: sql<number>`count(*) filter (where ${orgTodos.due_date} < ${now} and ${orgTodos.status} not in ('completed', 'cancelled'))::int`,
        dueToday: sql<number>`count(*) filter (where ${orgTodos.due_date} >= ${today} and ${orgTodos.due_date} < ${tomorrow})::int`,
        dueTomorrow: sql<number>`count(*) filter (where ${orgTodos.due_date} >= ${tomorrow} and ${orgTodos.due_date} < ${dayAfterTomorrow})::int`,
      })
      .from(orgTodos)
      .where(eq(orgTodos.organization_id, organizationId));

    return result;
  }

  /**
   * Get todos assigned to a specific platform user
   */
  async getAssignedTodos(
    organizationId: string,
    platformId: string,
    platform: "discord" | "telegram",
  ): Promise<OrgTodo[]> {
    return db
      .select()
      .from(orgTodos)
      .where(
        and(
          eq(orgTodos.organization_id, organizationId),
          eq(orgTodos.assignee_platform_id, platformId),
          eq(orgTodos.assignee_platform, platform),
          inArray(orgTodos.status, ["pending", "in_progress"]),
        ),
      )
      .orderBy(orgTodos.due_date, desc(orgTodos.priority));
  }

  /**
   * Get overdue todos
   */
  async getOverdueTodos(organizationId: string): Promise<OrgTodo[]> {
    const now = new Date();

    return db
      .select()
      .from(orgTodos)
      .where(
        and(
          eq(orgTodos.organization_id, organizationId),
          lte(orgTodos.due_date, now),
          inArray(orgTodos.status, ["pending", "in_progress"]),
        ),
      )
      .orderBy(orgTodos.due_date);
  }

  /**
   * Get todos by tag
   */
  async getTodosByTag(organizationId: string, tag: string): Promise<OrgTodo[]> {
    return db
      .select()
      .from(orgTodos)
      .where(
        and(
          eq(orgTodos.organization_id, organizationId),
          sql`${orgTodos.tags} @> ${JSON.stringify([tag])}::jsonb`,
        ),
      )
      .orderBy(desc(orgTodos.created_at));
  }

  /**
   * Search todos by title/description
   */
  async search(
    organizationId: string,
    query: string,
    limit = 20,
  ): Promise<OrgTodo[]> {
    const searchPattern = `%${query}%`;

    return db
      .select()
      .from(orgTodos)
      .where(
        and(
          eq(orgTodos.organization_id, organizationId),
          or(
            sql`${orgTodos.title} ilike ${searchPattern}`,
            sql`${orgTodos.description} ilike ${searchPattern}`,
          ),
        ),
      )
      .orderBy(desc(orgTodos.created_at))
      .limit(limit);
  }

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Bulk update todo status
   */
  async bulkUpdateStatus(
    todoIds: string[],
    organizationId: string,
    status: TodoStatus,
  ): Promise<number> {
    const result = await db
      .update(orgTodos)
      .set({
        status,
        updated_at: new Date(),
        completed_at: status === "completed" ? new Date() : null,
      })
      .where(
        and(
          inArray(orgTodos.id, todoIds),
          eq(orgTodos.organization_id, organizationId),
        ),
      );

    return todoIds.length;
  }

  /**
   * Bulk delete todos
   */
  async bulkDelete(todoIds: string[], organizationId: string): Promise<number> {
    await db
      .delete(orgTodos)
      .where(
        and(
          inArray(orgTodos.id, todoIds),
          eq(orgTodos.organization_id, organizationId),
        ),
      );

    return todoIds.length;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const tasksService = new TasksService();
