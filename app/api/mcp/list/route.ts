import { NextResponse } from "next/server";

// MCP definitions with their tools and schemas
const mcpDefinitions = [
  {
    id: "eliza-cloud-mcp",
    name: "ElizaOS Cloud MCP",
    description:
      "Core ElizaOS Cloud platform MCP with credit management, AI generation, memory, conversations, and agent interaction capabilities",
    version: "1.0.0",
    endpoint: "/api/mcp",
    category: "platform",
    status: "live",
    x402Enabled: false,
    pricing: { type: "credits", description: "Pay-per-use with credits" },
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
    id: "time-mcp",
    name: "Time & Date MCP",
    description:
      "Get current time, timezone conversions, and date calculations. Perfect for scheduling and time-aware applications.",
    version: "1.0.0",
    endpoint: "/api/mcp/demos/time",
    category: "utilities",
    status: "live",
    x402Enabled: false,
    pricing: { type: "credits", description: "1 credit per request", creditsPerRequest: 1 },
    tools: [
      { name: "get_current_time", description: "Get current date and time", cost: "1 credit" },
      { name: "convert_timezone", description: "Convert between timezones", cost: "1 credit" },
      { name: "format_date", description: "Format dates in various styles", cost: "1 credit" },
      { name: "calculate_time_diff", description: "Calculate time differences", cost: "1 credit" },
    ],
  },
  {
    id: "weather-mcp",
    name: "Weather MCP",
    description:
      "Real-time weather data, forecasts, and alerts. Supports both credits and x402 micropayments.",
    version: "1.0.0",
    endpoint: "/api/mcp/demos/weather",
    category: "data",
    status: "live",
    x402Enabled: true,
    pricing: { type: "credits", description: "1-3 credits per request (or x402)", creditsPerRequest: "1-3" },
    tools: [
      { name: "get_current_weather", description: "Get current weather conditions", cost: "2 credits" },
      { name: "get_weather_forecast", description: "Get 5-day forecast", cost: "3 credits" },
      { name: "get_weather_alerts", description: "Check active weather alerts", cost: "1 credit" },
    ],
  },
  {
    id: "crypto-mcp",
    name: "Crypto Price MCP",
    description:
      "Real-time cryptocurrency prices, market data, and historical charts. Supports both credits and x402 payments.",
    version: "1.0.0",
    endpoint: "/api/mcp/demos/crypto",
    category: "finance",
    status: "live",
    x402Enabled: true,
    pricing: { type: "credits", description: "1-3 credits per request (or x402)", creditsPerRequest: "1-3" },
    tools: [
      { name: "get_crypto_price", description: "Get current price for a token", cost: "1 credit" },
      { name: "get_market_data", description: "Get market cap, volume, supply", cost: "2 credits" },
      { name: "get_price_history", description: "Get historical price data", cost: "3 credits" },
      { name: "get_token_info", description: "Get token details and chains", cost: "1 credit" },
      { name: "get_top_tokens", description: "Get top tokens by market cap", cost: "2 credits" },
    ],
  },
];

export async function GET() {
  return NextResponse.json({
    mcps: mcpDefinitions,
    total: mcpDefinitions.length,
    categories: ["platform", "utilities", "data", "finance"],
  });
}
