/**
 * Workflow Templates Repository
 *
 * Database operations for workflow templates including semantic search.
 * Enables Shaw's vision: search for similar workflows before generating new ones.
 */

import { db } from "@/db/client";
import { and, desc, eq, ilike, or, sql, isNull } from "drizzle-orm";
import {
  workflowTemplates,
  type WorkflowTemplate,
  type NewWorkflowTemplate,
} from "@/db/schemas/workflow-templates";

/**
 * Template search result with similarity score
 */
export interface TemplateSearchResult {
  template: WorkflowTemplate;
  similarity: number;
}

export const workflowTemplatesRepository = {
  /**
   * Create a new template
   */
  async create(template: NewWorkflowTemplate): Promise<WorkflowTemplate> {
    const [created] = await db
      .insert(workflowTemplates)
      .values(template)
      .returning();
    return created;
  },

  /**
   * Get template by ID
   */
  async getById(id: string): Promise<WorkflowTemplate | null> {
    const [template] = await db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, id))
      .limit(1);
    return template || null;
  },

  /**
   * List templates by organization
   */
  async listByOrganization(
    organizationId: string,
    options?: {
      category?: string;
      includePublic?: boolean;
      includeSystem?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<WorkflowTemplate[]> {
    const conditions = [];

    // Organization's own templates
    const orgCondition = eq(workflowTemplates.organization_id, organizationId);

    if (options?.includePublic || options?.includeSystem) {
      // Include org templates + public/system templates
      const orConditions = [orgCondition];

      if (options.includePublic) {
        orConditions.push(eq(workflowTemplates.is_public, true));
      }
      if (options.includeSystem) {
        orConditions.push(eq(workflowTemplates.is_system, true));
      }

      conditions.push(or(...orConditions));
    } else {
      conditions.push(orgCondition);
    }

    if (options?.category) {
      conditions.push(eq(workflowTemplates.category, options.category));
    }

    return db
      .select()
      .from(workflowTemplates)
      .where(and(...conditions))
      .orderBy(desc(workflowTemplates.usage_count))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * List public templates
   */
  async listPublic(options?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowTemplate[]> {
    const conditions = [eq(workflowTemplates.is_public, true)];

    if (options?.category) {
      conditions.push(eq(workflowTemplates.category, options.category));
    }

    if (options?.search) {
      const searchCondition = or(
        ilike(workflowTemplates.name, `%${options.search}%`),
        ilike(workflowTemplates.description, `%${options.search}%`),
        ilike(workflowTemplates.user_intent, `%${options.search}%`),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    return db
      .select()
      .from(workflowTemplates)
      .where(and(...conditions))
      .orderBy(desc(workflowTemplates.usage_count))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * Search templates by semantic similarity using pgvector
   *
   * @param embedding - The embedding vector to search for
   * @param organizationId - Organization ID for scoping
   * @param options - Search options
   */
  async searchBySimilarity(
    embedding: number[],
    organizationId?: string,
    options?: {
      minSimilarity?: number;
      limit?: number;
      includePublic?: boolean;
      includeSystem?: boolean;
    },
  ): Promise<TemplateSearchResult[]> {
    const minSimilarity = options?.minSimilarity ?? 0.7;
    const limit = options?.limit ?? 5;

    // Build the query conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (organizationId) {
      // Include org templates + optionally public/system
      const orConditions = [eq(workflowTemplates.organization_id, organizationId)];

      if (options?.includePublic !== false) {
        orConditions.push(eq(workflowTemplates.is_public, true));
      }
      if (options?.includeSystem !== false) {
        orConditions.push(eq(workflowTemplates.is_system, true));
      }

      const combined = or(...orConditions);
      if (combined) {
        conditions.push(combined as ReturnType<typeof eq>);
      }
    }

    // Convert embedding to pgvector format
    const embeddingStr = `[${embedding.join(",")}]`;

    // Query using cosine similarity
    // Note: We use 1 - cosine distance for similarity (higher = more similar)
    const results = await db.execute<{
      id: string;
      organization_id: string | null;
      source_workflow_id: string | null;
      name: string;
      description: string;
      user_intent: string;
      embedding: string | null;
      generated_code: string;
      execution_plan: unknown;
      service_dependencies: string[] | null;
      secret_requirements: unknown;
      tags: string[] | null;
      category: string | null;
      is_public: boolean;
      is_system: boolean;
      usage_count: number;
      success_count: number;
      success_rate: string | null;
      avg_execution_time_ms: number | null;
      created_at: Date;
      updated_at: Date;
      similarity: number;
    }>(sql`
      SELECT 
        *,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM workflow_templates
      WHERE embedding IS NOT NULL
        ${organizationId ? sql`AND (organization_id = ${organizationId} OR is_public = true OR is_system = true)` : sql``}
        AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${minSimilarity}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    // Map results to TemplateSearchResult
    return results.rows.map((row) => ({
      template: {
        id: row.id,
        organization_id: row.organization_id,
        source_workflow_id: row.source_workflow_id,
        name: row.name,
        description: row.description,
        user_intent: row.user_intent,
        embedding: row.embedding
          ? row.embedding
              .replace(/[\[\]]/g, "")
              .split(",")
              .map(Number)
          : null,
        generated_code: row.generated_code,
        execution_plan: row.execution_plan as WorkflowTemplate["execution_plan"],
        service_dependencies: row.service_dependencies,
        secret_requirements:
          row.secret_requirements as WorkflowTemplate["secret_requirements"],
        tags: row.tags,
        category: row.category,
        is_public: row.is_public,
        is_system: row.is_system,
        usage_count: row.usage_count,
        success_count: row.success_count,
        success_rate: row.success_rate,
        avg_execution_time_ms: row.avg_execution_time_ms,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      similarity: row.similarity,
    }));
  },

  /**
   * Update a template
   */
  async update(
    id: string,
    updates: Partial<Omit<WorkflowTemplate, "id" | "created_at">>,
  ): Promise<WorkflowTemplate | null> {
    const [updated] = await db
      .update(workflowTemplates)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(workflowTemplates.id, id))
      .returning();
    return updated || null;
  },

  /**
   * Increment usage count
   */
  async incrementUsage(id: string, success: boolean): Promise<void> {
    const template = await this.getById(id);
    if (!template) return;

    const newUsageCount = template.usage_count + 1;
    const newSuccessCount = template.success_count + (success ? 1 : 0);
    const successRate = (newSuccessCount / newUsageCount) * 100;

    await db
      .update(workflowTemplates)
      .set({
        usage_count: newUsageCount,
        success_count: newSuccessCount,
        success_rate: successRate.toFixed(2),
        updated_at: new Date(),
      })
      .where(eq(workflowTemplates.id, id));
  },

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    await db.delete(workflowTemplates).where(eq(workflowTemplates.id, id));
  },

  /**
   * Check if a template exists for a source workflow
   */
  async existsForWorkflow(sourceWorkflowId: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.source_workflow_id, sourceWorkflowId));
    return (result?.count ?? 0) > 0;
  },

  /**
   * Get template by source workflow ID
   */
  async getBySourceWorkflow(
    sourceWorkflowId: string,
  ): Promise<WorkflowTemplate | null> {
    const [template] = await db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.source_workflow_id, sourceWorkflowId))
      .limit(1);
    return template || null;
  },
};
