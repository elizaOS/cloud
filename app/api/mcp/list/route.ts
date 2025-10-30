import { NextResponse } from "next/server";

// MCP definitions with their tools and schemas
const mcpDefinitions = [
  {
    id: "eliza-cloud",
    name: "ElizaOS Cloud MCP",
    description:
      "Core ElizaOS Cloud platform MCP with credit management, AI generation, memory, conversations, and agent interaction capabilities",
    version: "1.0.0",
    endpoint: "/api/mcp",
    category: "platform",
    pricing: { type: "credits", base: "varies per tool" },
    tools: [
      {
        name: "check_credits",
        description:
          "Check credit balance and recent transactions for your organization",
        parameters: {
          includeTransactions: {
            type: "boolean",
            optional: true,
            description: "Include recent transactions in the response",
          },
          limit: {
            type: "number",
            optional: true,
            default: 5,
            description: "Number of recent transactions to include",
            min: 1,
            max: 20,
          },
        },
        cost: "FREE",
      },
      {
        name: "get_recent_usage",
        description:
          "Get recent API usage statistics including models used, costs, and tokens",
        parameters: {
          limit: {
            type: "number",
            optional: true,
            default: 10,
            description: "Number of recent usage records to fetch",
            min: 1,
            max: 50,
          },
        },
        cost: "FREE",
      },
      {
        name: "generate_text",
        description:
          "Generate text using AI models (GPT-4, Claude, Gemini). Deducts credits based on token usage.",
        parameters: {
          prompt: {
            type: "string",
            description: "The text prompt to generate from",
            min: 1,
            max: 10000,
          },
          model: {
            type: "enum",
            options: [
              "gpt-4o",
              "gpt-4o-mini",
              "claude-3-5-sonnet-20241022",
              "gemini-2.0-flash-exp",
            ],
            optional: true,
            default: "gpt-4o",
            description: "The AI model to use for generation",
          },
          maxLength: {
            type: "number",
            optional: true,
            default: 1000,
            description: "Maximum length of generated text",
            min: 1,
            max: 4000,
          },
        },
        cost: "$0.0001-$0.01",
      },
      {
        name: "generate_image",
        description:
          "Generate images using Google Gemini 2.5. Deducts credits per image generated.",
        parameters: {
          prompt: {
            type: "string",
            description: "Description of the image to generate",
            min: 1,
            max: 5000,
          },
          aspectRatio: {
            type: "enum",
            options: ["1:1", "16:9", "9:16", "4:3", "3:4"],
            optional: true,
            default: "1:1",
            description: "Aspect ratio for the generated image",
          },
        },
        cost: "50 credits",
      },
      {
        name: "save_memory",
        description:
          "Save important information to long-term memory with semantic tagging. Deducts 1 credit per save.",
        parameters: {
          content: {
            type: "string",
            description: "The memory content to save",
            min: 1,
            max: 10000,
          },
          type: {
            type: "enum",
            options: ["fact", "preference", "context", "document"],
            description: "Type of memory being saved",
          },
          roomId: {
            type: "string",
            description: "Room ID to associate memory with (required)",
          },
          tags: {
            type: "array",
            optional: true,
            description: "Optional tags for categorization",
          },
        },
        cost: "1 credit",
      },
      {
        name: "retrieve_memories",
        description:
          "Search and retrieve memories using semantic search or filters. Deducts 0.1 credit per memory retrieved (max 5 credits).",
        parameters: {
          query: {
            type: "string",
            optional: true,
            description: "Semantic search query",
          },
          roomId: {
            type: "string",
            optional: true,
            description: "Filter to specific room/conversation",
          },
          limit: {
            type: "number",
            optional: true,
            default: 10,
            description: "Maximum results to return",
            min: 1,
            max: 50,
          },
        },
        cost: "0.1-5 credits",
      },
      {
        name: "chat_with_agent",
        description:
          "Send a message to your deployed ElizaOS agent and receive a response. Supports streaming via SSE.",
        parameters: {
          message: {
            type: "string",
            description: "Message to send to the agent",
            min: 1,
            max: 4000,
          },
          roomId: {
            type: "string",
            optional: true,
            description: "Existing conversation room ID",
          },
          streaming: {
            type: "boolean",
            optional: true,
            default: false,
            description: "Enable streaming response via SSE",
          },
        },
        cost: "$0.0001-$0.01",
      },
      {
        name: "list_agents",
        description:
          "List all available agents, characters, and deployed ElizaOS instances.",
        parameters: {
          filters: {
            type: "object",
            optional: true,
            description: "Filter options for deployed/template/owned agents",
          },
          includeStats: {
            type: "boolean",
            optional: true,
            default: false,
            description: "Include agent statistics",
          },
        },
        cost: "FREE",
      },
      {
        name: "list_containers",
        description: "List all deployed containers with status.",
        parameters: {
          status: {
            type: "enum",
            options: ["running", "stopped", "failed", "deploying"],
            optional: true,
            description: "Filter by container status",
          },
          includeMetrics: {
            type: "boolean",
            optional: true,
            default: false,
            description: "Include container metrics",
          },
        },
        cost: "FREE",
      },
    ],
  },
  {
    id: "coingecko",
    name: "CoinGecko Crypto API",
    description:
      "Real-time cryptocurrency data from CoinGecko including prices, market data, trending coins, and historical charts",
    version: "1.0.0",
    endpoint: "/api/mcp/coingecko",
    category: "crypto",
    pricing: { type: "x402", base: "$0.01-$0.05 per call" },
    tools: [
      {
        name: "get_coin_price",
        description:
          "Get current price and market data for a cryptocurrency. Pay $0.02 to fetch real-time price, market cap, volume, and 24h change.",
        parameters: {
          coin_id: {
            type: "string",
            description: "CoinGecko coin ID (e.g., 'bitcoin', 'ethereum')",
          },
          vs_currency: {
            type: "string",
            optional: true,
            default: "usd",
            description: "Currency for price",
          },
          include_24hr_change: {
            type: "boolean",
            optional: true,
            default: true,
            description: "Include 24h price change",
          },
          include_market_cap: {
            type: "boolean",
            optional: true,
            default: true,
            description: "Include market cap",
          },
        },
        cost: "$0.02",
      },
      {
        name: "get_market_chart",
        description:
          "Get historical price chart data for a cryptocurrency. Pay $0.05 to fetch price history.",
        parameters: {
          coin_id: {
            type: "string",
            description: "CoinGecko coin ID",
          },
          vs_currency: {
            type: "string",
            optional: true,
            default: "usd",
            description: "Currency for price",
          },
          days: {
            type: "enum",
            options: ["1", "7", "14", "30", "90", "180", "365", "max"],
            optional: true,
            default: "7",
            description: "Number of days to fetch",
          },
        },
        cost: "$0.05",
      },
      {
        name: "get_trending_coins",
        description:
          "Get top trending cryptocurrencies on CoinGecko based on search volume and market activity.",
        parameters: {},
        cost: "$0.03",
      },
      {
        name: "search_coins",
        description:
          "Search for cryptocurrencies by name or symbol across 10,000+ coins.",
        parameters: {
          query: {
            type: "string",
            description: "Search query (name or symbol)",
          },
        },
        cost: "$0.01",
      },
      {
        name: "get_global_market_data",
        description:
          "Get global cryptocurrency market statistics including total market cap, volume, and BTC dominance.",
        parameters: {},
        cost: "$0.02",
      },
    ],
  },
  {
    id: "twitter",
    name: "Twitter/X Data API",
    description:
      "Access Twitter/X data including trending topics, tweet search, and user information",
    version: "1.0.0",
    endpoint: "/api/mcp/twitter",
    category: "social",
    pricing: { type: "x402", base: "$0.03-$0.10 per call" },
    tools: [
      {
        name: "get_trending_topics",
        description:
          "Get trending topics on Twitter/X for a specific location. Pay $0.10 to fetch current trending hashtags.",
        parameters: {
          woeid: {
            type: "number",
            optional: true,
            default: 1,
            description:
              "Where On Earth ID (1=Worldwide, 2459115=New York, 2487956=San Francisco)",
          },
        },
        cost: "$0.10",
      },
      {
        name: "search_tweets",
        description:
          "Search recent tweets on Twitter/X. Returns up to 100 recent tweets matching your query.",
        parameters: {
          query: {
            type: "string",
            description:
              "Search query (supports operators like from:username, #hashtag)",
          },
          max_results: {
            type: "number",
            optional: true,
            default: 10,
            description: "Maximum number of results (10-100)",
            min: 10,
            max: 100,
          },
          sort_order: {
            type: "enum",
            options: ["recency", "relevancy"],
            optional: true,
            default: "recency",
            description: "Sort order",
          },
        },
        cost: "$0.05",
      },
      {
        name: "get_user_info",
        description:
          "Get detailed information about a Twitter/X user by username including follower count and verification status.",
        parameters: {
          username: {
            type: "string",
            description: "Twitter username (without @)",
          },
        },
        cost: "$0.03",
      },
    ],
  },
  {
    id: "openai-image",
    name: "OpenAI Image Generator",
    description:
      "Generate high-quality AI images using OpenAI's gpt-image-1 model with advanced features",
    version: "1.0.0",
    endpoint: "/api/mcp/openai",
    category: "ai",
    pricing: { type: "x402", base: "$0.50 per image" },
    tools: [
      {
        name: "generate_image",
        description:
          "Generate an AI image using OpenAI's gpt-image-1 model. Features superior instruction following, text rendering, and detailed editing capabilities.",
        parameters: {
          prompt: {
            type: "string",
            description: "The description of the image to generate",
          },
          size: {
            type: "enum",
            options: ["1024x1024", "1536x1024", "1024x1536", "auto"],
            optional: true,
            default: "auto",
            description:
              "Image size: square, landscape, portrait, or auto",
          },
          quality: {
            type: "enum",
            options: ["low", "medium", "high", "auto"],
            optional: true,
            default: "auto",
            description: "Image quality level",
          },
          background: {
            type: "enum",
            options: ["transparent", "opaque", "auto"],
            optional: true,
            default: "auto",
            description: "Background type",
          },
          output_format: {
            type: "enum",
            options: ["png", "jpeg", "webp"],
            optional: true,
            default: "png",
            description: "Output format",
          },
        },
        cost: "$0.50",
      },
    ],
  },
];

export async function GET() {
  return NextResponse.json({
    mcps: mcpDefinitions,
    total: mcpDefinitions.length,
    categories: ["platform", "crypto", "social", "ai"],
  });
}

