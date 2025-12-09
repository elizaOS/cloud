/**
 * Discovery Tools API
 *
 * Returns all available MCP tools across the marketplace.
 * Useful for agents to discover what capabilities are available.
 *
 * @route GET /api/v1/discovery/tools
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";

// ============================================================================
// Types
// ============================================================================

interface ToolInfo {
  /** Tool name */
  name: string;
  /** Tool description */
  description?: string;
  /** Which service provides this tool */
  provider: {
    id: string;
    name: string;
    type: "local" | "erc8004";
    mcpEndpoint?: string;
  };
  /** Category of the tool */
  category?: string;
  /** Whether x402 payment is required */
  x402Required: boolean;
  /** Input schema if available */
  inputSchema?: Record<string, unknown>;
}

interface ToolsResponse {
  tools: ToolInfo[];
  total: number;
  /** Unique tool names (deduplicated) */
  uniqueTools: string[];
  /** Tools grouped by category */
  byCategory: Record<string, ToolInfo[]>;
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
  const cacheKey = `discovery:tools:${JSON.stringify(params)}`;

  // Check cache (10 minutes TTL)
  const cached = await cache.get<ToolsResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, meta: { ...cached.meta, cached: true } });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";
  const allTools: ToolInfo[] = [];

  // ========================================================================
  // Get tools from local MCPs
  // ========================================================================

  const localMcps = await userMcpsService.listPublic({ limit: 200 });

  for (const mcp of localMcps) {
    if (mcp.status !== "live") continue;
    const endpoint = userMcpsService.getEndpointUrl(mcp, baseUrl);

    for (const tool of mcp.tools ?? []) {
      allTools.push({
        name: tool.name,
        description: tool.description,
        provider: {
          id: mcp.id,
          name: mcp.name,
          type: "local",
          mcpEndpoint: endpoint,
        },
        category: mcp.category,
        x402Required: mcp.x402_enabled,
        inputSchema: tool.inputSchema,
      });
    }
  }

  // ========================================================================
  // Get tools from ERC-8004 agents
  // ========================================================================

  const agents = await agent0Service.searchAgentsCached({ active: true });

  for (const agent of agents) {
    if (!agent.mcpEndpoint) continue;

    for (const toolName of agent.mcpTools ?? []) {
      allTools.push({
        name: toolName,
        provider: {
          id: agent.agentId,
          name: agent.name,
          type: "erc8004",
          mcpEndpoint: agent.mcpEndpoint,
        },
        x402Required: agent.x402Support,
      });
    }
  }

  // ========================================================================
  // Filter
  // ========================================================================

  let filtered = allTools;

  if (params.query) {
    const query = params.query.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        (t.description?.toLowerCase().includes(query) ?? false)
    );
  }

  if (params.category) {
    filtered = filtered.filter((t) => t.category === params.category);
  }

  if (params.x402Only) {
    filtered = filtered.filter((t) => t.x402Required);
  }

  // Sort by name
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // Limit
  const limited = filtered.slice(0, params.limit);

  // Build unique tools list
  const uniqueTools = Array.from(new Set(filtered.map((t) => t.name)));

  // Group by category
  const byCategory: Record<string, ToolInfo[]> = {};
  for (const tool of limited) {
    const cat = tool.category ?? "uncategorized";
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(tool);
  }

  const response: ToolsResponse = {
    tools: limited,
    total: filtered.length,
    uniqueTools,
    byCategory,
    meta: {
      cached: false,
      lastUpdated: new Date().toISOString(),
    },
  };

  // Cache for 10 minutes
  await cache.set(cacheKey, response, CacheTTL.erc8004.discovery);

  return NextResponse.json(response);
}

