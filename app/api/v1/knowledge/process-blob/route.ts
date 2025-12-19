import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { userContextService } from "@/lib/eliza/user-context";
import { RuntimeFactory } from "@/lib/eliza/runtime-factory";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { userCharactersRepository } from "@/db/repositories/characters";
import {
  KNOWLEDGE_CONSTANTS,
  ALLOWED_CONTENT_TYPES,
  isValidFilename,
} from "@/lib/constants/knowledge";
import { isValidBlobUrl } from "@/lib/blob";

export const maxDuration = 60;

const MAX_FILENAME_LENGTH = 255;

interface BlobFileToProcess {
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
 * POST /api/v1/knowledge/process-blob
 * Processes pre-uploaded blob files through the knowledge service.
 * Downloads files from blob storage and creates knowledge fragments.
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
    files: BlobFileToProcess[];
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
      {
        error: "No files provided",
        details: "Please provide an array of files to process",
      },
      { status: 400 },
    );
  }

  if (files.length > KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Maximum ${KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST} files per request`,
      },
      { status: 400 },
    );
  }

  // Validate each file's metadata
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

  // Build user context with ASSISTANT mode (required for knowledge plugin)
  const userContext = await userContextService.buildContext({
    user,
    apiKey: authResult.apiKey,
    isAnonymous: false,
    agentMode: AgentMode.ASSISTANT,
  });

  userContext.characterId = characterId;

  // Create runtime with user-specific context
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

  for (const file of files) {
    try {
      // Fetch the file from blob storage (already validated above)
      const response = await fetch(file.blobUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch blob: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Content = buffer.toString("base64");

      // Process through knowledge service
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

      logger.info("[ProcessBlob] Successfully processed file", {
        filename: file.filename,
        fragmentCount: result.fragmentCount,
        documentId: result.clientDocumentId,
      });
    } catch (error) {
      logger.error(
        `[ProcessBlob] Error processing file ${file.filename}:`,
        error,
      );
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
