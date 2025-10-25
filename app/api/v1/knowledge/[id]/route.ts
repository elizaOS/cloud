import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

export const maxDuration = 60;

/**
 * DELETE /api/v1/knowledge/[id] - Delete a knowledge document
 */
async function handleDELETE(
  req: NextRequest,
  context?: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuthOrApiKey(req);
    const runtime = await agentRuntime.getRuntime();
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
