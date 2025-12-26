import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { knowledgeProcessingService } from "@/lib/services/knowledge-processing";
import { userCharactersRepository } from "@/db/repositories/characters";
import { isValidBlobUrl } from "@/lib/blob";
import {
  KNOWLEDGE_CONSTANTS,
  ALLOWED_CONTENT_TYPES,
  isValidFilename,
} from "@/lib/constants/knowledge";
import { logger } from "@/lib/utils/logger";

const MAX_FILENAME_LENGTH = 255;

interface FileToQueue {
  blobUrl: string;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * POST /api/v1/knowledge/submit
 * Submits knowledge files for processing.
 * Creates job records for tracking and processes files immediately.
 */
async function handlePOST(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  if (!user.organization_id) {
    return NextResponse.json(
      { error: "Organization ID not found" },
      { status: 400 },
    );
  }

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

  const character = await userCharactersRepository.findById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { error: "Character not found or unauthorized" },
      { status: 403 },
    );
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  if (files.length > KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Maximum ${KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST} files per request`,
      },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!file.blobUrl || !isValidBlobUrl(file.blobUrl)) {
      return NextResponse.json(
        {
          error: `Invalid or untrusted blobUrl for file: ${file.filename || "unknown"}`,
        },
        { status: 400 },
      );
    }

    if (
      !file.filename ||
      typeof file.filename !== "string" ||
      file.filename.length > MAX_FILENAME_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `Invalid filename: must be a string under ${MAX_FILENAME_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    if (!isValidFilename(file.filename)) {
      return NextResponse.json(
        {
          error: `Invalid filename: ${file.filename} contains path-unsafe characters`,
        },
        { status: 400 },
      );
    }

    if (
      !file.contentType ||
      !ALLOWED_CONTENT_TYPES.includes(
        file.contentType as (typeof ALLOWED_CONTENT_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        { error: `Invalid content type: ${file.contentType}` },
        { status: 400 },
      );
    }

    if (
      typeof file.size !== "number" ||
      file.size <= 0 ||
      file.size > KNOWLEDGE_CONSTANTS.MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          error: `Invalid file size for ${file.filename}: must be between 1 byte and ${KNOWLEDGE_CONSTANTS.MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }
  }

  const jobIds = await knowledgeProcessingService.queueFiles({
    characterId,
    files,
    user,
  });

  logger.info("[KnowledgeSubmit] Processing jobs", {
    characterId,
    jobCount: jobIds.length,
  });

  // Process jobs in background after returning response
  setImmediate(async () => {
    for (const jobId of jobIds) {
      await knowledgeProcessingService.processJobById(jobId, user).catch((error) => {
        logger.error("[KnowledgeSubmit] Processing error", {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  });

  return NextResponse.json({
    success: true,
    message: `Queued ${files.length} file(s) for processing`,
    jobIds,
    jobCount: jobIds.length,
  });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
