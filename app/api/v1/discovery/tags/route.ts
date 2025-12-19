/**
 * Discovery Tags API
 *
 * Returns all available tags from registered agents/services
 * for use in search context and filtering.
 *
 * This endpoint aggregates tags from both:
 * - Local Eliza Cloud marketplace
 * - ERC-8004 registry (via indexer)
 *
 * @route GET /api/v1/discovery/tags
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { charactersService } from "@/lib/services/characters";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

// ============================================================================
// Types
// ============================================================================

interface TagInfo {
  tag: string;
  count: number;
  source: "local" | "erc8004" | "both";
  categories?: string[];
}

interface TagsResponse {
  tags: TagInfo[];
  total: number;
  categories: Array<{
    category: string;
    tags: string[];
    count: number;
  }>;
  /** Recommended tags for agent discovery */
  recommended: string[];
}

// ============================================================================
// Predefined Tag Categories
// ============================================================================

const TAG_CATEGORIES: Record<string, string[]> = {
  capabilities: [
    "chat",
    "image-generation",
    "video-generation",
    "code-generation",
    "text-to-speech",
    "speech-to-text",
    "embeddings",
    "translation",
    "summarization",
    "question-answering",
    "tool-use",
    "function-calling",
    "web-search",
    "file-processing",
    "data-analysis",
    "reasoning",
  ],
  domains: [
    "finance",
    "healthcare",
    "education",
    "entertainment",
    "gaming",
    "productivity",
    "social",
    "creative",
    "research",
    "legal",
    "marketing",
    "sales",
    "support",
    "engineering",
    "devops",
  ],
  protocols: [
    "mcp",
    "a2a",
    "openai",
    "anthropic",
    "rest",
    "graphql",
    "websocket",
    "grpc",
    "x402",
    "oauth",
  ],
  trust: [
    "verified",
    "staked",
    "tee-attested",
    "reputation-scored",
    "crypto-economic",
    "audited",
  ],
  pricing: ["free", "credits", "x402", "subscription", "pay-per-use"],
  status: ["active", "available", "online", "beta", "deprecated"],
};

// ============================================================================
// Query Validation
// ============================================================================

const querySchema = z.object({
  sources: z
    .string()
    .transform((s) => s.split(",") as ("local" | "erc8004")[])
    .optional(),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    logger.info("[Discovery/Tags] Request received");

    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams);

    const parseResult = querySchema.safeParse(rawParams);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const params = parseResult.data;
    const cacheKey = `discovery:tags:${params.sources?.join(",") || "all"}:${params.category || "all"}`;

    // Cache for 10 minutes (tags don't change frequently)
    const cached = await cache.get<TagsResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const tagCounts = new Map<string, { local: number; erc8004: number }>();
    const sources = params.sources ?? ["local", "erc8004"];

    // ========================================================================
    // Collect tags from local sources
    // ========================================================================
    if (sources.includes("local")) {
      try {
        // Get character tags
        const characters = await charactersService.listPublic();

        for (const char of characters) {
          for (const tag of char.tags ?? []) {
            const normalizedTag = tag.toLowerCase().trim();
            const existing = tagCounts.get(normalizedTag) ?? {
              local: 0,
              erc8004: 0,
            };
            existing.local++;
            tagCounts.set(normalizedTag, existing);
          }
        }

        // Get MCP tags
        const mcps = await userMcpsService.listPublic({ limit: 500 });

        for (const mcp of mcps) {
          for (const tag of mcp.tags ?? []) {
            const normalizedTag = tag.toLowerCase().trim();
            const existing = tagCounts.get(normalizedTag) ?? {
              local: 0,
              erc8004: 0,
            };
            existing.local++;
            tagCounts.set(normalizedTag, existing);
          }
        }
      } catch (dbError) {
        logger.warn(
          "[Discovery/Tags] Database unavailable, skipping local sources",
          {
            error: dbError instanceof Error ? dbError.message : String(dbError),
          },
        );
      }
    }

    // ========================================================================
    // Collect tags from ERC-8004 registry
    // ========================================================================
    if (sources.includes("erc8004")) {
      try {
        const agents = await agent0Service.searchAgentsCached({ active: true });
        logger.info("[Discovery/Tags] Fetched ERC-8004 agents", {
          count: agents.length,
        });

        for (const agent of agents) {
          // Extract tags from agent metadata
          // Include actual tags array, mcpTools, and a2aSkills
          const agentTags = [
            ...(agent.tags ?? []),
            ...(agent.mcpTools ?? []),
            ...(agent.a2aSkills ?? []),
          ];

          for (const tag of agentTags) {
            const normalizedTag = tag.toLowerCase().trim();
            if (!normalizedTag) continue;
            const existing = tagCounts.get(normalizedTag) ?? {
              local: 0,
              erc8004: 0,
            };
            existing.erc8004++;
            tagCounts.set(normalizedTag, existing);
          }
        }
      } catch (erc8004Error) {
        logger.warn("[Discovery/Tags] ERC-8004 query failed", {
          error:
            erc8004Error instanceof Error
              ? erc8004Error.message
              : String(erc8004Error),
        });
      }
    }

    // ========================================================================
    // Build response
    // ========================================================================
    const tags: TagInfo[] = [];

    for (const [tag, counts] of tagCounts.entries()) {
      // Determine source
      let source: "local" | "erc8004" | "both";
      if (counts.local > 0 && counts.erc8004 > 0) {
        source = "both";
      } else if (counts.local > 0) {
        source = "local";
      } else {
        source = "erc8004";
      }

      // Find categories this tag belongs to
      const tagCategories = Object.entries(TAG_CATEGORIES)
        .filter(([_, categoryTags]) => categoryTags.includes(tag))
        .map(([category]) => category);

      tags.push({
        tag,
        count: counts.local + counts.erc8004,
        source,
        categories: tagCategories.length > 0 ? tagCategories : undefined,
      });
    }

    // Sort by count descending
    tags.sort((a, b) => b.count - a.count);

    // Apply limit
    const limitedTags = tags.slice(0, params.limit);

    // Build category summary
    const categoryMap = new Map<string, { tags: Set<string>; count: number }>();

    for (const tagInfo of limitedTags) {
      for (const category of tagInfo.categories ?? []) {
        const existing = categoryMap.get(category) ?? {
          tags: new Set(),
          count: 0,
        };
        existing.tags.add(tagInfo.tag);
        existing.count += tagInfo.count;
        categoryMap.set(category, existing);
      }
    }

    const categories = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        tags: Array.from(data.tags),
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count);

    // Recommended tags (most popular from key categories)
    const recommended = tags
      .filter((t) =>
        t.categories?.some((c) => ["capabilities", "domains"].includes(c)),
      )
      .slice(0, 20)
      .map((t) => t.tag);

    const response: TagsResponse = {
      tags: limitedTags,
      total: tags.length,
      categories,
      recommended,
    };

    await cache.set(cacheKey, response, CacheTTL.erc8004.discovery);

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[Discovery/Tags] Error fetching tags", {
      error: errorMessage,
    });
    return NextResponse.json(
      { error: "Internal server error", message: errorMessage },
      { status: 500 },
    );
  }
}

// ============================================================================
// Well-known tags endpoint for agents
// ============================================================================

export const WELL_KNOWN_TAGS = TAG_CATEGORIES;
