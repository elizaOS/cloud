import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/client";
import { userVoices, usageRecords } from "@/db/schemas";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);

    // Query params: ?period=day|week|month|year&startDate=...&endDate=...
    const period = searchParams.get("period") || "month";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    logger.info("[Voice Analytics API] Fetching analytics", {
      voiceId: id,
      period,
      userId: user.id,
    });

    // Get voice and verify ownership
    const [voice] = await db
      .select()
      .from(userVoices)
      .where(
        and(
          eq(userVoices.id, id),
          eq(userVoices.organizationId, user.organization_id)
        )
      );

    if (!voice) {
      return NextResponse.json(
        { error: "Voice not found or access denied" },
        { status: 404 }
      );
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    if (startDateParam) {
      startDate = new Date(startDateParam);
    } else {
      switch (period) {
        case "day":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "year":
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          // month
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    }

    const endDate = endDateParam ? new Date(endDateParam) : now;

    // Get usage statistics from usage_records
    const usageStats = await db
      .select({
        count: count(),
        totalCharacters: sql<number>`COALESCE(SUM(CAST((metadata->>'characterCount') AS INTEGER)), 0)`,
        avgDuration: sql<number>`COALESCE(AVG(duration_ms), 0)`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, user.organization_id),
          eq(usageRecords.type, "tts"),
          sql`metadata->>'userVoiceId' = ${id}`,
          gte(usageRecords.created_at, startDate),
          lte(usageRecords.created_at, endDate)
        )
      );

    // Get daily breakdown for trend visualization
    const dailyUsage = await db
      .select({
        date: sql<string>`DATE(created_at)`,
        count: count(),
        characters: sql<number>`COALESCE(SUM(CAST((metadata->>'characterCount') AS INTEGER)), 0)`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, user.organization_id),
          eq(usageRecords.type, "tts"),
          sql`metadata->>'userVoiceId' = ${id}`,
          gte(usageRecords.created_at, startDate),
          lte(usageRecords.created_at, endDate)
        )
      )
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at) ASC`);

    const periodDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    const stats = usageStats[0];
    const totalCalls = Number(stats?.count) || 0;
    const totalCharacters = Number(stats?.totalCharacters) || 0;
    const avgDuration = Number(stats?.avgDuration) || 0;

    return NextResponse.json({
      success: true,
      voice: {
        id: voice.id,
        name: voice.name,
        description: voice.description,
        cloneType: voice.cloneType,
        elevenlabsVoiceId: voice.elevenlabsVoiceId,
        usageCount: voice.usageCount,
        lastUsedAt: voice.lastUsedAt,
        createdAt: voice.createdAt,
      },
      analytics: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: periodDays,
          type: period,
        },
        summary: {
          totalCalls,
          totalCharacters,
          avgCharactersPerCall:
            totalCalls > 0 ? Math.round(totalCharacters / totalCalls) : 0,
          avgCallsPerDay: totalCalls / Math.max(1, periodDays),
          avgDurationMs: Math.round(avgDuration),
        },
        dailyBreakdown: dailyUsage.map((d) => ({
          date: d.date,
          calls: Number(d.count),
          characters: Number(d.characters),
        })),
        allTime: {
          totalCalls: voice.usageCount,
          lastUsed: voice.lastUsedAt,
          createdAt: voice.createdAt,
        },
      },
    });
  } catch (error) {
    logger.error("[Voice Analytics API] Error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch voice analytics" },
      { status: 500 }
    );
  }
}
