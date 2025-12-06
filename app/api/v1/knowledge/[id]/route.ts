import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { userContextService } from "@/lib/eliza/user-context";
import { RuntimeFactory } from "@/lib/eliza/runtime-factory";

export const maxDuration = 60;

/**
 * DELETE /api/v1/knowledge/[id]
 * Deletes a knowledge document by ID.
 * Supports optional characterId query parameter for character-specific knowledge.
 *
 * @param req - Request with optional characterId query parameter.
 * @param context - Route context containing the document ID parameter.
 * @returns Success status.
 */
async function handleDELETE(
  req: NextRequest,
  context?: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthOrApiKey(req);
    const { user } = authResult;

    // Get characterId from query params
    const searchParams = req.nextUrl.searchParams;
    const characterId = searchParams.get("characterId") || undefined;

    // Build user context with characterId
    const userContext = await userContextService.buildContext({
      user,
      apiKey: authResult.apiKey,
      isAnonymous: false,
    });

    if (characterId) {
      userContext.characterId = characterId;
    }

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

    if (!context?.params) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 },
      );
    }

    const { id } = await context.params;

    // Delete the document
    await knowledgeService.deleteMemory(id as UUID);

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting knowledge document:", error);
    return NextResponse.json(
      {
        error: "Failed to delete document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);
