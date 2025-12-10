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
import {
  getDefaultNetwork,
  isAgentRegistered,
  isERC8004Configured,
  ELIZA_CLOUD_AGENT_ID,
  CHAIN_IDS,
} from "@/lib/config/erc8004";

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
  defaultInputModes?: ("text" | "image" | "audio" | "video" | "file" | "data")[];
  defaultOutputModes?: ("text" | "image" | "audio" | "video" | "file" | "data")[];
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
      "character creation/management, memory systems, knowledge bases, " +
      "decentralized storage (Blob + IPFS), and containerized agent deployment. " +
      "Supports OpenAI-compatible API, MCP protocol, A2A protocol, and x402 micropayments.",
    url: `${baseUrl}/api/a2a`,
    preferredTransport: "JSONRPC",
    additionalInterfaces: [
      { url: `${baseUrl}/api/a2a`, transport: "JSONRPC" },
    ],
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
        ...(X402_ENABLED ? [{
          uri: "https://x402.org/extension/payment",
          description: "x402 pay-per-request payment protocol support",
          required: false,
          params: {
            networks: [X402_DEFAULT_NETWORK],
            assets: ["USDC"],
            topupEndpoint: "/api/v1/credits/topup",
          },
        }] : []),
        // ERC-8004 On-Chain Agent Registry
        ...(isERC8004Configured() ? [{
          uri: "https://eips.ethereum.org/EIPS/eip-8004",
          description: "ERC-8004 on-chain agent identity and discovery",
          required: false,
          params: {
            registered: isAgentRegistered(),
            network: getDefaultNetwork(),
            chainId: CHAIN_IDS[getDefaultNetwork()],
            agentId: ELIZA_CLOUD_AGENT_ID[getDefaultNetwork()],
            discoverEndpoint: "/api/v1/erc8004/discover",
            tagsEndpoint: "/api/v1/erc8004/tags",
            statusEndpoint: "/api/v1/erc8004/status",
          },
        }] : []),
      ],
    },

    authentication: {
      schemes: [
        {
          scheme: "bearer",
          description: "API Key authentication via Authorization: Bearer <api_key>",
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

      // ===== Storage Skills =====
      {
        id: "storage_upload",
        name: "Storage Upload",
        description: "Upload files to decentralized storage (Vercel Blob + IPFS pinning). Supports x402 micropayments.",
        tags: ["storage", "ipfs", "upload", "x402"],
        inputModes: ["file", "data"],
        outputModes: ["data"],
      },
      {
        id: "storage_list",
        name: "List Stored Files",
        description: "List your stored files with pagination.",
        tags: ["storage", "management"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "storage_stats",
        name: "Storage Statistics",
        description: "Get storage usage statistics and current pricing.",
        tags: ["storage", "analytics", "billing"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "storage_cost",
        name: "Calculate Storage Cost",
        description: "Calculate the cost to store a file of given size.",
        tags: ["storage", "pricing"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "storage_pin",
        name: "Pin to IPFS",
        description: "Pin an existing CID to IPFS for decentralized persistence.",
        tags: ["storage", "ipfs", "pinning"],
        inputModes: ["data"],
        outputModes: ["data"],
      },

      // ===== ERC-8004 Marketplace Discovery Skills =====
      {
        id: "marketplace_discover",
        name: "Discover Marketplace",
        description:
          "Search the ERC-8004 marketplace for agents, MCPs, and services. " +
          "Filter by tags, capabilities, protocols, x402 support, and more.",
        tags: ["erc8004", "discovery", "marketplace", "search"],
        inputModes: ["text", "data"],
        outputModes: ["data"],
      },
      {
        id: "marketplace_get_tags",
        name: "Get Discovery Tags",
        description:
          "Get available tags for filtering marketplace items. " +
          "Includes skill tags, domain tags, MCP categories, and capability tags.",
        tags: ["erc8004", "discovery", "tags"],
        inputModes: ["data"],
        outputModes: ["data"],
      },
      {
        id: "marketplace_find_by_tags",
        name: "Find by Tags",
        description: "Quick search for agents/MCPs matching specific tags.",
        tags: ["erc8004", "discovery", "tags"],
        inputModes: ["text", "data"],
        outputModes: ["data"],
      },
      {
        id: "marketplace_find_by_mcp_tools",
        name: "Find by MCP Tools",
        description: "Find MCPs that provide specific tools.",
        tags: ["erc8004", "discovery", "mcp", "tools"],
        inputModes: ["text", "data"],
        outputModes: ["data"],
      },
      {
        id: "marketplace_find_payable",
        name: "Find Payable Services",
        description: "Find agents and MCPs that accept x402 micropayments.",
        tags: ["erc8004", "discovery", "x402", "payments"],
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
