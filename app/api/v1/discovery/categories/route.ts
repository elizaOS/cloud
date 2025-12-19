/**
 * Discovery Categories API
 *
 * Returns all available categories and their counts for marketplace filtering.
 *
 * @route GET /api/v1/discovery/categories
 */

import { NextRequest, NextResponse } from "next/server";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { charactersService } from "@/lib/services/characters";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";

// ============================================================================
// Types
// ============================================================================

interface CategoryInfo {
  category: string;
  displayName: string;
  description?: string;
  count: number;
  icon?: string;
  source: "local" | "erc8004" | "both";
}

interface CategoriesResponse {
  categories: CategoryInfo[];
  total: number;
  meta: {
    cached: boolean;
    lastUpdated: string;
  };
}

// ============================================================================
// Category Definitions
// ============================================================================

const CATEGORY_META: Record<
  string,
  { displayName: string; description: string; icon: string }
> = {
  ai: {
    displayName: "AI & Machine Learning",
    description: "AI-powered agents, inference, and ML tools",
    icon: "🧠",
  },
  defi: {
    displayName: "DeFi & Finance",
    description: "Decentralized finance, trading, and financial services",
    icon: "💰",
  },
  gaming: {
    displayName: "Gaming",
    description: "Game servers, NPCs, and gaming utilities",
    icon: "🎮",
  },
  social: {
    displayName: "Social",
    description: "Social media, messaging, and community tools",
    icon: "💬",
  },
  productivity: {
    displayName: "Productivity",
    description: "Workflow automation, task management, and productivity tools",
    icon: "📊",
  },
  utilities: {
    displayName: "Utilities",
    description: "General-purpose tools and utilities",
    icon: "🔧",
  },
  creative: {
    displayName: "Creative",
    description: "Art, music, writing, and creative tools",
    icon: "🎨",
  },
  developer: {
    displayName: "Developer Tools",
    description: "Development, debugging, and code assistance",
    icon: "💻",
  },
  data: {
    displayName: "Data & Analytics",
    description: "Data processing, analytics, and insights",
    icon: "📈",
  },
  storage: {
    displayName: "Storage",
    description: "File storage, IPFS, and data persistence",
    icon: "📦",
  },
  infrastructure: {
    displayName: "Infrastructure",
    description: "Cloud, compute, and infrastructure services",
    icon: "🏗️",
  },
  security: {
    displayName: "Security",
    description: "Authentication, encryption, and security tools",
    icon: "🔒",
  },
};

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(_request: NextRequest) {
  try {
    const cacheKey = "discovery:categories";

    // Check cache (15 minutes TTL)
    const cached = await cache.get<CategoriesResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        meta: { ...cached.meta, cached: true },
      });
    }

    const categoryCounts = new Map<
      string,
      { local: number; erc8004: number }
    >();

    // ========================================================================
    // Count from local sources (with graceful fallback)
    // ========================================================================
    try {
      // Characters
      const characters = await charactersService.listPublic();
      for (const char of characters) {
        if (char.category) {
          const existing = categoryCounts.get(char.category) ?? {
            local: 0,
            erc8004: 0,
          };
          existing.local++;
          categoryCounts.set(char.category, existing);
        }
      }

      // MCPs
      const mcps = await userMcpsService.listPublic({ limit: 500 });
      for (const mcp of mcps) {
        if (mcp.category) {
          const existing = categoryCounts.get(mcp.category) ?? {
            local: 0,
            erc8004: 0,
          };
          existing.local++;
          categoryCounts.set(mcp.category, existing);
        }
      }
    } catch {
      // Database unavailable - continue with ERC-8004 only
    }

    // ========================================================================
    // Count from ERC-8004
    // ========================================================================

    const agents = await agent0Service.searchAgentsCached({ active: true });
    for (const agent of agents) {
      // Try to infer category from tools/skills
      const category = inferCategory(agent);
      if (category) {
        const existing = categoryCounts.get(category) ?? {
          local: 0,
          erc8004: 0,
        };
        existing.erc8004++;
        categoryCounts.set(category, existing);
      }
    }

    // ========================================================================
    // Build response
    // ========================================================================

    const categories: CategoryInfo[] = [];

    for (const [category, counts] of categoryCounts.entries()) {
      const meta = CATEGORY_META[category] ?? {
        displayName: category.charAt(0).toUpperCase() + category.slice(1),
        description: `${category} services and tools`,
        icon: "📁",
      };

      let source: "local" | "erc8004" | "both";
      if (counts.local > 0 && counts.erc8004 > 0) {
        source = "both";
      } else if (counts.local > 0) {
        source = "local";
      } else {
        source = "erc8004";
      }

      categories.push({
        category,
        displayName: meta.displayName,
        description: meta.description,
        count: counts.local + counts.erc8004,
        icon: meta.icon,
        source,
      });
    }

    // Sort by count descending
    categories.sort((a, b) => b.count - a.count);

    const response: CategoriesResponse = {
      categories,
      total: categories.length,
      meta: {
        cached: false,
        lastUpdated: new Date().toISOString(),
      },
    };

    // Cache for 15 minutes
    await cache.set(cacheKey, response, CacheTTL.erc8004.discovery);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Infer category from agent tools/skills
 */
function inferCategory(agent: {
  mcpTools?: string[];
  a2aSkills?: string[];
  name: string;
  description?: string;
}): string | undefined {
  const allTerms = [
    ...(agent.mcpTools ?? []),
    ...(agent.a2aSkills ?? []),
    agent.name.toLowerCase(),
    (agent.description ?? "").toLowerCase(),
  ]
    .join(" ")
    .toLowerCase();

  if (
    allTerms.includes("chat") ||
    allTerms.includes("llm") ||
    allTerms.includes("inference") ||
    allTerms.includes("gpt")
  ) {
    return "ai";
  }
  if (
    allTerms.includes("swap") ||
    allTerms.includes("trade") ||
    allTerms.includes("defi") ||
    allTerms.includes("price")
  ) {
    return "defi";
  }
  if (
    allTerms.includes("game") ||
    allTerms.includes("npc") ||
    allTerms.includes("play")
  ) {
    return "gaming";
  }
  if (
    allTerms.includes("tweet") ||
    allTerms.includes("discord") ||
    allTerms.includes("social") ||
    allTerms.includes("post")
  ) {
    return "social";
  }
  if (
    allTerms.includes("storage") ||
    allTerms.includes("ipfs") ||
    allTerms.includes("file") ||
    allTerms.includes("upload")
  ) {
    return "storage";
  }
  if (
    allTerms.includes("code") ||
    allTerms.includes("debug") ||
    allTerms.includes("github") ||
    allTerms.includes("deploy")
  ) {
    return "developer";
  }
  if (
    allTerms.includes("image") ||
    allTerms.includes("art") ||
    allTerms.includes("music") ||
    allTerms.includes("video")
  ) {
    return "creative";
  }

  return "utilities";
}
