/**
 * LLM trajectory logging service for Eliza Cloud.
 *
 * Records every LLM call that passes through Cloud for training data collection.
 * Integrates with the existing ai-billing flow — called from recordUsageAnalytics().
 *
 * Usage:
 *   await llmTrajectoryService.logCall({...})
 *   const trajectories = await llmTrajectoryService.listByOrganization(orgId, {...})
 *   const jsonl = await llmTrajectoryService.exportAsTrainingJSONL(orgId, {...})
 */

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  llmTrajectories,
  type NewLlmTrajectory,
} from "@/db/schemas/llm-trajectories";

export interface LogCallParams {
  organizationId: string;
  userId?: string | null;
  apiKeyId?: string | null;
  model: string;
  provider: string;
  purpose?: string;
  requestId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  responseText?: string;
  inputTokens?: number;
  outputTokens?: number;
  inputCost?: number;
  outputCost?: number;
  latencyMs?: number;
  isSuccessful?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface TrajectoryFilters {
  model?: string;
  purpose?: string;
  startDate?: Date;
  endDate?: Date;
  isSuccessful?: boolean;
  limit?: number;
  offset?: number;
}

export interface TrajectoryExportOptions {
  model?: string;
  purpose?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

class LlmTrajectoryService {
  /**
   * Log a single LLM call trajectory.
   */
  async logCall(params: LogCallParams): Promise<void> {
    const totalTokens = (params.inputTokens ?? 0) + (params.outputTokens ?? 0);
    const totalCost = (params.inputCost ?? 0) + (params.outputCost ?? 0);

    const record: NewLlmTrajectory = {
      organization_id: params.organizationId,
      user_id: params.userId ?? undefined,
      api_key_id: params.apiKeyId ?? undefined,
      model: params.model,
      provider: params.provider,
      purpose: params.purpose ?? null,
      request_id: params.requestId ?? null,
      system_prompt: params.systemPrompt ?? null,
      user_prompt: params.userPrompt ?? null,
      response_text: params.responseText ?? null,
      input_tokens: params.inputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      total_tokens: totalTokens,
      input_cost: params.inputCost?.toFixed(6) ?? "0.000000",
      output_cost: params.outputCost?.toFixed(6) ?? "0.000000",
      total_cost: totalCost.toFixed(6),
      latency_ms: params.latencyMs ?? null,
      is_successful: params.isSuccessful ?? true,
      error_message: params.errorMessage ?? null,
      metadata: params.metadata ?? {},
    };

    try {
      await db.insert(llmTrajectories).values(record);
    } catch (err) {
      // Log but don't throw — trajectory logging should never block the request
      console.error("[llm-trajectory] Failed to log call:", err);
    }
  }

  /**
   * List trajectories for an organization.
   */
  async listByOrganization(
    organizationId: string,
    filters: TrajectoryFilters = {},
  ) {
    const conditions = [eq(llmTrajectories.organization_id, organizationId)];

    if (filters.model) {
      conditions.push(eq(llmTrajectories.model, filters.model));
    }
    if (filters.purpose) {
      conditions.push(eq(llmTrajectories.purpose, filters.purpose));
    }
    if (filters.startDate) {
      conditions.push(gte(llmTrajectories.created_at, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(llmTrajectories.created_at, filters.endDate));
    }
    if (filters.isSuccessful !== undefined) {
      conditions.push(eq(llmTrajectories.is_successful, filters.isSuccessful));
    }

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const rows = await db
      .select()
      .from(llmTrajectories)
      .where(and(...conditions))
      .orderBy(desc(llmTrajectories.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(llmTrajectories)
      .where(and(...conditions));

    return {
      trajectories: rows,
      total: Number(countResult?.count ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Get aggregate stats for an organization's trajectories.
   */
  async getStats(organizationId: string) {
    const [result] = await db
      .select({
        total: sql<number>`count(*)`,
        totalInputTokens: sql<number>`coalesce(sum(input_tokens), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(output_tokens), 0)`,
        avgLatencyMs: sql<number>`coalesce(avg(latency_ms), 0)`,
        successCount: sql<number>`count(*) filter (where is_successful = true)`,
        failureCount: sql<number>`count(*) filter (where is_successful = false)`,
      })
      .from(llmTrajectories)
      .where(eq(llmTrajectories.organization_id, organizationId));

    const byPurpose = await db
      .select({
        purpose: llmTrajectories.purpose,
        count: sql<number>`count(*)`,
      })
      .from(llmTrajectories)
      .where(eq(llmTrajectories.organization_id, organizationId))
      .groupBy(llmTrajectories.purpose);

    const byModel = await db
      .select({
        model: llmTrajectories.model,
        count: sql<number>`count(*)`,
      })
      .from(llmTrajectories)
      .where(eq(llmTrajectories.organization_id, organizationId))
      .groupBy(llmTrajectories.model);

    return {
      total: Number(result?.total ?? 0),
      totalInputTokens: Number(result?.totalInputTokens ?? 0),
      totalOutputTokens: Number(result?.totalOutputTokens ?? 0),
      avgLatencyMs: Math.round(Number(result?.avgLatencyMs ?? 0)),
      successCount: Number(result?.successCount ?? 0),
      failureCount: Number(result?.failureCount ?? 0),
      byPurpose: byPurpose.map(
        (r: { purpose: string | null; count: unknown }) => ({
          purpose: r.purpose,
          count: Number(r.count),
        }),
      ),
      byModel: byModel.map((r: { model: string; count: unknown }) => ({
        model: r.model,
        count: Number(r.count),
      })),
    };
  }

  /**
   * Export trajectories as JSONL for Gemini supervised tuning.
   *
   * Each line is a JSON object with:
   * { messages: [ { role: "system", content: ... }, { role: "user", content: ... }, { role: "model", content: ... } ] }
   */
  async exportAsTrainingJSONL(
    organizationId: string,
    options: TrajectoryExportOptions = {},
  ): Promise<string> {
    const conditions = [eq(llmTrajectories.organization_id, organizationId)];
    conditions.push(eq(llmTrajectories.is_successful, true));

    if (options.model) {
      conditions.push(eq(llmTrajectories.model, options.model));
    }
    if (options.purpose) {
      conditions.push(eq(llmTrajectories.purpose, options.purpose));
    }
    if (options.startDate) {
      conditions.push(gte(llmTrajectories.created_at, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(llmTrajectories.created_at, options.endDate));
    }

    const rows = await db
      .select()
      .from(llmTrajectories)
      .where(and(...conditions))
      .orderBy(desc(llmTrajectories.created_at))
      .limit(options.limit ?? 10000);

    const lines: string[] = [];
    for (const row of rows) {
      if (!row.user_prompt || !row.response_text) continue;

      const messages: Array<{ role: string; content: string }> = [];

      if (row.system_prompt) {
        messages.push({ role: "system", content: row.system_prompt });
      }

      messages.push({ role: "user", content: row.user_prompt });
      messages.push({ role: "model", content: row.response_text });

      lines.push(JSON.stringify({ messages }));
    }

    return lines.join("\n");
  }
}

export const llmTrajectoryService = new LlmTrajectoryService();
