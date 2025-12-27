/**
 * ERC-8004 Tags API
 *
 * Provides available tags for agent discovery and search context.
 * Tags are organized by category (skills, domains, MCP categories, capabilities).
 *
 * GET /api/v1/erc8004/tags - Get all available discovery tags
 * GET /api/v1/erc8004/tags?withCounts=true - Include usage counts
 */

import { NextRequest, NextResponse } from "next/server";
import { erc8004MarketplaceService } from "@/lib/services/erc8004-marketplace";
import {
  AGENT_SKILL_TAGS,
  AGENT_DOMAIN_TAGS,
  MCP_CATEGORY_TAGS,
  CAPABILITY_TAGS,
  getTagMetadata,
} from "@/lib/types/erc8004-marketplace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const withCounts = searchParams.get("withCounts") === "true";

  // Get counts if requested
  let tagsWithCounts: { tag: string; count: number }[] = [];
  if (withCounts) {
    const tagGroups = await erc8004MarketplaceService.getAvailableTags();
    tagsWithCounts = tagGroups.flatMap((g) => g.tags);
  }

  const countMap = new Map(tagsWithCounts.map((t) => [t.tag, t.count]));

  // Build response with all tags organized by category
  const response = {
    skills: AGENT_SKILL_TAGS.map((tag) => ({
      id: tag,
      ...getTagMetadata(tag),
      count: countMap.get(tag) || 0,
    })),
    domains: AGENT_DOMAIN_TAGS.map((tag) => ({
      id: tag,
      ...getTagMetadata(tag),
      count: countMap.get(tag) || 0,
    })),
    mcpCategories: MCP_CATEGORY_TAGS.map((tag) => ({
      id: tag,
      ...getTagMetadata(tag),
      count: countMap.get(tag) || 0,
    })),
    capabilities: CAPABILITY_TAGS.map((tag) => ({
      id: tag,
      ...getTagMetadata(tag),
      count: countMap.get(tag) || 0,
    })),
    // Flat list for simple access
    all: [
      ...AGENT_SKILL_TAGS,
      ...AGENT_DOMAIN_TAGS,
      ...MCP_CATEGORY_TAGS,
      ...CAPABILITY_TAGS,
    ],
    // Summary counts
    summary: {
      totalTags:
        AGENT_SKILL_TAGS.length +
        AGENT_DOMAIN_TAGS.length +
        MCP_CATEGORY_TAGS.length +
        CAPABILITY_TAGS.length,
      skillTags: AGENT_SKILL_TAGS.length,
      domainTags: AGENT_DOMAIN_TAGS.length,
      mcpTags: MCP_CATEGORY_TAGS.length,
      capabilityTags: CAPABILITY_TAGS.length,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}
