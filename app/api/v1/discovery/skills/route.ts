/**
 * Discovery Skills API
 *
 * Returns all available A2A skills across the marketplace.
 * Useful for agents to discover what agent-to-agent interactions are available.
 *
 * @route GET /api/v1/discovery/skills
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agent0Service } from "@/lib/services/agent0";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";

// ============================================================================
// Types
// ============================================================================

interface SkillInfo {
  /** Skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Skill description */
  description?: string;
  /** Which service provides this skill */
  provider: {
    id: string;
    name: string;
    type: "local" | "erc8004";
    a2aEndpoint?: string;
  };
  /** Category of the skill */
  category?: string;
  /** Tags */
  tags?: string[];
  /** Whether x402 payment is required */
  x402Required: boolean;
  /** Input modes supported */
  inputModes?: string[];
  /** Output modes supported */
  outputModes?: string[];
}

interface SkillsResponse {
  skills: SkillInfo[];
  total: number;
  /** Unique skill names (deduplicated) */
  uniqueSkills: string[];
  /** Skills grouped by category */
  byCategory: Record<string, SkillInfo[]>;
  meta: {
    cached: boolean;
    lastUpdated: string;
  };
}

// ============================================================================
// Query Validation
// ============================================================================

const querySchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  x402Only: z
    .string()
    .transform((s) => s === "true")
    .optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams);

    const parseResult = querySchema.safeParse(rawParams);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const params = parseResult.data;
    const cacheKey = `discovery:skills:${JSON.stringify(params)}`;

    // Check cache (10 minutes TTL)
    const cached = await cache.get<SkillsResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, meta: { ...cached.meta, cached: true } });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";
    const allSkills: SkillInfo[] = [];

    // ========================================================================
    // Get skills from local agents (marketplace characters)
    // ========================================================================
    try {
      const result = await characterMarketplaceService.searchCharactersPublic({
        filters: {},
        sortOptions: { field: "popularity_score", direction: "desc" },
        pagination: { limit: 200, page: 1 },
        includeStats: false,
      });

      for (const char of result.characters) {
        const endpoint = `${baseUrl}/api/agents/${char.id}/a2a`;

        // Each character exposes a "chat" skill by default
        allSkills.push({
          id: `${char.id}-chat`,
          name: "Chat",
          description: `Chat with ${char.name}`,
          provider: {
            id: char.id,
            name: char.name,
            type: "local",
            a2aEndpoint: endpoint,
          },
          category: char.category ?? "ai",
          tags: char.tags ?? [],
          x402Required: false, // Characters use credits
          inputModes: ["text"],
          outputModes: ["text"],
        });
      }
    } catch {
      // Database unavailable - continue with ERC-8004 only
    }

  // ========================================================================
  // Get skills from ERC-8004 agents
  // ========================================================================

  const agents = await agent0Service.searchAgentsCached({ active: true });

  for (const agent of agents) {
    if (!agent.a2aEndpoint) continue;

    for (const skillName of agent.a2aSkills ?? []) {
      allSkills.push({
        id: `${agent.agentId}-${skillName}`,
        name: skillName,
        provider: {
          id: agent.agentId,
          name: agent.name,
          type: "erc8004",
          a2aEndpoint: agent.a2aEndpoint,
        },
        x402Required: agent.x402Support,
      });
    }

    // If no skills listed but has A2A endpoint, add default "chat" skill
    if (!agent.a2aSkills?.length) {
      allSkills.push({
        id: `${agent.agentId}-chat`,
        name: "Chat",
        description: `Interact with ${agent.name}`,
        provider: {
          id: agent.agentId,
          name: agent.name,
          type: "erc8004",
          a2aEndpoint: agent.a2aEndpoint,
        },
        x402Required: agent.x402Support,
        inputModes: ["text"],
        outputModes: ["text"],
      });
    }
  }

  // ========================================================================
  // Filter
  // ========================================================================

  let filtered = allSkills;

  if (params.query) {
    const query = params.query.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.description?.toLowerCase().includes(query) ?? false)
    );
  }

  if (params.category) {
    filtered = filtered.filter((s) => s.category === params.category);
  }

  if (params.x402Only) {
    filtered = filtered.filter((s) => s.x402Required);
  }

  // Sort by name
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // Limit
  const limited = filtered.slice(0, params.limit);

  // Build unique skills list
  const uniqueSkills = Array.from(new Set(filtered.map((s) => s.name)));

  // Group by category
  const byCategory: Record<string, SkillInfo[]> = {};
  for (const skill of limited) {
    const cat = skill.category ?? "uncategorized";
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(skill);
  }

  const response: SkillsResponse = {
    skills: limited,
    total: filtered.length,
    uniqueSkills,
    byCategory,
    meta: {
      cached: false,
      lastUpdated: new Date().toISOString(),
    },
  };

  // Cache for 10 minutes
  await cache.set(cacheKey, response, CacheTTL.erc8004.discovery);

  return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

