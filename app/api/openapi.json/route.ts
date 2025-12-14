/**
 * OpenAPI Specification Endpoint
 *
 * Returns the OpenAPI 3.1.0 specification for the Eliza Cloud API.
 * Referenced in ERC-8004 registration for service discovery.
 *
 * GET /api/openapi.json
 */

import { NextResponse } from "next/server";
import {
  X402_ENABLED,
  isX402Configured,
  getDefaultNetwork,
  USDC_ADDRESSES,
  TOPUP_PRICE,
  CREDITS_PER_DOLLAR,
} from "@/lib/config/x402";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const network = getDefaultNetwork();

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Eliza Cloud API",
      version: "1.0.0",
      description:
        "AI agent infrastructure API. Supports REST, MCP, and A2A protocols with x402 or API key authentication.",
      contact: {
        name: "Eliza Cloud",
        url: "https://elizacloud.ai",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Production server",
      },
    ],
    security: [
      { bearerAuth: [] },
      { apiKeyAuth: [] },
      ...(X402_ENABLED && isX402Configured() ? [{ x402: [] }] : []),
    ],
    paths: {
      // Chat Completions
      "/api/v1/chat/completions": {
        post: {
          operationId: "createChatCompletion",
          summary: "Create chat completion",
          description: "Generate a response using the specified model.",
          tags: ["Chat"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatCompletionRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ChatCompletionResponse",
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
            "402": { description: "Payment required" },
          },
        },
      },

      // Image Generation
      "/api/v1/generate-image": {
        post: {
          operationId: "generateImage",
          summary: "Generate image",
          description: "Generate an image from a text prompt.",
          tags: ["Generation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ImageGenerationRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ImageGenerationResponse",
                  },
                },
              },
            },
          },
        },
      },

      // Video Generation
      "/api/v1/generate-video": {
        post: {
          operationId: "generateVideo",
          summary: "Generate video",
          description: "Generate a video from a text prompt or image.",
          tags: ["Generation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VideoGenerationRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/VideoGenerationResponse",
                  },
                },
              },
            },
          },
        },
      },

      // Embeddings
      "/api/v1/embeddings": {
        post: {
          operationId: "createEmbedding",
          summary: "Create embedding",
          description: "Create an embedding vector for the input text.",
          tags: ["Embeddings"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EmbeddingRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EmbeddingResponse" },
                },
              },
            },
          },
        },
      },

      // Credit Top-up
      "/api/v1/credits/topup": {
        get: {
          operationId: "getTopupInfo",
          summary: "Get credit top-up information",
          description:
            "Get current balance and pricing info for credit top-up.",
          tags: ["Credits"],
          responses: {
            "200": {
              description: "Top-up information",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TopupInfoResponse" },
                },
              },
            },
          },
        },
        post: {
          operationId: "topupCredits",
          summary: "Top up credits via x402",
          description:
            "Top up account credits using x402 payment. Requires X-PAYMENT header.",
          tags: ["Credits"],
          security: [{ x402: [] }],
          responses: {
            "200": {
              description: "Credits added successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TopupResponse" },
                },
              },
            },
            "402": {
              description: "Payment required",
              headers: {
                "X-Payment-Requirement": {
                  schema: { type: "string" },
                  description: "JSON-encoded x402 payment requirements",
                },
              },
            },
          },
        },
      },

      // A2A Protocol
      "/.well-known/agent-card.json": {
        get: {
          operationId: "getAgentCard",
          summary: "Get A2A Agent Card",
          description:
            "Returns the A2A Agent Card for Eliza Cloud service discovery.",
          tags: ["A2A"],
          responses: {
            "200": {
              description: "Agent Card",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AgentCard" },
                },
              },
            },
          },
        },
      },

      // MCP Protocol
      "/api/mcp": {
        get: {
          operationId: "getMcpInfo",
          summary: "Get MCP server information",
          description: "Returns MCP server metadata and available tools.",
          tags: ["MCP"],
          responses: {
            "200": {
              description: "MCP server info",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MCPServerInfo" },
                },
              },
            },
          },
        },
        post: {
          operationId: "mcpRequest",
          summary: "MCP JSON-RPC request",
          description: "Handle MCP protocol JSON-RPC requests.",
          tags: ["MCP"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JsonRpcRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "JSON-RPC response",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JsonRpcResponse" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Privy session token",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API Key for programmatic access",
        },
        ...(X402_ENABLED && isX402Configured()
          ? {
              x402: {
                type: "apiKey",
                in: "header",
                name: "X-PAYMENT",
                description: `x402 payment header. Network: ${network}, Asset: USDC (${USDC_ADDRESSES[network]}), Min: ${TOPUP_PRICE}`,
              },
            }
          : {}),
      },
      schemas: {
        ChatCompletionRequest: {
          type: "object",
          required: ["model", "messages"],
          properties: {
            model: {
              type: "string",
              description: "Model to use",
              example: "gpt-4o-mini",
            },
            messages: {
              type: "array",
              items: { $ref: "#/components/schemas/Message" },
            },
            stream: { type: "boolean", default: false },
            temperature: { type: "number", minimum: 0, maximum: 2, default: 1 },
            max_tokens: { type: "integer" },
          },
        },
        ChatCompletionResponse: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { type: "string", enum: ["chat.completion"] },
            created: { type: "integer" },
            model: { type: "string" },
            choices: {
              type: "array",
              items: { $ref: "#/components/schemas/Choice" },
            },
            usage: { $ref: "#/components/schemas/Usage" },
          },
        },
        Message: {
          type: "object",
          required: ["role", "content"],
          properties: {
            role: {
              type: "string",
              enum: ["system", "user", "assistant"],
            },
            content: { type: "string" },
          },
        },
        Choice: {
          type: "object",
          properties: {
            index: { type: "integer" },
            message: { $ref: "#/components/schemas/Message" },
            finish_reason: { type: "string" },
          },
        },
        Usage: {
          type: "object",
          properties: {
            prompt_tokens: { type: "integer" },
            completion_tokens: { type: "integer" },
            total_tokens: { type: "integer" },
          },
        },
        ImageGenerationRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string" },
            model: {
              type: "string",
              default: "flux/schnell",
            },
            size: {
              type: "string",
              enum: ["square_hd", "square", "portrait_4_3", "landscape_4_3"],
              default: "square_hd",
            },
            num_images: { type: "integer", default: 1, minimum: 1, maximum: 4 },
          },
        },
        ImageGenerationResponse: {
          type: "object",
          properties: {
            images: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  width: { type: "integer" },
                  height: { type: "integer" },
                },
              },
            },
            cost: { type: "number" },
          },
        },
        VideoGenerationRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string" },
            model: {
              type: "string",
              default: "google/veo3",
              enum: [
                "google/veo3",
                "google/veo3-fast",
                "kling/v2.1-master",
                "kling/v2.1-pro",
                "kling/v2.1-standard",
                "minimax/hailuo-standard",
                "minimax/hailuo-pro",
              ],
              description: "Video model (creator/model format)",
            },
            image_url: { type: "string", description: "Optional image input" },
          },
        },
        VideoGenerationResponse: {
          type: "object",
          properties: {
            video: {
              type: "object",
              properties: {
                url: { type: "string" },
              },
            },
            cost: { type: "number" },
          },
        },
        EmbeddingRequest: {
          type: "object",
          required: ["input"],
          properties: {
            input: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
            model: {
              type: "string",
              default: "text-embedding-3-small",
            },
          },
        },
        EmbeddingResponse: {
          type: "object",
          properties: {
            object: { type: "string", enum: ["list"] },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  object: { type: "string", enum: ["embedding"] },
                  embedding: {
                    type: "array",
                    items: { type: "number" },
                  },
                  index: { type: "integer" },
                },
              },
            },
            model: { type: "string" },
            usage: { $ref: "#/components/schemas/Usage" },
          },
        },
        TopupInfoResponse: {
          type: "object",
          properties: {
            balance: { type: "number" },
            x402Enabled: { type: "boolean" },
            x402Configured: { type: "boolean" },
            pricing: {
              type: "object",
              properties: {
                rate: {
                  type: "string",
                  example: `${CREDITS_PER_DOLLAR} credits per $1 USDC`,
                },
                minimumPayment: { type: "string", example: TOPUP_PRICE },
                networks: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
        TopupResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            creditsAdded: { type: "number" },
            newBalance: { type: "number" },
            transactionId: { type: "string" },
            paymentSource: { type: "string", enum: ["x402"] },
            network: { type: "string" },
          },
        },
        AgentCard: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            image: { type: "string" },
            version: { type: "string" },
            capabilities: {
              type: "object",
              properties: {
                streaming: { type: "boolean" },
                pushNotifications: { type: "boolean" },
                stateTransitionHistory: { type: "boolean" },
              },
            },
            authentication: {
              type: "object",
              properties: {
                schemes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      scheme: { type: "string" },
                      description: { type: "string" },
                    },
                  },
                },
              },
            },
            skills: {
              type: "array",
              items: { $ref: "#/components/schemas/Skill" },
            },
          },
        },
        Skill: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            inputModes: {
              type: "array",
              items: { type: "string" },
            },
            outputModes: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        MCPServerInfo: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: { type: "string" },
            protocol: { type: "string" },
            capabilities: {
              type: "object",
              properties: {
                tools: { type: "object" },
                resources: { type: "object" },
                prompts: { type: "object" },
              },
            },
            tools: {
              type: "array",
              items: { $ref: "#/components/schemas/MCPTool" },
            },
          },
        },
        MCPTool: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            inputSchema: { type: "object" },
          },
        },
        JsonRpcRequest: {
          type: "object",
          required: ["jsonrpc", "method", "id"],
          properties: {
            jsonrpc: { type: "string", enum: ["2.0"] },
            method: { type: "string" },
            params: { type: "object" },
            id: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
        },
        JsonRpcResponse: {
          type: "object",
          required: ["jsonrpc", "id"],
          properties: {
            jsonrpc: { type: "string", enum: ["2.0"] },
            result: { type: "object" },
            error: {
              type: "object",
              properties: {
                code: { type: "integer" },
                message: { type: "string" },
                data: { type: "object" },
              },
            },
            id: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
        },
      },
    },
    tags: [
      { name: "Chat", description: "Chat completion endpoints" },
      { name: "Generation", description: "Image and video generation" },
      { name: "Embeddings", description: "Text embedding generation" },
      { name: "Credits", description: "Credit management and top-up" },
      { name: "A2A", description: "Agent-to-Agent protocol" },
      { name: "MCP", description: "Model Context Protocol" },
    ],
    externalDocs: {
      description: "Eliza Cloud Documentation",
      url: "https://elizacloud.ai/docs",
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
