import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/demos/crypto/sse",
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
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/demos/time/sse",
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
    endpoint: "/api/mcp/demos/weather/mcp",
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
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/demos/weather/mcp",
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
    endpoint: "/api/mcp/sse",
    type: "streamable-http",
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
      description: "Uses your credit balance",
    },
    x402Enabled: false,
    documentation: "https://docs.elizaos.ai/mcps/platform",
    configTemplate: {
      servers: {
        "eliza-platform": {
          type: "streamable-http",
          url: "${BASE_URL}/api/mcp/sse",
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
];

/**
 * GET /api/mcp/registry
 * Returns the catalog of available MCP servers
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

    // Process registry entries with base URL
    const registry = MCP_REGISTRY.map((entry) => ({
      ...entry,
      configTemplate: {
        servers: Object.fromEntries(
          Object.entries(entry.configTemplate.servers).map(([key, value]) => [
            key,
            {
              ...value,
              url: value.url.replace("${BASE_URL}", baseUrl),
            },
          ]),
        ),
      },
      // Include full endpoint URL
      fullEndpoint: entry.endpoint.startsWith("http")
        ? entry.endpoint
        : `${baseUrl}${entry.endpoint}`,
    }));

    // Filter by category if provided
    const category = request.nextUrl.searchParams.get("category");
    const status = request.nextUrl.searchParams.get("status");

    let filteredRegistry = registry;

    if (category && category !== "all") {
      filteredRegistry = filteredRegistry.filter(
        (e) => e.category === category,
      );
    }

    if (status && status !== "all") {
      filteredRegistry = filteredRegistry.filter((e) => e.status === status);
    }

    // Get unique categories
    const categories = [...new Set(MCP_REGISTRY.map((e) => e.category))];

    return NextResponse.json({
      registry: filteredRegistry,
      categories,
      total: filteredRegistry.length,
      isAuthenticated,
    });
  } catch (error) {
    console.error("[MCP Registry] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch registry",
      },
      { status: 500 },
    );
  }
}
