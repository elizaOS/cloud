import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { knowledgeProcessingService } from "@/lib/services/knowledge-processing";

interface FileToQueue {
  blobUrl: string;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * POST /api/v1/knowledge/queue
 * Queues knowledge files for background processing.
 * Files are stored as jobs in the database and processed asynchronously.
 *
 * @param req - JSON body with characterId and files array.
 * @returns Success message with job IDs.
 */
async function handlePOST(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  const body = await req.json();
  const { characterId, files } = body as {
    characterId: string;
    files: FileToQueue[];
  };

  if (!characterId) {
    return NextResponse.json(
      { error: "characterId is required" },
      { status: 400 },
    );
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json(
      { error: "No files provided" },
      { status: 400 },
    );
  }

  const jobIds = await knowledgeProcessingService.queueFiles({
    characterId,
    files,
    user,
  });

  return NextResponse.json({
    success: true,
    message: `Queued ${files.length} file(s) for processing`,
    jobIds,
    jobCount: jobIds.length,
  });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
