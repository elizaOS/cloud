/**
 * Runtime Status API
 * 
 * Provides real-time status of warm runtimes for monitoring.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRuntimeCacheStats } from "@/lib/eliza/runtime-factory";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const localStats = getRuntimeCacheStats();
    
    return NextResponse.json({
      local: {
        cached: localStats.runtime.size,
        maxSize: localStats.runtime.maxSize,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get runtime status", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/runtime/status
 * 
 * Signal pre-warm for a specific agent.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, action } = body;
    
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }
    
    if (action === "prewarm") {
      // Pre-warming is handled via runtime-factory cache
      return NextResponse.json({
        success: true,
        message: `Pre-warm request received for agent ${agentId}`,
        timestamp: Date.now(),
      });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process request", details: String(error) },
      { status: 500 }
    );
  }
}

