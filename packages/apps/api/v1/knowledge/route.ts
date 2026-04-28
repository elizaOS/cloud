import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKey } from "@/lib/auth";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import { invalidateRuntime, RuntimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

const KnowledgeUploadBody = z.object({
  content: z.string().optional(),
  contentType: z.string().optional(),
  filename: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  characterId: z.string().optional(),
});

/**
 * GET /api/v1/knowledge
 * Lists all knowledge documents for the authenticated user.
 * Supports filtering by characterId and pagination.
 *
 * @param req - Request with optional characterId, count, and offset query parameters.
 * @returns Array of knowledge documents with total count.
 */
async function handleGET(req: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKey(req);
    const { user } = authResult;

    // Get query parameters
    const urlParams = req.nextUrl.searchParams;
    const characterId = urlParams.get("characterId") || undefined;
    const count = parseInt(urlParams.get("count") || "100");
    const offset = parseInt(urlParams.get("offset") || "0");

    // Build user context with ASSISTANT mode (required for knowledge plugin)
    const userContext = await userContextService.buildContext({
      user,
      apiKey: authResult.apiKey,
      isAnonymous: false,
      agentMode: AgentMode.ASSISTANT,
    });

    if (characterId) {
      userContext.characterId = characterId;
    }

    // Create runtime with user-specific context (includes API key for embeddings)
    const runtimeFactory = RuntimeFactory.getInstance();
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

    // Wait for knowledge service to be available
    const knowledgeService = await getKnowledgeService(runtime);

    if (!knowledgeService) {
      const status = runtime.getServiceRegistrationStatus("knowledge");
      logger.error("[Knowledge API] Knowledge service not available, status:", status);

      return NextResponse.json(
        {
          error: "Knowledge service not available",
          details: `Service status: ${status}. The knowledge plugin may not be loaded or is still initializing.`,
        },
        { status: 503 },
      );
    }

    type GetMemoriesInput = Parameters<typeof knowledgeService.getMemories>[0];
    type CountMemoriesInput = Parameters<typeof knowledgeService.countMemories>[0];
    const roomId = runtime.agentId as GetMemoriesInput["roomId"];

    // Get documents
    const documents = await knowledgeService.getMemories({
      tableName: "documents",
      roomId,
      count,
      offset,
    });

    // Get total count
    const total = await knowledgeService.countMemories({
      tableName: "documents",
      roomId: roomId as CountMemoriesInput["roomId"],
      unique: false,
    });

    return NextResponse.json({
      documents,
      total,
      count: documents.length,
      offset,
    });
  } catch (error) {
    logger.error("Error listing knowledge documents:", error);
    return NextResponse.json(
      {
        error: "Failed to list documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/knowledge
 * Uploads a new knowledge document to the knowledge base.
 * Supports text content and converts it to base64 for processing.
 *
 * @param req - Request body with content, contentType, filename, optional metadata, and characterId.
 * @returns Created document ID and fragment count.
 */
async function handlePOST(req: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKey(req);
    const { user } = authResult;

    const rawBody = await req.json();
    const parsedBody = KnowledgeUploadBody.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }
    const { content, contentType, filename, metadata, characterId } = parsedBody.data;

    // Build user context with ASSISTANT mode (required for knowledge plugin)
    const userContext = await userContextService.buildContext({
      user,
      apiKey: authResult.apiKey,
      isAnonymous: false,
      agentMode: AgentMode.ASSISTANT,
    });

    if (characterId) {
      userContext.characterId = characterId;
    }

    // Create runtime with user-specific context (includes API key for embeddings)
    const runtimeFactory = RuntimeFactory.getInstance();
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

    const knowledgeService = await getKnowledgeService(runtime);

    if (!knowledgeService) {
      return NextResponse.json({ error: "Knowledge service not available" }, { status: 503 });
    }

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // For text content, check if it needs base64 encoding
    let processedContent = content;
    const finalContentType = contentType || "text/plain";

    // If content looks like it might be binary or already base64, keep it as is
    // Otherwise, convert text to base64 for consistency
    if (finalContentType.startsWith("text/") || finalContentType === "application/json") {
      // Text content - convert to base64
      processedContent = Buffer.from(content).toString("base64");
    }

    // Add a native knowledge document using the runtime-owned knowledge service.
    // Use runtime.agentId for roomId, worldId, entityId to keep internal ownership stable.
    type AddKnowledgeInput = Parameters<typeof knowledgeService.addKnowledge>[0];
    const result = await knowledgeService.addKnowledge({
      agentId: runtime.agentId as AddKnowledgeInput["agentId"],
      clientDocumentId: "" as AddKnowledgeInput["clientDocumentId"], // This will be ignored by the service
      content: processedContent,
      contentType: finalContentType,
      originalFilename: filename || "document.txt",
      worldId: runtime.agentId as AddKnowledgeInput["worldId"],
      roomId: runtime.agentId as AddKnowledgeInput["roomId"],
      entityId: runtime.agentId as AddKnowledgeInput["entityId"],
      metadata: {
        uploadedBy: user.id,
        uploadedAt: Date.now(),
        organizationId: user.organization_id,
        ...metadata,
      },
    });

    // CRITICAL: Invalidate runtime cache after knowledge upload
    // This ensures the next request creates a fresh runtime that:
    // 1. Reflects the new hasKnowledge state for mode resolution
    // 2. Properly loads the updated knowledge plugin state
    const agentIdStr = runtime.agentId as string;
    await invalidateRuntime(agentIdStr).catch((e) => {
      logger.warn(`[Knowledge API] Failed to invalidate runtime after upload: ${e}`);
    });
    logger.info(
      `[Knowledge API] Invalidated runtime cache for agent ${agentIdStr} after knowledge upload`,
    );

    return NextResponse.json({
      success: true,
      documentId: result.clientDocumentId,
      fragmentCount: result.fragmentCount,
      message: `Document processed successfully. Created ${result.fragmentCount} knowledge fragments.`,
    });
  } catch (error) {
    logger.error("Error uploading knowledge document:", error);
    return NextResponse.json(
      {
        error: "Failed to upload document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
