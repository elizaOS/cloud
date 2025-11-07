import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { voiceCloningService } from "@/lib/services/voice-cloning";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    logger.info(`[Voice Jobs API] Fetching jobs for user ${user.id}`);

    // Get user's jobs (only in-progress ones)
    const allJobs = await voiceCloningService.getUserJobs(
      user.organization_id!,
      user.id,
    );

    // Filter for only processing/pending jobs
    const activeJobs = allJobs.filter(
      (job) => job.status === "processing" || job.status === "pending",
    );

    return NextResponse.json({
      success: true,
      jobs: activeJobs.map((job) => ({
        id: job.id,
        voiceName: job.voiceName,
        jobType: job.jobType,
        status: job.status,
        progress: job.progress,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
      })),
      total: activeJobs.length,
    });
  } catch (error) {
    logger.error("[Voice Jobs API] Error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch voice jobs. Please try again." },
      { status: 500 },
    );
  }
}
