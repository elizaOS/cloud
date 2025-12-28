/**
 * Runtime Status API - Edge Function
 *
 * Provides real-time status of warm runtimes for monitoring.
 * Runs on Edge for ultra-low latency.
 */

import { NextResponse, type NextRequest } from "next/server";
import { edgeRuntimeCache } from "@/lib/cache/edge-runtime-cache";
import { getRuntimeCacheStats } from "@/lib/eliza/runtime-factory";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");

  try {
    if (agentId) {
      // Get specific agent status
      const warmState = await edgeRuntimeCache.getWarmState(agentId);
      const isWarm = await edgeRuntimeCache.isRuntimeWarm(agentId);

      return NextResponse.json({
        agentId,
        isWarm,
        state: warmState,
        timestamp: Date.now(),
      });
    }

    // Get all warm runtimes
    const warmRuntimes = await edgeRuntimeCache.getAllWarmRuntimes();
    const localStats = getRuntimeCacheStats();

    return NextResponse.json({
      edge: {
        warmRuntimes: warmRuntimes.length,
        runtimes: warmRuntimes.map((r) => ({
          agentId: r.characterName ? undefined : "unknown",
          characterName: r.characterName,
          isWarm: r.isWarm,
          warmedAt: r.warmedAt,
          requestCount: r.requestCount,
          embeddingDimension: r.embeddingDimension,
          ageMs: Date.now() - r.warmedAt,
        })),
      },
      local: {
        cached: localStats.runtime.size,
        maxSize: localStats.runtime.maxSize,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get runtime status", details: String(error) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/runtime/status
 *
 * Signal pre-warm for a specific agent.
 * Called by Edge middleware or external systems.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, action } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 },
      );
    }

    if (action === "prewarm") {
      await edgeRuntimeCache.signalPreWarm(agentId);
      return NextResponse.json({
        success: true,
        message: `Pre-warm signal sent for agent ${agentId}`,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'prewarm'" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process request", details: String(error) },
      { status: 500 },
    );
  }
}
