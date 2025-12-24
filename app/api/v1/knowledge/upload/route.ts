import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { userContextService } from "@/lib/eliza/user-context";
import { RuntimeFactory } from "@/lib/eliza/runtime-factory";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { uploadToBlob } from "@/lib/blob";
import { jobsRepository } from "@/db/repositories/jobs";
import {
  KNOWLEDGE_CONSTANTS,
  KNOWLEDGE_JOB_TYPE,
  ALLOWED_EXTENSIONS,
  ALLOWED_CONTENT_TYPES,
  TEXT_EXTENSIONS_FOR_OCTET_STREAM,
  isValidFilename,
} from "@/lib/constants/knowledge";
import type {
  KnowledgeUploadResult,
  KnowledgeUploadBatchResponse,
} from "@/lib/types/knowledge";
import { fileTypeFromBuffer } from "file-type";

interface KnowledgeUploadJobData {
  filename: string;
  blobUrl: string;
  contentType: string;
  size: number;
  characterId: string;
  uploadedBy: string;
  uploadedAt: number;
  [key: string]: unknown;
}

export const maxDuration = 60;

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : "";
}

/**
 * POST /api/v1/knowledge/upload
 * Uploads files to the knowledge base with smart routing:
 * - Files ≤ 1.5MB: Processed immediately
 * - Files > 1.5MB: Uploaded to blob storage and queued for background processing
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

  const organizationId = user.organization_id;

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

  // Separate files into immediate and queued
  const immediateFiles: File[] = [];
  const queuedFiles: File[] = [];

  for (const file of files) {
    if (file.size <= KNOWLEDGE_CONSTANTS.ASYNC_PROCESSING_THRESHOLD) {
      immediateFiles.push(file);
    } else {
      queuedFiles.push(file);
    }
  }

  const results: KnowledgeUploadResult[] = [];
  let runtime = null;
  let knowledgeService = null;

  // Process immediate files if any
  if (immediateFiles.length > 0) {
    const userContext = await userContextService.buildContext({
      user,
      apiKey: authResult.apiKey,
      isAnonymous: false,
      agentMode: AgentMode.ASSISTANT,
    });

    if (characterId) {
      userContext.characterId = characterId;
    }

    const runtimeFactory = RuntimeFactory.getInstance();
    runtime = await runtimeFactory.createRuntimeForUser(userContext);
    knowledgeService = await getKnowledgeService(runtime);

    if (!knowledgeService) {
      return NextResponse.json(
        { error: "Knowledge service not available" },
        { status: 503 },
      );
    }

    for (const file of immediateFiles) {
      const result = await processFileImmediately(
        file,
        runtime,
        knowledgeService,
        user.id,
        organizationId,
      );
      results.push(result);
    }
  }

  // Queue large files for background processing
  for (const file of queuedFiles) {
    const effectiveCharacterId = characterId ?? (runtime?.agentId as string) ?? "";
    const result = await queueFileForProcessing(
      file,
      effectiveCharacterId,
      user.id,
      organizationId,
    );
    results.push(result);
  }

  const summary = {
    total: results.length,
    immediate: results.filter((r) => !r.isQueued && r.status === "completed").length,
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

async function processFileImmediately(
  file: File,
  runtime: Awaited<ReturnType<typeof RuntimeFactory.prototype.createRuntimeForUser>>,
  knowledgeService: NonNullable<Awaited<ReturnType<typeof getKnowledgeService>>>,
  userId: string,
  organizationId: string,
): Promise<KnowledgeUploadResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Content = buffer.toString("base64");
    const contentType = file.type || "application/octet-stream";

    const result = await knowledgeService.addKnowledge({
      agentId: runtime.agentId,
      clientDocumentId: "" as UUID,
      content: base64Content,
      contentType,
      originalFilename: file.name,
      worldId: runtime.agentId,
      roomId: runtime.agentId,
      entityId: runtime.agentId,
      metadata: {
        uploadedBy: userId,
        uploadedAt: Date.now(),
        organizationId,
        fileSize: file.size,
        fileName: file.name,
        filename: file.name,
      },
    });

    return {
      id: result.clientDocumentId,
      filename: file.name,
      size: file.size,
      contentType,
      status: "completed",
      isQueued: false,
      fragmentCount: result.fragmentCount,
      uploadedAt: Date.now(),
    };
  } catch (error) {
    logger.error(`Error processing file ${file.name}:`, error);
    return {
      id: "",
      filename: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      status: "failed",
      isQueued: false,
      error: error instanceof Error ? error.message : "Processing failed",
      uploadedAt: Date.now(),
    };
  }
}

async function queueFileForProcessing(
  file: File,
  characterId: string,
  userId: string,
  organizationId: string,
): Promise<KnowledgeUploadResult> {
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

    // Create job using existing jobs infrastructure
    const jobData: KnowledgeUploadJobData = {
      filename: file.name,
      blobUrl: blobResult.url,
      contentType: blobResult.contentType,
      size: file.size,
      characterId,
      uploadedBy: userId,
      uploadedAt: Date.now(),
    };

    const job = await jobsRepository.create({
      type: KNOWLEDGE_JOB_TYPE,
      status: "pending",
      data: jobData,
      organization_id: organizationId,
      user_id: userId,
    });

    logger.info("[KnowledgeUpload] File queued for processing", {
      jobId: job.id,
      filename: file.name,
      size: file.size,
      blobUrl: blobResult.url,
    });

    return {
      id: job.id,
      filename: file.name,
      size: file.size,
      contentType: blobResult.contentType,
      status: "pending",
      isQueued: true,
      jobId: job.id,
      uploadedAt: Date.now(),
    };
  } catch (error) {
    logger.error(`Error queuing file ${file.name}:`, error);
    return {
      id: "",
      filename: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      status: "failed",
      isQueued: false,
      error: error instanceof Error ? error.message : "Failed to queue file",
      uploadedAt: Date.now(),
    };
  }
}

function buildMessage(summary: { total: number; immediate: number; queued: number; failed: number }): string {
  const parts: string[] = [];

  if (summary.immediate > 0) {
    parts.push(`${summary.immediate} file${summary.immediate > 1 ? "s" : ""} processed`);
  }
  if (summary.queued > 0) {
    parts.push(`${summary.queued} large file${summary.queued > 1 ? "s" : ""} queued for background processing`);
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

  const url = new URL(req.url);
  const characterId = url.searchParams.get("characterId");
  const jobId = url.searchParams.get("jobId");

  // Get single job status
  if (jobId) {
    const job = await jobsRepository.findById(jobId);
    if (!job || job.organization_id !== user.organization_id) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const data = job.data as unknown as KnowledgeUploadJobData;
    return NextResponse.json({
      id: job.id,
      filename: data.filename,
      size: data.size,
      status: job.status,
      error: job.error ?? undefined,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    });
  }

  // Get all pending/processing jobs for user
  const jobs = await jobsRepository.findByFilters({
    type: KNOWLEDGE_JOB_TYPE,
    organizationId: user.organization_id ?? undefined,
    orderBy: "desc",
    limit: 50,
  });

  // Filter by characterId if provided
  const filteredJobs = characterId
    ? jobs.filter((j) => (j.data as unknown as KnowledgeUploadJobData).characterId === characterId)
    : jobs;

  const uploads = filteredJobs.map((job) => {
    const data = job.data as unknown as KnowledgeUploadJobData;
    return {
      id: job.id,
      filename: data.filename,
      size: data.size,
      status: job.status,
      error: job.error ?? undefined,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    };
  });

  return NextResponse.json({ uploads });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
