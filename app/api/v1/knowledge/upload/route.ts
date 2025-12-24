import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { uploadToBlob } from "@/lib/blob";
import {
  KNOWLEDGE_CONSTANTS,
  ALLOWED_EXTENSIONS,
  TEXT_EXTENSIONS_FOR_OCTET_STREAM,
  isValidFilename,
} from "@/lib/constants/knowledge";
import type {
  KnowledgeUploadResult,
  KnowledgeUploadBatchResponse,
} from "@/lib/types/knowledge";
import { fileTypeFromBuffer } from "file-type";
import { knowledgeProcessingService } from "@/lib/services/knowledge-processing";
import { usersRepository } from "@/db/repositories/users";

export const maxDuration = 60;

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : "";
}

/**
 * POST /api/v1/knowledge/upload
 * Uploads files to blob storage and queues them for background processing.
 * All files are processed asynchronously to avoid Vercel timeouts.
 * Uses the same job system as creator mode for consistency.
 *
 * Max 6MB total per batch. Upload next batch after current completes.
 */
async function handlePOST(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const characterId = formData.get("characterId") as string | null;

  if (!files || files.length === 0) {
    return NextResponse.json(
      { error: "No files provided", details: "Please upload at least one file" },
      { status: 400 },
    );
  }

  if (files.length > KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        error: "Too many files",
        details: `Maximum ${KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST} files per request`,
      },
      { status: 400 },
    );
  }

  if (!user.organization_id) {
    return NextResponse.json(
      { error: "User must belong to an organization" },
      { status: 403 },
    );
  }

  if (!characterId) {
    return NextResponse.json(
      { error: "Character ID required", details: "Please provide characterId" },
      { status: 400 },
    );
  }

  // Validate total batch size
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > KNOWLEDGE_CONSTANTS.MAX_BATCH_SIZE) {
    return NextResponse.json(
      {
        error: "Batch too large",
        details: `Total batch size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds ${KNOWLEDGE_CONSTANTS.MAX_BATCH_SIZE / 1024 / 1024}MB limit`,
      },
      { status: 400 },
    );
  }

  // Validate all files first
  for (const file of files) {
    if (!isValidFilename(file.name)) {
      return NextResponse.json(
        {
          error: "Invalid filename",
          details: `${file.name} contains invalid characters`,
        },
        { status: 400 },
      );
    }

    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return NextResponse.json(
        {
          error: "Invalid file type",
          details: `${file.name} has unsupported extension`,
        },
        { status: 400 },
      );
    }
  }

  // Get user with organization for knowledge processing service
  const userWithOrg = await usersRepository.findWithOrganization(user.id);
  if (!userWithOrg) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 },
    );
  }

  // Upload all files to blob storage first
  const uploadedFiles: Array<{
    filename: string;
    blobUrl: string;
    contentType: string;
    size: number;
  }> = [];
  const results: KnowledgeUploadResult[] = [];

  for (const file of files) {
    const uploadResult = await uploadFileToBlob(file, user.id);
    if (uploadResult.error) {
      results.push({
        id: "",
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        status: "failed",
        isQueued: false,
        error: uploadResult.error,
        uploadedAt: Date.now(),
      });
    } else {
      uploadedFiles.push({
        filename: file.name,
        blobUrl: uploadResult.blobUrl!,
        contentType: uploadResult.contentType!,
        size: file.size,
      });
    }
  }

  // Queue uploaded files using knowledgeProcessingService (same as creator mode)
  if (uploadedFiles.length > 0) {
    const jobIds = await knowledgeProcessingService.queueFiles({
      characterId,
      files: uploadedFiles,
      user: userWithOrg,
    });

    // Add successful results
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      results.push({
        id: jobIds[i],
        filename: file.filename,
        size: file.size,
        contentType: file.contentType,
        status: "pending",
        isQueued: true,
        jobId: jobIds[i],
        uploadedAt: Date.now(),
      });
    }

    logger.info("[KnowledgeUpload] Files queued for processing", {
      characterId,
      fileCount: uploadedFiles.length,
      jobIds,
    });
  }

  const summary = {
    total: results.length,
    immediate: 0,
    queued: results.filter((r) => r.isQueued).length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  const response: KnowledgeUploadBatchResponse = {
    success: summary.failed < summary.total,
    files: results,
    summary,
    message: buildMessage(summary),
  };

  return NextResponse.json(response);
}

async function uploadFileToBlob(
  file: File,
  userId: string,
): Promise<{ blobUrl?: string; contentType?: string; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect content type
    let contentType = file.type || "application/octet-stream";
    if (contentType === "application/octet-stream") {
      const ext = getFileExtension(file.name);
      const detectedType = await fileTypeFromBuffer(buffer);
      if (detectedType) {
        contentType = detectedType.mime;
      } else if (TEXT_EXTENSIONS_FOR_OCTET_STREAM.includes(ext as (typeof TEXT_EXTENSIONS_FOR_OCTET_STREAM)[number])) {
        contentType = "text/plain";
      }
    }

    // Upload to blob storage
    const blobResult = await uploadToBlob(buffer, {
      filename: file.name,
      contentType,
      folder: "knowledge-queue",
      userId,
    });

    return {
      blobUrl: blobResult.url,
      contentType: blobResult.contentType,
    };
  } catch (error) {
    logger.error(`Error uploading file ${file.name} to blob:`, error);
    return {
      error: error instanceof Error ? error.message : "Failed to upload file",
    };
  }
}

function buildMessage(summary: { total: number; immediate: number; queued: number; failed: number }): string {
  const parts: string[] = [];

  if (summary.queued > 0) {
    parts.push(`${summary.queued} file${summary.queued > 1 ? "s" : ""} queued for background processing`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }

  return parts.join(", ");
}

/**
 * GET /api/v1/knowledge/upload
 * Get status of queued uploads for the current user.
 */
async function handleGET(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  if (!user.organization_id) {
    return NextResponse.json(
      { error: "User must belong to an organization" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const characterId = url.searchParams.get("characterId");

  if (!characterId) {
    return NextResponse.json(
      { error: "characterId is required" },
      { status: 400 },
    );
  }

  // Get status from knowledge processing service
  const status = await knowledgeProcessingService.getStatus(characterId, user.organization_id);

  return NextResponse.json({
    uploads: status.jobs.map((job) => ({
      id: job.id,
      filename: job.filename,
      status: job.status,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    })),
    summary: {
      pending: status.pendingCount,
      processing: status.processingCount,
      completed: status.completedCount,
      failed: status.failedCount,
    },
  });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
