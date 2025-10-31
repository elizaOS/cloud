import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { v4 as uuidv4 } from "uuid";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

export const maxDuration = 60;

/**
 * POST /api/v1/knowledge/query - Query knowledge base
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const runtime = await agentRuntime.getRuntime();
    const knowledgeService = await getKnowledgeService(runtime);

    if (!knowledgeService) {
      return NextResponse.json(
        { error: "Knowledge service not available" },
        { status: 503 },
      );
    }

    const body = await req.json();
    const { query, limit = 5 } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Use runtime.agentId as roomId (matching plugin pattern)
    const roomId = runtime.agentId;

    // Create a query message
    const queryMessage = {
      id: uuidv4() as UUID,
      content: {
        text: query,
      },
      roomId,
      agentId: runtime.agentId,
      entityId: stringToUuid(user.id) as UUID,
      createdAt: Date.now(),
    };

    // Get relevant knowledge
    const relevantKnowledge = await knowledgeService.getKnowledge(
      queryMessage as never,
      {
        roomId,
        worldId: roomId,
        entityId: stringToUuid(user.id) as UUID,
      },
    );

    // Limit results on our side
    const limitedResults = relevantKnowledge.slice(0, limit);

    return NextResponse.json({
      query,
      results: limitedResults.map((item) => ({
        id: item.id,
        content: item.content.text,
        similarity: (item as { similarity?: number }).similarity || 0,
        metadata: item.metadata,
      })),
      count: limitedResults.length,
    });
  } catch (error) {
    console.error("Error querying knowledge:", error);
    return NextResponse.json(
      {
        error: "Failed to query knowledge",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
