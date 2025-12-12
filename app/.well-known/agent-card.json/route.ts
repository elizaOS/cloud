/**
 * A2A Agent Card Endpoint
 *
 * Returns the Agent Card following Google's Agent-to-Agent (A2A) protocol.
 * This enables other AI agents to discover and interact with Eliza Cloud services.
 *
 * @see https://google.github.io/a2a-spec/
 */

import { NextResponse } from "next/server";
import { X402_ENABLED, X402_DEFAULT_NETWORK } from "@/lib/config/x402";

/**
 * A2A Protocol Types conforming to the specification
 * @see https://google.github.io/a2a-spec/
 */

interface AgentProvider {
  organization: string;
  url?: string;
}

interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extensions?: AgentExtension[];
}

interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

interface SecurityScheme {
  scheme: string;
  description?: string;
}

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  inputModes?: ("text" | "image" | "audio" | "video" | "file" | "data")[];
  outputModes?: ("text" | "image" | "audio" | "video" | "file" | "data")[];
}

interface AgentInterface {
  url: string;
  transport: "JSONRPC" | "GRPC" | "HTTP+JSON";
}

interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: "JSONRPC" | "GRPC" | "HTTP+JSON";
  additionalInterfaces?: AgentInterface[];
  provider?: AgentProvider;
  version?: string;
  documentationUrl?: string;
  capabilities: AgentCapabilities;
  authentication: {
    schemes: SecurityScheme[];
    credentials?: string;
  };
  defaultInputModes?: (
    | "text"
    | "image"
    | "audio"
    | "video"
    | "file"
    | "data"
  )[];
  defaultOutputModes?: (
    | "text"
    | "image"
    | "audio"
    | "video"
    | "file"
    | "data"
  )[];
  skills: AgentSkill[];
}

/**
 * GET /.well-known/agent-card.json
 *
 * Returns the A2A Agent Card describing Eliza Cloud's capabilities.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  const agentCard: AgentCard = {
    protocolVersion: "0.3.0",
    name: "Eliza Cloud",
    description:
      "AI agent infrastructure service providing inference, generation, " +
      "character creation/management, group chats, memory systems, knowledge bases, " +
      "and containerized agent deployment. Supports OpenAI-compatible API, " +
      "MCP protocol, and A2A protocol.",
    url: `${baseUrl}/api/a2a`,
    preferredTransport: "JSONRPC",
    additionalInterfaces: [{ url: `${baseUrl}/api/a2a`, transport: "JSONRPC" }],
    provider: {
      organization: "Eliza Cloud",
      url: baseUrl,
    },
    version: "1.0.0",
    documentationUrl: `${baseUrl}/docs`,

    capabilities: {
      streaming: true,
      pushNotifications: false, // Planned: Webhook push notifications require endpoint verification and retry logic
      stateTransitionHistory: true,
      extensions: [
        ...(X402_ENABLED
          ? [
              {
                uri: "https://x402.org/extension/payment",
                description: "x402 pay-per-request payment protocol support",
                required: false,
                params: {
                  networks: [X402_DEFAULT_NETWORK],
                  assets: ["USDC"],
                  topupEndpoint: "/api/v1/credits/topup",
                },
              },
            ]
          : []),
      ],
    },

    authentication: {
      schemes: [
        {
          scheme: "bearer",
          description:
            "API Key authentication via Authorization: Bearer <api_key>",
        },
        {
          scheme: "apiKey",
          description: "API Key via X-API-Key header",
        },
        ...(X402_ENABLED
          ? [
              {
                scheme: "x402",
                description:
                  "Pay-per-request via x402 protocol (X-PAYMENT header)",
              },
            ]
          : []),
      ],
    },

    defaultInputModes: ["text", "image", "file", "data"],
    defaultOutputModes: ["text", "image", "file", "data"],

    skills: [
      // ===== Core AI Skills =====
      {
        id: "chat_completion",
        name: "Chat Completion",
        description:
          "Generate text responses using GPT-4, Claude, Gemini, and other LLMs. " +
          "Supports system prompts, multi-turn conversations, and configurable parameters.",
        tags: ["inference", "llm", "chat", "text-generation"],
        inputModes: ["text"],
        outputModes: ["text"],
      },
      {
        id: "image_generation",
        name: "Image Generation",
        description:
          "Generate images using Gemini 2.5 Flash with various aspect ratios and styles.",
        tags: ["generation", "image", "creative"],
        inputModes: ["text"],
        outputModes: ["image"],
      },
      {
        id: "embeddings",
        name: "Text Embeddings",
        description:
          "Generate text embeddings for semantic search and similarity.",
        tags: ["embeddings", "search", "rag"],
        inputModes: ["text"],
        outputModes: ["data"],
      },

      // ===== Agent Management Skills =====
      {
        id: "chat_with_agent",
        name: "Chat with Agent",
        description:
          "Send messages to a deployed ElizaOS agent and receive contextual responses.",
        tags: ["agent", "chat", "eliza"],
        inputModes: ["text"],
        outputModes: ["text"],
      },
      {
        id: "list_agents",
        name: "List Agents",
        description: "List all available agents and their statuses.",
        tags: ["agent", "management"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "create_character",
        name: "Create Character/Agent",
        description:
          "Create a new AI character with custom personality, bio, and settings.",
        tags: ["agent", "character", "management"],
        inputModes: ["text", "data"],
        outputModes: ["data"],
      },

      // ===== Memory Skills =====
      {
        id: "save_memory",
        name: "Save Memory",
        description:
          "Save information to long-term memory with semantic tagging.",
        tags: ["memory", "storage", "context"],
        inputModes: ["text", "data"],
        outputModes: ["data"],
      },
      {
        id: "retrieve_memories",
        name: "Retrieve Memories",
        description: "Search and retrieve memories using semantic search.",
        tags: ["memory", "retrieval", "rag"],
        inputModes: ["text"],
        outputModes: ["data"],
      },

      // ===== Conversation Skills =====
      {
        id: "create_conversation",
        name: "Create Conversation",
        description: "Create a new conversation context with settings.",
        tags: ["conversation", "management"],
        inputModes: ["data"],
        outputModes: ["data"],
      },

      // ===== Billing Skills =====
      {
        id: "check_balance",
        name: "Check Balance",
        description: "Check credit balance and recent transactions.",
        tags: ["billing", "credits"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "get_usage",
        name: "Get Usage Statistics",
        description: "Get API usage statistics and costs.",
        tags: ["billing", "usage", "analytics"],
        inputModes: ["data"],
        outputModes: ["data"],
      },

      // ===== Container Skills =====
      {
        id: "deploy_container",
        name: "Deploy Container",
        description: "Deploy a containerized ElizaOS agent.",
        tags: ["container", "deployment", "infrastructure"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "list_containers",
        name: "List Containers",
        description: "List all deployed containers and their statuses.",
        tags: ["container", "management"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
    ],
  };

  return NextResponse.json(agentCard, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      "Access-Control-Allow-Origin": "*", // Allow cross-origin access
    },
  });
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
