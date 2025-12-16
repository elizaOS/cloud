import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { knowledgeProcessingService } from "@/lib/services/knowledge-processing";

export const maxDuration = 300; // 5 minutes for processing multiple files

/**
 * POST /api/v1/knowledge/process-queue
 * Processes pending knowledge processing jobs from the queue.
 * This endpoint can be called manually or via a cron job.
 *
 * Processes up to 5 jobs per invocation to stay within serverless limits.
 *
 * @returns Processing results with success/failure counts.
 */
async function handlePOST(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  const result = await knowledgeProcessingService.processQueue({
    user,
    apiKey: authResult.apiKey,
  });

  if (result.totalProcessed === 0) {
    return NextResponse.json({
      message: "No pending jobs to process",
      processed: 0,
    });
  }

  return NextResponse.json({
    success: true,
    message: `Processed ${result.totalProcessed} job(s)`,
    successCount: result.successCount,
    failureCount: result.failureCount,
    totalProcessed: result.totalProcessed,
  });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
