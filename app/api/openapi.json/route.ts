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
import { discoverApiV1Routes } from "@/lib/docs/api-route-discovery";

type OpenApiPathItem = Record<
  string,
  {
    operationId: string;
    summary: string;
    description?: string;
    tags?: string[];
    security?: Array<Record<string, string[]>>;
    requestBody?: unknown;
    parameters?: unknown[];
    responses: Record<string, unknown>;
  }
>;

function toOperationId(method: string, routePath: string) {
  // e.g. POST /api/v1/apps/{id}/earnings -> post_api_v1_apps_id_earnings
  const clean = routePath
    .replace(/^\//, "")
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "")
    .replace(/[\/-]+/g, "_");
  return `${method.toLowerCase()}_${clean}`;
}

function tagForPath(routePath: string) {
  const parts = routePath.split("/").filter(Boolean);
  // ["api","v1",...]
  const group = parts[2] ?? "v1";
  return group === "v1" ? "v1" : group;
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const network = getDefaultNetwork();

  const discovered = await discoverApiV1Routes();
  const discoveredPaths: Record<string, OpenApiPathItem> = {};

  for (const r of discovered) {
    if (!discoveredPaths[r.path]) discoveredPaths[r.path] = {};
    const tag = tagForPath(r.path);

    for (const method of r.methods) {
      discoveredPaths[r.path][method.toLowerCase()] = {
        operationId: toOperationId(method, r.path),
        summary: r.meta?.name ?? `${method} ${r.path}`,
        description: r.meta?.description,
        tags: r.meta?.category ? [r.meta.category] : [tag],
        responses: {
          "200": { description: "Successful response" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "429": { description: "Rate limited" },
          "500": { description: "Server error" },
        },
      };
    }
  }

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
      ...discoveredPaths,
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
    tags: [],
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
