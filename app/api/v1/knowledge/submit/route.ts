import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { userCharactersRepository } from "@/db/repositories/characters";
import { isValidBlobUrl } from "@/lib/blob";
import {
  KNOWLEDGE_CONSTANTS,
  ALLOWED_CONTENT_TYPES,
  isValidFilename,
} from "@/lib/constants/knowledge";
import { logger } from "@/lib/utils/logger";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { userContextService } from "@/lib/eliza/user-context";
import { RuntimeFactory, invalidateRuntime } from "@/lib/eliza/runtime-factory";
import { AgentMode } from "@/lib/eliza/agent-mode-types";

export const maxDuration = 300; // 5 minutes for large file processing

/**
 * Fetches a blob URL with timeout protection.
 * Prevents hanging requests from consuming the entire request timeout.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

const MAX_FILENAME_LENGTH = 255;

interface FileToProcess {
  blobUrl: string;
  filename: string;
  contentType: string;
  size: number;
}

interface ProcessResult {
  filename: string;
  blobUrl: string;
  status: "success" | "error";
  fragmentCount?: number;
  documentId?: string;
  error?: string;
}

/**
 * POST /api/v1/knowledge/submit
 * Processes pre-uploaded blob files through the knowledge service.
 * Downloads files from blob storage and creates knowledge fragments synchronously.
 * Used after character creation to process files that were uploaded before character existed.
 *
 * @param req - JSON body with characterId and files array (blob URLs and metadata).
 * @returns Processing results for each file including fragment counts.
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
    files: FileToProcess[];
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

  // Validate each file first (type checks must happen before batch size calculation)
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
          error: `Invalid file size for ${file.filename}: must be between 1 byte and ${KNOWLEDGE_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        },
        { status: 400 },
      );
    }
  }

  // Validate total batch size (after type validation ensures all sizes are numbers)
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > KNOWLEDGE_CONSTANTS.MAX_BATCH_SIZE) {
    return NextResponse.json(
      {
        error: `Total batch size exceeds ${KNOWLEDGE_CONSTANTS.MAX_BATCH_SIZE / (1024 * 1024)}MB limit`,
      },
      { status: 400 },
    );
  }

  // Build user context
  const userContext = await userContextService.buildContext({
    user,
    apiKey: authResult.apiKey,
    isAnonymous: false,
    agentMode: AgentMode.ASSISTANT,
  });

  userContext.characterId = characterId;

  // Create runtime
  const runtimeFactory = RuntimeFactory.getInstance();
  const runtime = await runtimeFactory.createRuntimeForUser(userContext);

  const knowledgeService = await getKnowledgeService(runtime);

  if (!knowledgeService) {
    return NextResponse.json(
      { error: "Knowledge service not available" },
      { status: 503 },
    );
  }

  const results: ProcessResult[] = [];

  // Process files synchronously
  for (const file of files) {
    try {
      const response = await fetchWithTimeout(
        file.blobUrl,
        KNOWLEDGE_CONSTANTS.BLOB_FETCH_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch blob: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Content = buffer.toString("base64");

      const result = await knowledgeService.addKnowledge({
        agentId: runtime.agentId,
        clientDocumentId: "" as UUID,
        content: base64Content,
        contentType: file.contentType,
        originalFilename: file.filename,
        worldId: runtime.agentId,
        roomId: runtime.agentId,
        entityId: runtime.agentId,
        metadata: {
          uploadedBy: user.id,
          uploadedAt: Date.now(),
          organizationId: user.organization_id,
          fileSize: file.size,
          filename: file.filename,
          blobUrl: file.blobUrl,
        },
      });

      results.push({
        filename: file.filename,
        blobUrl: file.blobUrl,
        status: "success",
        fragmentCount: result.fragmentCount,
        documentId: result.clientDocumentId,
      });

      logger.info("[KnowledgeSubmit] Processed file", {
        filename: file.filename,
        fragmentCount: result.fragmentCount,
      });
    } catch (error) {
      logger.error(`[KnowledgeSubmit] Error processing ${file.filename}:`, error);
      results.push({
        filename: file.filename,
        blobUrl: file.blobUrl,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.length - successCount;

  // Invalidate runtime cache after processing
  if (successCount > 0) {
    const agentIdStr = runtime.agentId as string;
    await invalidateRuntime(agentIdStr).catch((e) => {
      logger.warn(`[KnowledgeSubmit] Failed to invalidate runtime: ${e}`);
    });
  }

  return NextResponse.json({
    success: successCount > 0,
    results,
    message:
      failedCount === 0
        ? `Successfully processed ${successCount} file(s)`
        : `Processed ${successCount} file(s), ${failedCount} failed`,
    successCount,
    failedCount,
    totalCount: results.length,
  });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
