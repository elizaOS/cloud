/**
 * Runtime Status API - cache statistics for monitoring.
 */

import { NextResponse } from "next/server";
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
      { status: 500 },
    );
  }
}
