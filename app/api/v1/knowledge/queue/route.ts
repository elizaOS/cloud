import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { knowledgeProcessingService } from "@/lib/services/knowledge-processing";
import { userCharactersRepository } from "@/db/repositories/characters";

const MAX_FILES_PER_REQUEST = 10;
const MAX_FILENAME_LENGTH = 255;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/json",
  "application/xml",
  "text/xml",
  "application/x-yaml",
  "text/yaml",
  "text/csv",
  "application/octet-stream",
];

interface FileToQueue {
  blobUrl: string;
  filename: string;
  contentType: string;
  size: number;
}

const TRUSTED_BLOB_HOSTS = [
  "blob.vercel-storage.com",
  "public.blob.vercel-storage.com",
];

function isValidBlobUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Use exact hostname matching to prevent subdomain bypass attacks
    return TRUSTED_BLOB_HOSTS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
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

  // Verify character belongs to user's organization
  const character = await userCharactersRepository.findById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { error: "Character not found or unauthorized" },
      { status: 403 },
    );
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json(
      { error: "No files provided" },
      { status: 400 },
    );
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES_PER_REQUEST} files per request` },
      { status: 400 },
    );
  }

  // Validate each file
  for (const file of files) {
    if (!file.blobUrl || !isValidBlobUrl(file.blobUrl)) {
      return NextResponse.json(
        { error: `Invalid or untrusted blobUrl for file: ${file.filename || "unknown"}` },
        { status: 400 },
      );
    }

    if (!file.filename || typeof file.filename !== "string" || file.filename.length > MAX_FILENAME_LENGTH) {
      return NextResponse.json(
        { error: `Invalid filename: must be a string under ${MAX_FILENAME_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (!file.contentType || !ALLOWED_CONTENT_TYPES.includes(file.contentType)) {
      return NextResponse.json(
        { error: `Invalid content type: ${file.contentType}` },
        { status: 400 },
      );
    }

    if (typeof file.size !== "number" || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Invalid file size for ${file.filename}: must be between 1 byte and ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }
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
