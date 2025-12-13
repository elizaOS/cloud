import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/client";
import { userVoices, usageRecords } from "@/db/schemas";
import { eq, and, gte, lte, count, sql, desc } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);

    // Query params: ?period=day|week|month|year&startDate=...&endDate=...
    const period = searchParams.get("period") || "month";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    logger.info("[Voice Analytics API] Fetching organization analytics", {
      organizationId: user.organization_id,
      period,
    });

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
    const periodDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Get all voices for organization
    const allVoices = await db
      .select()
      .from(userVoices)
      .where(eq(userVoices.organizationId, user.organization_id))
      .orderBy(desc(userVoices.usageCount));

    // Get total TTS usage for organization in period
    const totalUsageStats = await db
      .select({
        count: count(),
        totalCharacters: sql<number>`COALESCE(SUM(CAST((metadata->>'characterCount') AS INTEGER)), 0)`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, user.organization_id),
          eq(usageRecords.type, "tts"),
          gte(usageRecords.created_at, startDate),
          lte(usageRecords.created_at, endDate)
        )
      );

    // Get usage breakdown by voice
    const voiceUsageBreakdown = await db
      .select({
        userVoiceId: sql<string>`metadata->>'userVoiceId'`,
        voiceName: sql<string>`metadata->>'voiceName'`,
        count: count(),
        characters: sql<number>`COALESCE(SUM(CAST((metadata->>'characterCount') AS INTEGER)), 0)`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, user.organization_id),
          eq(usageRecords.type, "tts"),
          sql`metadata->>'userVoiceId' IS NOT NULL`,
          gte(usageRecords.created_at, startDate),
          lte(usageRecords.created_at, endDate)
        )
      )
      .groupBy(sql`metadata->>'userVoiceId'`, sql`metadata->>'voiceName'`)
      .orderBy(desc(count()));

    // Get daily trend for period
    const dailyTrend = await db
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
          gte(usageRecords.created_at, startDate),
          lte(usageRecords.created_at, endDate)
        )
      )
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at) ASC`);

    const totalStats = totalUsageStats[0];
    const totalCalls = Number(totalStats?.count) || 0;
    const totalCharacters = Number(totalStats?.totalCharacters) || 0;

    // Calculate voice breakdown with percentages
    const topVoices = voiceUsageBreakdown.slice(0, 10).map((v) => ({
      voiceId: v.userVoiceId,
      voiceName: v.voiceName,
      calls: Number(v.count),
      characters: Number(v.characters),
      percentage: totalCalls > 0 ? (Number(v.count) / totalCalls) * 100 : 0,
    }));

    // Count voices by type
    const voicesByType = {
      instant: allVoices.filter((v) => v.cloneType === "instant").length,
      professional: allVoices.filter((v) => v.cloneType === "professional")
        .length,
    };

    // Calculate usage trend
    let trendDirection: "up" | "down" | "stable" = "stable";
    let trendPercentage = 0;

    if (dailyTrend.length >= 2) {
      const firstHalf = dailyTrend.slice(0, Math.floor(dailyTrend.length / 2));
      const secondHalf = dailyTrend.slice(Math.floor(dailyTrend.length / 2));

      const firstHalfAvg =
        firstHalf.reduce((sum, d) => sum + Number(d.count), 0) /
        firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((sum, d) => sum + Number(d.count), 0) /
        secondHalf.length;

      if (secondHalfAvg > firstHalfAvg * 1.1) {
        trendDirection = "up";
        trendPercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
      } else if (secondHalfAvg < firstHalfAvg * 0.9) {
        trendDirection = "down";
        trendPercentage = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
      }
    }

    return NextResponse.json({
      success: true,
      analytics: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: periodDays,
          type: period,
        },
        summary: {
          totalVoices: allVoices.length,
          voicesByType,
          totalCalls,
          totalCharacters,
          avgCallsPerDay: totalCalls / Math.max(1, periodDays),
          avgCharactersPerCall:
            totalCalls > 0 ? Math.round(totalCharacters / totalCalls) : 0,
          customVoiceCalls: voiceUsageBreakdown.reduce(
            (sum, v) => sum + Number(v.count),
            0
          ),
          defaultVoiceCalls:
            totalCalls -
            voiceUsageBreakdown.reduce((sum, v) => sum + Number(v.count), 0),
        },
        topVoices,
        trend: {
          direction: trendDirection,
          percentage: Math.round(trendPercentage * 10) / 10,
        },
        dailyBreakdown: dailyTrend.map((d) => ({
          date: d.date,
          calls: Number(d.count),
          characters: Number(d.characters),
        })),
        allVoices: allVoices.map((v) => ({
          id: v.id,
          name: v.name,
          cloneType: v.cloneType,
          usageCount: v.usageCount,
          lastUsedAt: v.lastUsedAt,
          createdAt: v.createdAt,
        })),
      },
    });
  } catch (error) {
    logger.error("[Voice Analytics API] Error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
