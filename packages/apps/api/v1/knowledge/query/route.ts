import type { UUID } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { requireAuthOrApiKey } from "@/lib/auth";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import { RuntimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import type { QueryResult } from "@/lib/types/knowledge";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

const KnowledgeQueryBody = z.object({
  query: z.string().optional(),
  limit: z.number().optional(),
  characterId: z.string().optional(),
});

/**
 * POST /api/v1/knowledge/query
 * Queries the knowledge base using semantic search.
 * Returns relevant knowledge documents based on the query.
 *
 * @param req - Request body with query string, optional limit, and characterId.
 * @returns Query results with similarity scores and metadata.
 */
async function handlePOST(req: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKey(req);
    const { user } = authResult;

    const rawBody = await req.json();
    const parsedBody = KnowledgeQueryBody.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }
    const { query, limit = 5, characterId } = parsedBody.data;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

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

    type KnowledgeContext = NonNullable<Parameters<typeof knowledgeService.getKnowledge>[1]>;
    const roomId = (runtime.agentId ?? stringToUuid(user.id)) as KnowledgeContext["roomId"];
    const entityId = stringToUuid(user.id) as KnowledgeContext["entityId"];

    // Create a query message
    const queryMessage = {
      id: uuidv4() as UUID,
      content: {
        text: query,
      },
      roomId,
      agentId: runtime.agentId,
      entityId,
      createdAt: Date.now(),
    };

    // Get relevant knowledge
    const relevantKnowledge = await knowledgeService.getKnowledge(queryMessage as never, {
      roomId,
      worldId: roomId,
      entityId,
    });

    // Limit results on our side
    const limitedResults = relevantKnowledge.slice(0, limit);

    return NextResponse.json({
      query,
      results: limitedResults.map(
        (item): QueryResult => ({
          id: item.id,
          content: item.content.text ?? "",
          similarity: (() => {
            if (typeof item === "object" && item !== null && "similarity" in item) {
              const similarity = (item as { similarity: unknown }).similarity;
              if (typeof similarity === "number") {
                return similarity;
              }
            }
            return 0;
          })(),
          metadata: item.metadata as Record<string, unknown> | undefined,
        }),
      ),
      count: limitedResults.length,
    });
  } catch (error) {
    logger.error("Error querying knowledge:", error);
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
