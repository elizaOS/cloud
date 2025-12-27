/**
 * Code Agent Analytics - Real-time stats for sessions and interpreter.
 */
import { db } from "@/db";
import {
  codeAgentSessions,
  codeAgentCommands,
  interpreterExecutions,
} from "@/db/schemas/code-agent-sessions";
import { eq, and, gte, lte, desc, sql, count, inArray } from "drizzle-orm";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

export interface CodeAgentStats {
  sessions: {
    total: number;
    active: number;
    terminated: number;
    errored: number;
  };
  commands: {
    total: number;
    successful: number;
    failed: number;
    avgDurationMs: number;
  };
  interpreter: {
    total: number;
    byLanguage: Record<string, number>;
    avgDurationMs: number;
    totalCostCents: number;
  };
  usage: {
    totalCpuSeconds: number;
    totalApiCalls: number;
    totalCommands: number;
    totalCostCents: number;
  };
}

export interface SessionAnalytics {
  sessionId: string;
  status: string;
  commandCount: number;
  successRate: number;
  avgCommandDurationMs: number;
  totalCostCents: number;
  filesCreated: number;
  filesModified: number;
  cpuSecondsUsed: number;
  memoryMbPeak: number;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface InterpreterAnalytics {
  language: string;
  executionCount: number;
  successRate: number;
  avgDurationMs: number;
  totalCostCents: number;
}

type DateRange = { start: Date; end: Date };

const toRecord = <
  T extends { status?: string; language?: string; count: unknown },
>(
  rows: T[],
  key: "status" | "language",
) => Object.fromEntries(rows.map((r) => [r[key], Number(r.count)]));

const sumCounts = (rec: Record<string, number>) =>
  Object.values(rec).reduce((a, b) => a + b, 0);

class CodeAgentAnalyticsService {
  async getStats(orgId: string, range?: DateRange): Promise<CodeAgentStats> {
    const rangeKey = range
      ? `${range.start.toISOString()}-${range.end.toISOString()}`
      : "all";
    const cacheKey = CacheKeys.codeAgent.analytics(orgId, rangeKey);
    const cached = await cache.get<CodeAgentStats>(cacheKey);
    if (cached) return cached;

    const [sessions, commands, interpreter] = await Promise.all([
      this.getSessionStats(orgId, range),
      this.getCommandStats(orgId, range),
      this.getInterpreterStats(orgId, range),
    ]);

    const stats: CodeAgentStats = {
      sessions,
      commands,
      interpreter,
      usage: {
        totalCpuSeconds:
          sessions.total > 0 ? await this.getTotalCpuSeconds(orgId, range) : 0,
        totalApiCalls: commands.total,
        totalCommands: commands.total,
        totalCostCents: interpreter.totalCostCents,
      },
    };

    await cache.set(cacheKey, stats, CacheTTL.codeAgent.analytics);
    return stats;
  }

  private async getSessionStats(orgId: string, range?: DateRange) {
    const cond = [eq(codeAgentSessions.organization_id, orgId)];
    if (range)
      cond.push(
        gte(codeAgentSessions.created_at, range.start),
        lte(codeAgentSessions.created_at, range.end),
      );

    const rows = await db
      .select({ status: codeAgentSessions.status, count: count() })
      .from(codeAgentSessions)
      .where(and(...cond))
      .groupBy(codeAgentSessions.status);

    const c = toRecord(rows, "status");
    return {
      total: sumCounts(c),
      active: (c["ready"] || 0) + (c["executing"] || 0),
      terminated: c["terminated"] || 0,
      errored: c["error"] || 0,
    };
  }

  private async getCommandStats(orgId: string, range?: DateRange) {
    const sessions = await db
      .select({ id: codeAgentSessions.id })
      .from(codeAgentSessions)
      .where(eq(codeAgentSessions.organization_id, orgId));
    if (!sessions.length)
      return { total: 0, successful: 0, failed: 0, avgDurationMs: 0 };

    const ids = sessions.map((s) => s.id);
    const cond = [inArray(codeAgentCommands.session_id, ids)];
    if (range)
      cond.push(
        gte(codeAgentCommands.created_at, range.start),
        lte(codeAgentCommands.created_at, range.end),
      );

    const [statusRows, [dur]] = await Promise.all([
      db
        .select({ status: codeAgentCommands.status, count: count() })
        .from(codeAgentCommands)
        .where(and(...cond))
        .groupBy(codeAgentCommands.status),
      db
        .select({ avg: sql<number>`AVG(${codeAgentCommands.duration_ms})` })
        .from(codeAgentCommands)
        .where(and(...cond)),
    ]);

    const c = toRecord(statusRows, "status");
    return {
      total: sumCounts(c),
      successful: c["success"] || 0,
      failed: (c["error"] || 0) + (c["timeout"] || 0),
      avgDurationMs: dur?.avg || 0,
    };
  }

  private async getInterpreterStats(orgId: string, range?: DateRange) {
    const cond = [eq(interpreterExecutions.organization_id, orgId)];
    if (range)
      cond.push(
        gte(interpreterExecutions.created_at, range.start),
        lte(interpreterExecutions.created_at, range.end),
      );

    const [langRows, [agg]] = await Promise.all([
      db
        .select({ language: interpreterExecutions.language, count: count() })
        .from(interpreterExecutions)
        .where(and(...cond))
        .groupBy(interpreterExecutions.language),
      db
        .select({
          total: count(),
          avg: sql<number>`AVG(${interpreterExecutions.duration_ms})`,
          cost: sql<number>`SUM(${interpreterExecutions.cost_cents})`,
        })
        .from(interpreterExecutions)
        .where(and(...cond)),
    ]);

    return {
      total: Number(agg?.total || 0),
      byLanguage: toRecord(langRows, "language"),
      avgDurationMs: agg?.avg || 0,
      totalCostCents: agg?.cost || 0,
    };
  }

  private async getTotalCpuSeconds(
    orgId: string,
    range?: DateRange,
  ): Promise<number> {
    const cond = [eq(codeAgentSessions.organization_id, orgId)];
    if (range)
      cond.push(
        gte(codeAgentSessions.created_at, range.start),
        lte(codeAgentSessions.created_at, range.end),
      );
    const [r] = await db
      .select({ t: sql<number>`SUM(${codeAgentSessions.cpu_seconds_used})` })
      .from(codeAgentSessions)
      .where(and(...cond));
    return r?.t || 0;
  }

  async getSessionAnalytics(
    sessionId: string,
    orgId: string,
  ): Promise<SessionAnalytics | null> {
    const [session] = await db
      .select()
      .from(codeAgentSessions)
      .where(
        and(
          eq(codeAgentSessions.id, sessionId),
          eq(codeAgentSessions.organization_id, orgId),
        ),
      )
      .limit(1);
    if (!session) return null;

    const [cs] = await db
      .select({
        total: count(),
        ok: sql<number>`SUM(CASE WHEN ${codeAgentCommands.status} = 'success' THEN 1 ELSE 0 END)`,
        avg: sql<number>`AVG(${codeAgentCommands.duration_ms})`,
      })
      .from(codeAgentCommands)
      .where(eq(codeAgentCommands.session_id, sessionId));

    const t = Number(cs?.total || 0),
      ok = Number(cs?.ok || 0);
    return {
      sessionId: session.id,
      status: session.status,
      commandCount: t,
      successRate: t > 0 ? ok / t : 0,
      avgCommandDurationMs: cs?.avg || 0,
      totalCostCents: session.estimated_cost_cents,
      filesCreated: session.files_created,
      filesModified: session.files_modified,
      cpuSecondsUsed: session.cpu_seconds_used,
      memoryMbPeak: session.memory_mb_peak,
      createdAt: session.created_at,
      lastActivityAt: session.last_activity_at,
    };
  }

  async getInterpreterAnalytics(
    orgId: string,
    range?: DateRange,
  ): Promise<InterpreterAnalytics[]> {
    const cond = [eq(interpreterExecutions.organization_id, orgId)];
    if (range)
      cond.push(
        gte(interpreterExecutions.created_at, range.start),
        lte(interpreterExecutions.created_at, range.end),
      );

    const rows = await db
      .select({
        language: interpreterExecutions.language,
        total: count(),
        ok: sql<number>`SUM(CASE WHEN ${interpreterExecutions.status} = 'success' THEN 1 ELSE 0 END)`,
        avg: sql<number>`AVG(${interpreterExecutions.duration_ms})`,
        cost: sql<number>`SUM(${interpreterExecutions.cost_cents})`,
      })
      .from(interpreterExecutions)
      .where(and(...cond))
      .groupBy(interpreterExecutions.language);

    return rows.map((r) => ({
      language: r.language,
      executionCount: Number(r.total),
      successRate: Number(r.total) > 0 ? Number(r.ok) / Number(r.total) : 0,
      avgDurationMs: r.avg || 0,
      totalCostCents: r.cost || 0,
    }));
  }

  async getRecentExecutions(orgId: string, limit = 10) {
    return db
      .select({
        id: interpreterExecutions.id,
        language: interpreterExecutions.language,
        status: interpreterExecutions.status,
        durationMs: interpreterExecutions.duration_ms,
        costCents: interpreterExecutions.cost_cents,
        createdAt: interpreterExecutions.created_at,
      })
      .from(interpreterExecutions)
      .where(eq(interpreterExecutions.organization_id, orgId))
      .orderBy(desc(interpreterExecutions.created_at))
      .limit(limit);
  }
}

export const codeAgentAnalyticsService = new CodeAgentAnalyticsService();
