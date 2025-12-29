import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { z } from "zod";
import { userMcpsService } from "@/lib/services/user-mcps";
import { agent0Service } from "@/lib/services/agent0";
import { getDefaultNetwork, CHAIN_IDS } from "@/lib/config/erc8004";

export const dynamic = "force-dynamic";

// SECURITY FIX: Validate query parameters to prevent DoS attacks
// Whitelist allowed values and enforce length limits
const queryParamsSchema = z.object({
  category: z
    .enum([
      "all",
      "finance",
      "utilities",
      "platform",
      "search",
      "communication",
      "productivity",
      "data",
      "ai",
    ])
    .optional()
    .default("all")
    .describe("Filter by MCP server category"),
  status: z
    .enum(["all", "live", "coming_soon", "maintenance"])
    .optional()
    .default("all")
    .describe("Filter by server status"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(100)
    .describe("Maximum number of results to return"),
  search: z
    .string()
    .max(100)
    .optional()
    .describe("Search term for filtering by name or description"),
  includeExternal: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include external ERC-8004 registered MCPs"),
});

/**
 * MCP Server Registry Entry
 * Defines an MCP server that can be enabled on agents
 */
export interface McpRegistryEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoint: string;
  type: "http" | "sse" | "streamable-http";
  version: string;
  status: "live" | "coming_soon" | "maintenance";
  icon: string;
  color: string;
  toolCount: number;
  features: string[];
  pricing: {
    type: "free" | "credits" | "x402";
    description: string;
    pricePerRequest?: string;
  };
  x402Enabled: boolean;
  documentation?: string;
  // Config to inject into character settings
  configTemplate: {
    servers: Record<
      string,
      {
        type: "http" | "sse" | "streamable-http";
        url: string;
      }
    >;
  };
}

/**
 * Registry of available MCP servers
 * These can be enabled on agents via their character settings
 */
const MCP_REGISTRY: McpRegistryEntry[] = [
  {
    id: "todo-app",
    name: "Todo App",
    description:
      "Personal task management with gamification. Create daily habits, one-off tasks, and aspirational goals. Track points, streaks, and level up!",
    category: "productivity",
    endpoint: "/api/mcp/todoapp",
    type: "http",
    version: "1.0.0",
    status: "live",
    icon: "check-square",
    color: "#10B981",
    toolCount: 6,
    features: [
      "create_task",
      "list_tasks",
      "complete_task",
      "update_task",
      "delete_task",
      "get_points",
    ],
    pricing: {
      type: "credits",
      description: "Uses your credit balance",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/todo-app",
    configTemplate: {
      servers: {
        "todo-app": {
          type: "http",
          url: "${BASE_URL}/api/mcp/todoapp",
        },
      },
    },
  },
  {
    id: "crypto-prices",
    name: "Crypto Prices",
    description:
      "Real-time cryptocurrency price data from major exchanges. Get current prices, 24h changes, market cap, and volume for thousands of cryptocurrencies.",
    category: "finance",
    endpoint: "/api/mcp/demos/crypto/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "live",
    icon: "coins",
    color: "#F7931A",
    toolCount: 3,
    features: ["get_price", "get_market_data", "list_trending"],
    pricing: {
      type: "free",
      description: "Free tier available",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/crypto-prices",
    configTemplate: {
      servers: {
        "crypto-prices": {
          type: "sse",
          url: "/api/mcp/demos/crypto/sse",
        },
      },
    },
  },
  {
    id: "time-server",
    name: "Time & Timezone",
    description:
      "Get current time, convert between timezones, and perform date calculations. Perfect for scheduling and time-aware agents.",
    category: "utilities",
    endpoint: "/api/mcp/demos/time/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "live",
    icon: "clock",
    color: "#6366F1",
    toolCount: 5,
    features: [
      "get_current_time",
      "convert_timezone",
      "format_date",
      "calculate_time_diff",
      "list_timezones",
    ],
    pricing: {
      type: "free",
      description: "Free to use",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/time",
    configTemplate: {
      servers: {
        "time-server": {
          type: "sse",
          url: "/api/mcp/demos/time/sse",
        },
      },
    },
  },
  {
    id: "weather",
    name: "Weather Data",
    description:
      "Current weather conditions and forecasts for locations worldwide. Temperature, humidity, wind, and more.",
    category: "utilities",
    endpoint: "/api/mcp/demos/weather/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "coming_soon",
    icon: "cloud",
    color: "#3B82F6",
    toolCount: 2,
    features: ["current_weather", "forecast"],
    pricing: {
      type: "credits",
      description: "0.001 credits per request",
      pricePerRequest: "0.001",
    },
    x402Enabled: false,
    configTemplate: {
      servers: {
        weather: {
          type: "sse",
          url: "/api/mcp/demos/weather/sse",
        },
      },
    },
  },
  {
    id: "eliza-platform",
    name: "ElizaOS Platform",
    description:
      "Access ElizaOS platform features: credits, usage, generations, conversations, and agent management via MCP.",
    category: "platform",
    endpoint: "/api/mcp",
    type: "http",
    version: "1.0.0",
    status: "live",
    icon: "puzzle",
    color: "#FF5800",
    toolCount: 25,
    features: [
      "check_credits",
      "get_usage",
      "generate_text",
      "generate_image",
      "list_agents",
      "conversation_management",
    ],
    pricing: {
      type: "credits",
      description: "Uses your credit balance (requires authentication)",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/platform",
    configTemplate: {
      servers: {
        "eliza-platform": {
          type: "http",
          url: "${BASE_URL}/api/mcp",
        },
      },
    },
  },
  {
    id: "web-search",
    name: "Web Search",
    description:
      "Search the web and retrieve information from websites. Powered by multiple search providers for comprehensive results.",
    category: "search",
    endpoint: "/api/mcp/demos/search/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "coming_soon",
    icon: "puzzle",
    color: "#10B981",
    toolCount: 2,
    features: ["search", "fetch_page"],
    pricing: {
      type: "credits",
      description: "0.01 credits per search",
      pricePerRequest: "0.01",
    },
    x402Enabled: false,
    configTemplate: {
      servers: {
        "web-search": {
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/demos/search/sse",
        },
      },
    },
  },
  {
    id: "org-tools",
    name: "Organization Tools",
    description:
      "Team coordination and management tools. Manage todos, check-ins, team members, and generate reports across Discord and Telegram.",
    category: "productivity",
    endpoint: "/api/mcp/org/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "live",
    icon: "users",
    color: "#8B5CF6",
    toolCount: 12,
    features: [
      "create_todo",
      "update_todo",
      "list_todos",
      "complete_todo",
      "get_todo_stats",
      "create_checkin_schedule",
      "record_checkin_response",
      "list_checkin_schedules",
      "generate_report",
      "add_team_member",
      "list_team_members",
      "get_platform_status",
    ],
    pricing: {
      type: "credits",
      description: "Uses your credit balance",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/org-tools",
    configTemplate: {
      servers: {
        "org-tools": {
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/org/sse",
        },
      },
    },
  },
  {
    id: "credentials",
    name: "Credentials & Secrets",
    description:
      "Secure credential management for AI agents. Store text secrets (API keys, tokens) and connect OAuth platforms (Discord, Twitter, Google, GitHub, Slack).",
    category: "platform",
    endpoint: "/api/mcp/credentials/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "live",
    icon: "key",
    color: "#EF4444",
    toolCount: 9,
    features: [
      "store_secret",
      "get_secret",
      "delete_secret",
      "list_secrets",
      "request_oauth",
      "get_credential",
      "get_platform_token",
      "revoke_credential",
      "list_credentials",
    ],
    pricing: {
      type: "free",
      description: "Free for all users",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/credentials",
    configTemplate: {
      servers: {
        credentials: {
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/credentials/sse",
        },
      },
    },
  },
  {
    id: "telegram",
    name: "Telegram",
    description:
      "Telegram messaging and group management. Send messages, manage chats, handle button interactions, and automate Telegram workflows.",
    category: "communication",
    endpoint: "/api/mcp/telegram/sse",
    type: "streamable-http",
    version: "1.0.0",
    status: "live",
    icon: "send",
    color: "#0088CC",
    toolCount: 7,
    features: [
      "send_telegram_message",
      "get_telegram_chat",
      "list_telegram_chats",
      "send_telegram_buttons",
      "answer_telegram_callback",
      "setup_telegram_webhook",
      "list_telegram_bots",
    ],
    pricing: {
      type: "credits",
      description: "Uses your credit balance",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/telegram",
    configTemplate: {
      servers: {
        telegram: {
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/telegram/sse",
        },
      },
    },
  },
];

/**
 * GET /api/mcp/registry
 * Returns the catalog of available MCP (Model Context Protocol) servers.
 * Supports filtering by category, status, search term, and pagination.
 * Authentication is optional - allows browsing without auth.
 *
 * @param request - Request with optional category, status, limit, and search query parameters.
 * @returns Filtered registry entries with categories, statuses, and pagination info.
 */
export async function GET(request: NextRequest) {
  try {
    // Optional auth - allow browsing registry without auth
    let isAuthenticated = false;
    try {
      await requireAuthOrApiKey(request);
      isAuthenticated = true;
    } catch {
      // Allow unauthenticated access to browse registry
    }

    // Get base URL for config templates
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get("host")
        ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`
        : "http://localhost:3000");

    // SECURITY FIX: Validate and sanitize query parameters
    // This prevents DoS attacks from extremely long strings or invalid values
    const rawParams = {
      category: request.nextUrl.searchParams.get("category") || "all",
      status: request.nextUrl.searchParams.get("status") || "all",
      limit: request.nextUrl.searchParams.get("limit")
        ? parseInt(request.nextUrl.searchParams.get("limit")!, 10)
        : 100,
      search: request.nextUrl.searchParams.get("search") || undefined,
      includeExternal:
        request.nextUrl.searchParams.get("includeExternal") === "true",
    };

    // Validate query parameters with Zod schema
    const validationResult = queryParamsSchema.safeParse(rawParams);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: validationResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
            received: issue.received,
          })),
        },
        { status: 400 },
      );
    }

    const { category, status, limit, search, includeExternal } =
      validationResult.data;

    // Process built-in registry entries
    const builtInRegistry = MCP_REGISTRY.map((entry) => ({
      ...entry,
      source: "platform" as const,
      configTemplate: {
        servers: Object.fromEntries(
          Object.entries(entry.configTemplate.servers).map(([key, value]) => [
            key,
            {
              ...value,
              url: value.url.replace("${BASE_URL}", ""),
            },
          ]),
        ),
      },
      fullEndpoint: entry.endpoint.startsWith("http")
        ? entry.endpoint
        : `${baseUrl}${entry.endpoint}`,
    }));

    // Fetch user MCPs (public, live)
    let userMcpRegistry: typeof builtInRegistry = [];
    try {
      const userMcps = await userMcpsService.listPublic({
        category: category !== "all" ? category : undefined,
        search,
        limit: 50,
      });

      userMcpRegistry = userMcps.map((mcp) => {
        const formatted = userMcpsService.toRegistryFormat(mcp, baseUrl);
        return {
          ...formatted,
          source: "community" as const,
          fullEndpoint: formatted.endpoint,
        };
      });
    } catch (error) {
      // If user MCPs fail to load, continue with built-in only
      logger.warn("[MCP Registry] Failed to load user MCPs", { error });
    }

    // Fetch external ERC-8004 registered MCPs if requested
    let externalMcpRegistry: typeof builtInRegistry = [];
    if (includeExternal) {
      try {
        const network = getDefaultNetwork();
        const chainId = CHAIN_IDS[network];

        // Search for services with MCP endpoints
        const externalAgents = await agent0Service.searchAgentsCached({
          name: search,
          active: true,
        });

        // Filter to only include agents with MCP endpoints
        const mcpAgents = externalAgents.filter((agent) => agent.mcpEndpoint);

        externalMcpRegistry = mcpAgents.map((agent) => ({
          id: `erc8004-${agent.agentId}`,
          name: agent.name,
          description: agent.description || "External MCP service",
          category: "external",
          endpoint: agent.mcpEndpoint!,
          type: "streamable-http" as const,
          version: "1.0.0",
          status: "live" as const,
          icon: "globe",
          color: "#8B5CF6",
          toolCount: agent.mcpTools?.length || 0,
          features: agent.mcpTools || [],
          pricing: {
            type: agent.x402Support ? ("x402" as const) : ("free" as const),
            description: agent.x402Support
              ? "Pay-per-request via x402"
              : "Free to use",
          },
          x402Enabled: agent.x402Support,
          source: "erc8004" as const,
          fullEndpoint: agent.mcpEndpoint!,
          configTemplate: {
            servers: {
              [agent.agentId.replace(":", "-")]: {
                type: "streamable-http" as const,
                url: agent.mcpEndpoint!,
              },
            },
          },
          // ERC-8004 specific metadata
          erc8004: {
            agentId: agent.agentId,
            network,
            chainId,
            walletAddress: agent.walletAddress,
          },
        }));
      } catch (error) {
        logger.warn("[MCP Registry] Failed to load ERC-8004 MCPs", { error });
      }
    }

    // Combine registries
    const registry = [
      ...builtInRegistry,
      ...userMcpRegistry,
      ...externalMcpRegistry,
    ];

    let filteredRegistry = registry;

    // Apply category filter with validated input
    if (category && category !== "all") {
      filteredRegistry = filteredRegistry.filter(
        (e) => e.category === category,
      );
    }

    // Apply status filter with validated input
    if (status && status !== "all") {
      filteredRegistry = filteredRegistry.filter((e) => e.status === status);
    }

    // Apply search filter if provided (case-insensitive)
    if (search && search.trim().length > 0) {
      const searchLower = search.toLowerCase().trim();
      filteredRegistry = filteredRegistry.filter(
        (e) =>
          e.name.toLowerCase().includes(searchLower) ||
          e.description.toLowerCase().includes(searchLower) ||
          e.features.some((f) => f.toLowerCase().includes(searchLower)),
      );
    }

    // Apply limit with validated input
    filteredRegistry = filteredRegistry.slice(0, limit);

    // Get unique categories from the full registry
    const categories = [...new Set(registry.map((e) => e.category))];
    const statuses = [...new Set(registry.map((e) => e.status))];

    return NextResponse.json({
      registry: filteredRegistry,
      categories,
      statuses,
      total: filteredRegistry.length,
      totalInRegistry: registry.length,
      platformMcps: builtInRegistry.length,
      communityMcps: userMcpRegistry.length,
      externalMcps: externalMcpRegistry.length,
      appliedFilters: {
        category: category !== "all" ? category : null,
        status: status !== "all" ? status : null,
        search: search || null,
        limit,
        includeExternal,
      },
      isAuthenticated,
    });
  } catch (error) {
    logger.error("[MCP Registry] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch registry",
      },
      { status: 500 },
    );
  }
}
