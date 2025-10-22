import { createMcpHandler } from "mcp-handler";
// IMPORTANT: Must use zod v3.x (aliased as zod3) for MCP SDK compatibility
// The MCP SDK internally uses zod v3.x, and zod v4.x has breaking internal API changes
import { z } from "zod3";
import { NextRequest, NextResponse } from "next/server";
import { AsyncLocalStorage } from "async_hooks";
import { requireAuthOrApiKey, type AuthResult } from "@/lib/auth";
import {
  creditsService,
  usageService,
  organizationsService,
  generationsService,
  conversationsService,
  memoryService,
  agentService,
  agentDiscoveryService,
  containersService,
} from "@/lib/services";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
  IMAGE_GENERATION_COST,
} from "@/lib/pricing";
import { uploadBase64Image } from "@/lib/blob";

export const maxDuration = 60;

// AsyncLocalStorage for request-scoped auth context
const authContextStorage = new AsyncLocalStorage<AuthResult>();

// Helper to get current auth context from AsyncLocalStorage
function getAuthContext(): AuthResult {
  const context = authContextStorage.getStore();
  if (!context) {
    throw new Error("Authentication context not available");
  }
  return context;
}

// Create MCP handler with tools
const mcpHandler = createMcpHandler(
  (server) => {
    // Tool 1: Check Credits - View credit balance and recent transactions
    server.tool(
      "check_credits",
      "Check credit balance and recent transactions for your organization",
      {
        includeTransactions: z
          .boolean()
          .optional()
          .describe("Include recent transactions in the response"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe("Number of recent transactions to include"),
      },
      async ({ includeTransactions = false, limit = 5 }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);

          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const response: {
            balance: number;
            organizationId: string;
            organizationName: string;
            transactions?: Array<{
              id: string;
              amount: number;
              type: string;
              description: string;
              createdAt: string;
            }>;
          } = {
            balance: org.credit_balance,
            organizationId: org.id,
            organizationName: org.name,
          };

          if (includeTransactions) {
            const transactions =
              await creditsService.listTransactionsByOrganization(
                user.organization_id,
                limit
              );
            response.transactions = transactions.map((t) => ({
              id: t.id,
              amount: t.amount,
              type: t.type,
              description: t.description || "No description",
              createdAt: t.created_at.toISOString(),
            }));
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to check credits",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 2: Get Recent Usage - View API usage statistics
    server.tool(
      "get_recent_usage",
      "Get recent API usage statistics including models used, costs, and tokens",
      {
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Number of recent usage records to fetch"),
      },
      async ({ limit = 10 }) => {
        try {
          const { user } = getAuthContext();

          const usageRecords = await usageService.listByOrganization(
            user.organization_id,
            limit
          );

          const formattedUsage = usageRecords.map((record) => ({
            id: record.id,
            type: record.type,
            model: record.model,
            provider: record.provider,
            inputTokens: record.input_tokens,
            outputTokens: record.output_tokens,
            inputCost: record.input_cost || 0,
            outputCost: record.output_cost || 0,
            totalCost: (record.input_cost || 0) + (record.output_cost || 0),
            isSuccessful: record.is_successful,
            errorMessage: record.error_message,
            createdAt: record.created_at.toISOString(),
          }));

          const totalCost = formattedUsage.reduce(
            (sum, record) => sum + record.totalCost,
            0
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    usage: formattedUsage,
                    summary: {
                      totalRecords: formattedUsage.length,
                      totalCost,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to fetch usage",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 3: Generate Text - Generate text using AI models
    server.tool(
      "generate_text",
      "Generate text using AI models (GPT-4, Claude, Gemini). Deducts credits based on token usage.",
      {
        prompt: z.string().min(1).describe("The text prompt to generate from"),
        model: z
          .enum([
            "gpt-4o",
            "gpt-4o-mini",
            "claude-3-5-sonnet-20241022",
            "gemini-2.0-flash-exp",
          ])
          .optional()
          .default("gpt-4o")
          .describe("The AI model to use for generation"),
        maxLength: z
          .number()
          .int()
          .min(1)
          .max(4000)
          .optional()
          .default(1000)
          .describe("Maximum length of generated text"),
      },
      async ({ prompt, model = "gpt-4o", maxLength = 1000 }) => {
        let generationId: string | undefined;
        try {
          const { user, apiKey } = getAuthContext();

          const provider = getProviderFromModel(model);

          // Check credit balance first
          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          // Estimate cost before generation (returns integer credits)
          const estimatedCost = await estimateRequestCost(model, [
            { role: "user", content: prompt },
          ]);
          if (org.credit_balance < estimatedCost) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: estimatedCost,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          // Create generation record
          const generation = await generationsService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "chat",
            model: model,
            provider: provider,
            prompt: prompt,
            status: "pending",
            credits: estimatedCost,
            cost: estimatedCost,
          });

          generationId = generation.id;

          // Generate text (non-streaming for MCP)
          const result = await streamText({
            model: gateway.languageModel(model),
            prompt: prompt,
          });

          let fullText = "";
          for await (const delta of result.textStream) {
            fullText += delta;
            // Limit output length
            if (fullText.length >= maxLength) {
              fullText = fullText.substring(0, maxLength);
              break;
            }
          }

          const usage = await result.usage;

          // Calculate actual cost
          const { inputCost, outputCost, totalCost } = await calculateCost(
            model,
            provider,
            usage?.inputTokens || 0,
            usage?.outputTokens || 0
          );

          // Deduct credits
          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: totalCost,
            description: `MCP text generation: ${model}`,
            metadata: {
              user_id: user.id,
              model: model,
              input_tokens: usage?.inputTokens,
              output_tokens: usage?.outputTokens,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      cost: totalCost,
                      balance: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          // Create usage record
          const usageRecord = await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "chat",
            model: model,
            provider: provider,
            input_tokens: usage?.inputTokens || 0,
            output_tokens: usage?.outputTokens || 0,
            input_cost: inputCost,
            output_cost: outputCost,
            is_successful: true,
          });

          // Update generation record
          await generationsService.update(generationId, {
            status: "completed",
            content: fullText,
            tokens: (usage?.inputTokens || 0) + (usage?.outputTokens || 0),
            cost: totalCost,
            credits: totalCost,
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
            result: {
              text: fullText,
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              totalTokens: usage?.totalTokens,
            },
          });

          return {
            content: [
              {
                type: "text" as const,
                text: fullText,
              },
            ],
          };
        } catch (error) {
          // Mark generation as failed if we have an ID
          if (generationId) {
            try {
              await generationsService.update(generationId, {
                status: "failed",
                error:
                  error instanceof Error ? error.message : "Generation failed",
                completed_at: new Date(),
              });
            } catch (updateError) {
              console.error("Failed to update generation record:", updateError);
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Text generation failed",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 4: Generate Image - Generate images using Gemini
    server.tool(
      "generate_image",
      "Generate images using Google Gemini 2.5. Deducts credits per image generated.",
      {
        prompt: z
          .string()
          .min(1)
          .describe("Description of the image to generate"),
        aspectRatio: z
          .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
          .optional()
          .default("1:1")
          .describe("Aspect ratio for the generated image"),
      },
      async ({ prompt, aspectRatio = "1:1" }) => {
        let generationId: string | undefined;
        try {
          const { user, apiKey } = getAuthContext();

          // Check credit balance
          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          if (org.credit_balance < IMAGE_GENERATION_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: IMAGE_GENERATION_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          // Create generation record
          const generation = await generationsService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "image",
            model: "google/gemini-2.5-flash-image-preview",
            provider: "google",
            prompt: prompt,
            status: "pending",
            credits: IMAGE_GENERATION_COST,
            cost: IMAGE_GENERATION_COST,
          });

          generationId = generation.id;

          // Add aspect ratio to prompt
          const aspectRatioDescriptions: Record<string, string> = {
            "1:1": "square composition",
            "16:9": "wide landscape composition",
            "9:16": "tall portrait composition",
            "4:3": "landscape composition",
            "3:4": "portrait composition",
          };

          const enhancedPrompt = `${prompt}, ${aspectRatioDescriptions[aspectRatio]}`;

          // Generate image
          const result = streamText({
            model: "google/gemini-2.5-flash-image-preview",
            providerOptions: {
              google: { responseModalities: ["TEXT", "IMAGE"] },
            },
            prompt: `Generate an image: ${enhancedPrompt}`,
          });

          let imageBase64: string | null = null;
          let textResponse = "";
          let mimeType = "image/png";

          for await (const delta of result.fullStream) {
            switch (delta.type) {
              case "text-delta": {
                textResponse += delta.text;
                break;
              }

              case "file": {
                if (delta.file.mediaType.startsWith("image/")) {
                  const uint8Array = delta.file.uint8Array;
                  const base64 = Buffer.from(uint8Array).toString("base64");
                  mimeType = delta.file.mediaType || "image/png";
                  imageBase64 = `data:${mimeType};base64,${base64}`;
                  break;
                }
                break;
              }
            }
          }

          if (!imageBase64) {
            const usageRecord = await usageService.create({
              organization_id: user.organization_id,
              user_id: user.id,
              api_key_id: apiKey?.id || null,
              type: "image",
              model: "google/gemini-2.5-flash-image-preview",
              provider: "google",
              input_tokens: 0,
              output_tokens: 0,
              input_cost: 0,
              output_cost: 0,
              is_successful: false,
              error_message: "No image was generated",
            });

            if (generationId) {
              await generationsService.update(generationId, {
                status: "failed",
                error: "No image was generated",
                usage_record_id: usageRecord.id,
                completed_at: new Date(),
              });
            }

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "No image was generated" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          // Deduct credits
          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: IMAGE_GENERATION_COST,
            description: `MCP image generation: google/gemini-2.5-flash-image-preview`,
            metadata: { user_id: user.id },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: IMAGE_GENERATION_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const usageRecord = await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "image",
            model: "google/gemini-2.5-flash-image-preview",
            provider: "google",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: IMAGE_GENERATION_COST,
            output_cost: 0,
            is_successful: true,
          });

          // Upload to blob storage
          let blobUrl = imageBase64;
          let fileSize: bigint | null = null;

          try {
            const fileExtension = mimeType.split("/")[1] || "png";
            const blobResult = await uploadBase64Image(imageBase64, {
              filename: `${generationId}.${fileExtension}`,
              folder: "images",
              userId: user.id,
            });
            blobUrl = blobResult.url;
            fileSize = blobResult.size ? BigInt(blobResult.size) : null;
          } catch (blobError) {
            console.error("Failed to upload to Vercel Blob:", blobError);
          }

          // Update generation record
          await generationsService.update(generationId, {
            status: "completed",
            content: imageBase64,
            storage_url: blobUrl,
            mime_type: mimeType,
            file_size: fileSize,
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
            result: {
              aspectRatio,
              textResponse,
            },
          });

          // Return image URL
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: "Image generated successfully",
                    url: blobUrl !== imageBase64 ? blobUrl : undefined,
                    aspectRatio,
                    cost: IMAGE_GENERATION_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          if (generationId) {
            try {
              await generationsService.update(generationId, {
                status: "failed",
                error:
                  error instanceof Error ? error.message : "Generation failed",
                completed_at: new Date(),
              });
            } catch (updateError) {
              console.error("Failed to update generation record:", updateError);
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Image generation failed",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "save_memory",
      "Save important information to long-term memory with semantic tagging. Deducts 1 credit per save.",
      {
        content: z.string().min(1).describe("The memory content to save"),
        type: z
          .enum(["fact", "preference", "context", "document"])
          .describe("Type of memory being saved"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tags for categorization"),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Additional metadata"),
        ttl: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional TTL in seconds (Redis only)"),
        persistent: z
          .boolean()
          .optional()
          .default(true)
          .describe("Store in PostgreSQL (default: true)"),
        roomId: z
          .string()
          .describe("Room ID to associate memory with (required)"),
      },
      async ({
        content,
        type,
        tags,
        metadata,
        ttl,
        persistent = true,
        roomId,
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          if (!roomId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error:
                        "roomId is required. Memory must be associated with a room/conversation.",
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const MEMORY_SAVE_COST = 1;
          if (org.credit_balance < MEMORY_SAVE_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: MEMORY_SAVE_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const result = await memoryService.saveMemory({
            organizationId: user.organization_id,
            roomId: roomId,
            entityId: user.id,
            content,
            type,
            tags,
            metadata,
            ttl,
            persistent,
          });

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: MEMORY_SAVE_COST,
            description: `MCP memory save: ${type}`,
            metadata: {
              user_id: user.id,
              memory_id: result.memoryId,
              type,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: MEMORY_SAVE_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "memory-storage",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: MEMORY_SAVE_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    memoryId: result.memoryId,
                    storage: result.storage,
                    expiresAt: result.expiresAt?.toISOString(),
                    cost: MEMORY_SAVE_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to save memory",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "retrieve_memories",
      "Search and retrieve memories using semantic search or filters. Deducts 0.1 credit per memory retrieved (max 5 credits).",
      {
        query: z.string().optional().describe("Semantic search query"),
        roomId: z
          .string()
          .optional()
          .describe("Filter to specific room/conversation"),
        type: z.array(z.string()).optional().describe("Filter by memory type"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Maximum results to return"),
        sortBy: z
          .enum(["relevance", "recent", "importance"])
          .optional()
          .default("relevance")
          .describe("Sort order"),
      },
      async ({
        query,
        roomId,
        type,
        tags,
        limit = 10,
        sortBy = "relevance",
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const memories = await memoryService.retrieveMemories({
            organizationId: user.organization_id,
            query,
            roomId,
            type,
            tags,
            limit,
            sortBy,
          });

          const COST_PER_MEMORY = 0.1;
          const totalCost = Math.min(
            Math.ceil(memories.length * COST_PER_MEMORY),
            5
          );

          if (totalCost > 0) {
            const deductionResult = await creditsService.deductCredits({
              organizationId: user.organization_id,
              amount: totalCost,
              description: `MCP memory retrieval: ${memories.length} memories`,
              metadata: {
                user_id: user.id,
                query,
                count: memories.length,
              },
            });

            if (!deductionResult.success) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Failed to deduct credits",
                        required: totalCost,
                        available: deductionResult.newBalance,
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }

            await usageService.create({
              organization_id: user.organization_id,
              user_id: user.id,
              api_key_id: null,
              type: "memory",
              model: "memory-retrieval",
              provider: "internal",
              input_tokens: 0,
              output_tokens: 0,
              input_cost: totalCost,
              output_cost: 0,
              is_successful: true,
            });
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    memories: memories.map((m) => ({
                      id: m.memory.id,
                      content: m.memory.content,
                      score: m.score,
                      createdAt: m.memory.createdAt,
                    })),
                    count: memories.length,
                    cost: totalCost,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to retrieve memories",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "delete_memory",
      "Remove a specific memory or bulk delete by filters. No credit cost.",
      {
        memoryId: z
          .string()
          .optional()
          .describe("Specific memory ID to delete"),
        olderThan: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Delete memories older than N days"),
        type: z.array(z.string()).optional().describe("Delete by type"),
        tags: z.array(z.string()).optional().describe("Delete by tags"),
      },
      async ({ memoryId, olderThan, type, tags }) => {
        try {
          const { user } = getAuthContext();

          const result = await memoryService.deleteMemory({
            organizationId: user.organization_id,
            memoryId,
            olderThan,
            type,
            tags,
          });

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "memory-deletion",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: 0,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    deletedCount: result.deletedCount,
                    storageFreed: result.storageFreed,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to delete memory",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "get_conversation_context",
      "Retrieve enriched conversation context with memory integration. Deducts 1 credit per request.",
      {
        roomId: z.string().describe("Room/conversation ID"),
        depth: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Number of messages to include"),
        includeMemories: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include relevant saved memories"),
        format: z
          .enum(["chat", "json", "markdown"])
          .optional()
          .default("json")
          .describe("Output format"),
      },
      async ({
        roomId,
        depth = 20,
        includeMemories = true,
        format: _format = "json",
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const CONTEXT_COST = 1;
          if (org.credit_balance < CONTEXT_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: CONTEXT_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const context = await memoryService.getRoomContext(
            roomId,
            user.organization_id,
            depth,
            includeMemories
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: CONTEXT_COST,
            description: `MCP conversation context: ${roomId}`,
            metadata: {
              user_id: user.id,
              room_id: roomId,
              depth,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: CONTEXT_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "context-retrieval",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: CONTEXT_COST,
            output_cost: 0,
            is_successful: true,
          });

          const tokenEstimate = await memoryService.estimateTokenCount(
            context.messages
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    roomId: context.roomId,
                    messageCount: context.messages.length,
                    participants: context.participants.length,
                    metadata: context.metadata,
                    tokenEstimate,
                    cost: CONTEXT_COST,
                    messages: context.messages.map((m) => ({
                      id: m.id,
                      content: m.content,
                      createdAt: m.createdAt,
                      entityId: m.entityId,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to get conversation context",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // @ts-expect-error - Zod v3/v4 type compatibility issue with MCP SDK
    server.tool(
      "create_conversation",
      "Create a new conversation context with initial settings. Deducts 1 credit.",
      {
        title: z.string().min(1).describe("Conversation title"),
        model: z
          .string()
          .optional()
          .default("gpt-4o")
          .describe("Default model to use"),
        systemPrompt: z
          .string()
          .optional()
          .describe("System prompt for conversation"),
        settings: z
          .object({
            temperature: z.number().optional(),
            maxTokens: z.number().int().optional(),
            topP: z.number().optional(),
            frequencyPenalty: z.number().optional(),
            presencePenalty: z.number().optional(),
          })
          .optional()
          .describe("Model settings"),
      },
      async ({ title, model = "gpt-4o", systemPrompt, settings }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const CONVERSATION_CREATE_COST = 1;
          if (org.credit_balance < CONVERSATION_CREATE_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: CONVERSATION_CREATE_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const conversation = await conversationsService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            title,
            model,
            settings: {
              ...settings,
              systemPrompt,
            },
          });

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: CONVERSATION_CREATE_COST,
            description: `MCP conversation created: ${title}`,
            metadata: {
              user_id: user.id,
              conversation_id: conversation.id,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: CONVERSATION_CREATE_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-creation",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: CONVERSATION_CREATE_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    conversationId: conversation.id,
                    title: conversation.title,
                    model: conversation.model,
                    cost: CONVERSATION_CREATE_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to create conversation",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "search_conversations",
      "Search through conversation history with filters. Deducts 2 credits per search.",
      {
        query: z
          .string()
          .optional()
          .describe("Search query (semantic or keyword)"),
        model: z.array(z.string()).optional().describe("Filter by model used"),
        dateFrom: z.string().optional().describe("ISO date string (from)"),
        dateTo: z.string().optional().describe("ISO date string (to)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Maximum results"),
      },
      async ({
        query,
        model: _model,
        dateFrom: _dateFrom,
        dateTo: _dateTo,
        limit = 10,
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const SEARCH_COST = 2;
          if (org.credit_balance < SEARCH_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: SEARCH_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const conversations = await conversationsService.listByOrganization(
            user.organization_id,
            limit
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: SEARCH_COST,
            description: `MCP conversation search: ${query || "all"}`,
            metadata: {
              user_id: user.id,
              query,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: SEARCH_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-search",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: SEARCH_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    conversations: conversations.map((c) => ({
                      id: c.id,
                      title: c.title,
                      model: c.model,
                      messageCount: c.message_count,
                      totalCost: c.total_cost,
                      lastMessageAt: c.last_message_at,
                      createdAt: c.created_at,
                    })),
                    count: conversations.length,
                    cost: SEARCH_COST,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to search conversations",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "summarize_conversation",
      "Generate a summary of conversation history. Deducts 10-50 credits based on token usage.",
      {
        roomId: z.string().describe("Room/conversation ID to summarize"),
        lastN: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .default(50)
          .describe("Summarize last N messages"),
        style: z
          .enum(["brief", "detailed", "bullet-points"])
          .optional()
          .default("brief")
          .describe("Summary style"),
        includeMetadata: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include participant and topic metadata"),
      },
      async ({
        roomId,
        lastN = 50,
        style = "brief",
        includeMetadata = false,
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const estimatedCost = Math.min(10 + Math.floor(lastN / 10), 50);
          if (org.credit_balance < estimatedCost) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      estimated: estimatedCost,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const summary = await memoryService.summarizeConversation({
            roomId,
            organizationId: user.organization_id,
            lastN,
            style,
            includeMetadata,
          });

          const actualCost = Math.min(
            10 + Math.ceil(summary.tokenCount / 1000),
            50
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: actualCost,
            description: `MCP conversation summary: ${roomId}`,
            metadata: {
              user_id: user.id,
              room_id: roomId,
              tokens: summary.tokenCount,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: actualCost,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "chat",
            model: "gpt-4o-mini",
            provider: "openai",
            input_tokens: summary.tokenCount,
            output_tokens: 0,
            input_cost: actualCost,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    summary: summary.summary,
                    tokenCount: summary.tokenCount,
                    keyTopics: summary.keyTopics,
                    participants: summary.participants,
                    cost: actualCost,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to summarize conversation",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "optimize_context_window",
      "Intelligently select the most relevant context for token-limited requests. Deducts 5 credits.",
      {
        roomId: z.string().describe("Room/conversation ID"),
        maxTokens: z
          .number()
          .int()
          .min(100)
          .max(100000)
          .describe("Token budget for context"),
        query: z
          .string()
          .optional()
          .describe("Current user query for relevance scoring"),
        preserveRecent: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(5)
          .describe("Always include N recent messages"),
      },
      async ({ roomId, maxTokens, query, preserveRecent = 5 }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const OPTIMIZE_COST = 5;
          if (org.credit_balance < OPTIMIZE_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: OPTIMIZE_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const optimized = await memoryService.optimizeContextWindow(
            roomId,
            user.organization_id,
            maxTokens,
            query,
            preserveRecent
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: OPTIMIZE_COST,
            description: `MCP context optimization: ${roomId}`,
            metadata: {
              user_id: user.id,
              room_id: roomId,
              max_tokens: maxTokens,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: OPTIMIZE_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "context-optimization",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: OPTIMIZE_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    messages: optimized.messages.map((m) => ({
                      id: m.id,
                      content: m.content,
                      createdAt: m.createdAt,
                    })),
                    totalTokens: optimized.totalTokens,
                    messageCount: optimized.messageCount,
                    relevanceScores: optimized.relevanceScores,
                    cost: OPTIMIZE_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to optimize context window",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "export_conversation",
      "Export conversation history in various formats (json, markdown, txt). Deducts 5 credits.",
      {
        conversationId: z.string().describe("Conversation ID to export"),
        format: z.enum(["json", "markdown", "txt"]).describe("Export format"),
        includeMemories: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include related memories"),
        includeMetadata: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include conversation metadata"),
      },
      async ({
        conversationId,
        format,
        includeMemories = false,
        includeMetadata: _includeMetadata = true,
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const EXPORT_COST = 5;
          if (org.credit_balance < EXPORT_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: EXPORT_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const exportData = await memoryService.exportConversation(
            conversationId,
            user.organization_id,
            format,
            includeMemories
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: EXPORT_COST,
            description: `MCP conversation export: ${conversationId}`,
            metadata: {
              user_id: user.id,
              conversation_id: conversationId,
              format,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: EXPORT_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-export",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: EXPORT_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    content: exportData.content,
                    format: exportData.format,
                    size: exportData.size,
                    cost: EXPORT_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to export conversation",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "clone_conversation",
      "Duplicate a conversation with optional modifications. Deducts 2 credits.",
      {
        conversationId: z.string().describe("Source conversation ID"),
        newTitle: z
          .string()
          .optional()
          .describe("New title (defaults to 'Original (Copy)')"),
        preserveMessages: z
          .boolean()
          .optional()
          .default(true)
          .describe("Copy all messages"),
        preserveMemories: z
          .boolean()
          .optional()
          .default(false)
          .describe("Copy related memories"),
        newModel: z.string().optional().describe("Change model (optional)"),
      },
      async ({
        conversationId,
        newTitle,
        preserveMessages = true,
        preserveMemories = false,
        newModel,
      }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const CLONE_COST = 2;
          if (org.credit_balance < CLONE_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: CLONE_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const cloneResult = await memoryService.cloneConversation(
            conversationId,
            user.organization_id,
            user.id,
            {
              newTitle,
              preserveMessages,
              preserveMemories,
              newModel,
            }
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: CLONE_COST,
            description: `MCP conversation clone: ${conversationId}`,
            metadata: {
              user_id: user.id,
              source_conversation_id: conversationId,
              new_conversation_id: cloneResult.conversationId,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: CLONE_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-clone",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: CLONE_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    conversationId: cloneResult.conversationId,
                    clonedMessageCount: cloneResult.clonedMessageCount,
                    cost: CLONE_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to clone conversation",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "analyze_memory_patterns",
      "Analyze user/org memory patterns for insights (topics, sentiment, entities, timeline). Deducts 20 credits.",
      {
        analysisType: z
          .enum(["topics", "sentiment", "entities", "timeline"])
          .describe("Type of analysis to perform"),
        timeRange: z
          .object({
            from: z.string().describe("ISO date string"),
            to: z.string().describe("ISO date string"),
          })
          .optional()
          .describe("Time range for analysis"),
        groupBy: z
          .enum(["day", "week", "month"])
          .optional()
          .describe("Grouping for timeline analysis"),
      },
      async ({ analysisType, timeRange, groupBy: _groupBy }) => {
        try {
          const { user } = getAuthContext();

          const org = await organizationsService.getById(user.organization_id);
          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const ANALYSIS_COST = 20;
          if (org.credit_balance < ANALYSIS_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: ANALYSIS_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const timeRangeObj = timeRange
            ? {
                from: new Date(timeRange.from),
                to: new Date(timeRange.to),
              }
            : undefined;

          const analysis = await memoryService.analyzeMemoryPatterns(
            user.organization_id,
            analysisType,
            timeRangeObj
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: ANALYSIS_COST,
            description: `MCP memory analysis: ${analysisType}`,
            metadata: {
              user_id: user.id,
              analysis_type: analysisType,
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Failed to deduct credits",
                      required: ANALYSIS_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "memory-analysis",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: ANALYSIS_COST,
            output_cost: 0,
            is_successful: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    analysisType: analysis.analysisType,
                    insights: analysis.insights,
                    data: analysis.data,
                    chartData: analysis.chartData,
                    cost: ANALYSIS_COST,
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to analyze memory patterns",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 16: Chat with Agent - Direct agent conversation
    server.tool(
      "chat_with_agent",
      "Send a message to your deployed ElizaOS agent and receive a response. Supports streaming via SSE. Deducts 5-100 credits based on token usage.",
      {
        message: z
          .string()
          .min(1)
          .max(4000)
          .describe("Message to send to the agent"),
        roomId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Existing conversation room ID (creates new if not provided)"
          ),
        entityId: z
          .string()
          .optional()
          .describe("User identifier (defaults to authenticated user)"),
        streaming: z
          .boolean()
          .optional()
          .default(false)
          .describe("Enable streaming response via SSE"),
      },
      async ({ message, roomId, entityId, streaming = false }) => {
        try {
          const { user } = getAuthContext();
          const org = await organizationsService.getById(user.organization_id);

          if (!org) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Organization not found" },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const estimatedInputTokens = Math.ceil(message.length / 4);
          const estimatedCost = Math.max(
            5,
            Math.ceil(estimatedInputTokens * 0.01)
          );

          if (org.credit_balance < estimatedCost) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient credits",
                      required: estimatedCost,
                      available: org.credit_balance,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          const actualRoomId =
            roomId ||
            (await agentService.getOrCreateRoom(
              entityId || user.id,
              org.id,
              user.organization_id
            ));

          const response = await agentService.sendMessage({
            roomId: actualRoomId,
            entityId: entityId || user.id,
            message,
            organizationId: user.organization_id,
            streaming,
          });

          const actualCost = Math.ceil(
            (response.usage?.inputTokens || estimatedInputTokens) * 0.01 +
              (response.usage?.outputTokens || 0) * 0.03
          );

          await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: actualCost,
            description: `MCP chat with agent`,
            metadata: {
              user_id: user.id,
              room_id: actualRoomId,
              message_id: response.messageId,
              input_tokens: response.usage?.inputTokens || 0,
              output_tokens: response.usage?.outputTokens || 0,
            },
          });

          await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            type: "mcp_tool",
            model: response.usage?.model || "eliza-agent",
            provider: "eliza",
            input_tokens: response.usage?.inputTokens || 0,
            output_tokens: response.usage?.outputTokens || 0,
            input_cost: actualCost,
            output_cost: 0,
            is_successful: true,
            error_message: null,
            metadata: { tool: "chat_with_agent", room_id: actualRoomId },
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    response: response.content,
                    roomId: actualRoomId,
                    messageId: response.messageId,
                    timestamp: response.timestamp,
                    creditsUsed: actualCost,
                    ...(streaming &&
                      response.streaming && {
                        streamUrl: response.streaming.sseUrl,
                      }),
                    usage: response.usage,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to chat with agent",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 17: List Agents
    server.tool(
      "list_agents",
      "List all available agents, characters, and deployed ElizaOS instances. FREE tool.",
      {
        filters: z
          .object({
            deployed: z.boolean().optional(),
            template: z.boolean().optional(),
            owned: z.boolean().optional(),
          })
          .optional(),
        includeStats: z.boolean().optional().default(false),
      },
      async ({ filters, includeStats = false }) => {
        try {
          const { user } = getAuthContext();

          const result = await agentDiscoveryService.listAgents(
            user.organization_id,
            user.id,
            filters,
            includeStats
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    agents: result.agents,
                    total: result.total,
                    cached: result.cached,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to list agents",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 18: Subscribe Agent Events
    server.tool(
      "subscribe_agent_events",
      "Get SSE stream URL for real-time agent events. FREE tool.",
      {
        roomId: z.string().uuid(),
      },
      async ({ roomId }) => {
        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const sseUrl = `${baseUrl}/api/mcp/stream?eventType=agent&resourceId=${roomId}`;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    sseUrl,
                    roomId,
                    eventTypes: [
                      "message_received",
                      "response_started",
                      "response_chunk",
                      "response_complete",
                      "error",
                    ],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to generate SSE URL",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 19: Stream Credit Updates
    server.tool(
      "stream_credit_updates",
      "Get SSE stream URL for real-time credit updates. FREE tool.",
      {
        includeTransactions: z.boolean().optional().default(false),
      },
      async ({ includeTransactions = false }) => {
        try {
          const { user } = getAuthContext();
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const sseUrl = `${baseUrl}/api/mcp/stream?eventType=credits&resourceId=${user.organization_id}`;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    sseUrl,
                    organizationId: user.organization_id,
                    eventTypes: ["balance_updated", "transaction_created"],
                    includeTransactions,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to generate SSE URL",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 20: List Containers
    server.tool(
      "list_containers",
      "List all deployed containers with status. FREE tool.",
      {
        status: z
          .enum(["running", "stopped", "failed", "deploying"])
          .optional(),
        includeMetrics: z.boolean().optional().default(false),
      },
      async ({ status, includeMetrics: _includeMetrics = false }) => {
        try {
          const { user } = getAuthContext();
          let containers = await containersService.listByOrganization(
            user.organization_id
          );

          if (status) {
            containers = containers.filter((c) => c.status === status);
          }

          const formattedContainers = containers.map(
            (container: (typeof containers)[0]) => ({
              id: container.id,
              name: container.name,
              status: container.status,
              url: container.load_balancer_url,
              createdAt: container.created_at,
              errorMessage: container.error_message,
              ecsServiceArn: container.ecs_service_arn,
            })
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    containers: formattedContainers,
                    total: formattedContainers.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to list containers",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );
  },
  {},
  { basePath: "/api" }
);

// Manual authentication wrapper using AsyncLocalStorage
async function handleRequest(req: NextRequest) {
  try {
    // Authenticate request
    const authResult = await requireAuthOrApiKey(req);

    // Run MCP handler within auth context using AsyncLocalStorage
    return await authContextStorage.run(authResult, async () => {
      return await mcpHandler(req as unknown as Request);
    });
  } catch (error) {
    // Return auth error in MCP format
    return NextResponse.json(
      {
        error: "authentication_failed",
        error_description:
          error instanceof Error
            ? error.message
            : "Authentication required. Please provide a valid API key in the Authorization header.",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate":
            'Bearer realm="MCP Server", error="invalid_token"',
        },
      }
    );
  }
}

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
