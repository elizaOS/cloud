import { createMcpHandler } from "mcp-handler";
import { logger } from "@/lib/utils/logger";
// IMPORTANT: Must use zod v3.x (aliased as zod3) for MCP SDK compatibility
// The MCP SDK internally uses zod v3.x, and zod v4.x has breaking internal API changes
import { z } from "zod3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AsyncLocalStorage } from "node:async_hooks";
import DOMPurify from "isomorphic-dompurify";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import type { AuthResult, Organization } from "@/lib/auth";
import type { UserWithOrganization } from "@/lib/types";

// Type for authenticated context with guaranteed organization
type AuthResultWithOrg = AuthResult & {
  user: UserWithOrganization & {
    organization_id: string;
    organization: Organization;
  };
};
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import {
  creditsService,
  InsufficientCreditsError,
  type CreditReservation,
} from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { generationsService } from "@/lib/services/generations";
import { conversationsService } from "@/lib/services/conversations";
import { memoryService } from "@/lib/services/memory";
import { containersService } from "@/lib/services/containers";
import { contentModerationService } from "@/lib/services/content-moderation";
import { characterDeploymentDiscoveryService as agentDiscoveryService } from "@/lib/services/deployments/discovery";
import { agentService } from "@/lib/services/agents/agents";
import { charactersService } from "@/lib/services/characters/characters";
import { apiKeysService } from "@/lib/services/api-keys";
import { secureTokenRedemptionService } from "@/lib/services/token-redemption-secure";
import { getContainer, deleteContainer } from "@/lib/services/containers";
import { userMcpsService } from "@/lib/services/user-mcps";
import { roomsService } from "@/lib/services/agents/rooms";
import { usersService } from "@/lib/services/users";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { agentBudgetService } from "@/lib/services/agent-budgets";
import { analyticsService } from "@/lib/services/analytics";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
  IMAGE_GENERATION_COST,
} from "@/lib/pricing";
import { uploadBase64Image } from "@/lib/blob";
import {
  MEMORY_SAVE_COST,
  MEMORY_RETRIEVAL_COST_PER_ITEM,
  MEMORY_RETRIEVAL_MAX_COST,
  CONTEXT_RETRIEVAL_COST,
  CONVERSATION_CREATE_COST,
  CONVERSATION_SEARCH_COST,
  CONVERSATION_CLONE_COST,
  CONVERSATION_EXPORT_COST,
  CONTEXT_OPTIMIZATION_COST,
  MEMORY_ANALYSIS_COST,
  AGENT_CHAT_MIN_COST,
  AGENT_CHAT_INPUT_TOKEN_COST,
  AGENT_CHAT_OUTPUT_TOKEN_COST,
  CONVERSATION_SUMMARY_BASE_COST,
  CONVERSATION_SUMMARY_MAX_COST,
} from "@/lib/config/mcp";

// Next.js requires literal values for segment config exports
export const maxDuration = 60; // 60 seconds - matches default MCP_REQUEST_TIMEOUT

// AsyncLocalStorage for request-scoped auth context (with organization guaranteed)
const authContextStorage = new AsyncLocalStorage<AuthResultWithOrg>();

// Helper to get current auth context from AsyncLocalStorage
function getAuthContext(): AuthResultWithOrg {
  const context = authContextStorage.getStore();
  if (!context) {
    throw new Error("Authentication context not available");
  }
  return context;
}

// Create MCP handler with tools
const mcpHandler = createMcpHandler(
  (server) => {
    // Tool 1: Check Credits - View balance and recent transactions
    server.registerTool(
      "check_credits",
      {
        description:
          "Check balance and recent transactions for your organization",
        inputSchema: {
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
      },
      async ({ includeTransactions = false, limit = 5 }) => {
        try {
          const { user } = getAuthContext();

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

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
            balance: Number(org.credit_balance),
            organizationId: org.id,
            organizationName: org.name,
          };

          if (includeTransactions) {
            const transactions =
              await creditsService.listTransactionsByOrganization(
                user.organization_id!,
                limit,
              );
            response.transactions = transactions.map((t) => ({
              id: t.id,
              amount: Number(t.amount),
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 2: Get Recent Usage - View API usage statistics
    server.registerTool(
      "get_recent_usage",
      {
        description:
          "Get recent API usage statistics including models used, costs, and tokens",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .default(10)
            .describe("Number of recent usage records to fetch"),
        },
      },
      async ({ limit = 10 }) => {
        try {
          const { user } = getAuthContext();

          const usageRecords = await usageService.listByOrganization(
            user.organization_id!,
            limit,
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
            totalCost:
              Number(record.input_cost || 0) + Number(record.output_cost || 0),
            isSuccessful: record.is_successful,
            errorMessage: record.error_message,
            createdAt: record.created_at.toISOString(),
          }));

          const totalCost = formattedUsage.reduce(
            (sum, record) => sum + record.totalCost,
            0,
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
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 3: Generate Text - Generate text using AI models
    server.registerTool(
      "generate_text",
      {
        description:
          "Generate text using AI models (GPT-4, Claude, Gemini). Deducts credits based on token usage.",
        inputSchema: {
          prompt: z
            .string()
            .min(1)
            .max(10000)
            .describe("The text prompt to generate from"),
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
      },
      async ({ prompt, model = "gpt-4o", maxLength = 1000 }) => {
        let generationId: string | undefined;
        let reservation: CreditReservation | null = null;

        try {
          const { user, apiKey } = getAuthContext();

          // Check if user is blocked due to moderation violations
          if (await contentModerationService.shouldBlockUser(user.id)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Account suspended due to policy violations" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          // Start async moderation with agent tracking (doesn't block)
          const agentId = `org:${user.organization_id}`;
          contentModerationService.moderateAgentInBackground(
            prompt,
            user.id,
            agentId,
            undefined,
            (result) => {
              logger.warn("[MCP] generate_text moderation violation", {
                userId: user.id,
                categories: result.flaggedCategories,
                action: result.action,
              });
            },
          );

          const provider = getProviderFromModel(model);

          // Reserve credits BEFORE generation to prevent TOCTOU race condition
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              model,
              provider,
              estimatedInputTokens: Math.ceil(prompt.length / 4),
              estimatedOutputTokens: Math.min(maxLength, 500),
              userId: user.id,
              description: `MCP text generation: ${model}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          // Create generation record
          const generation = await generationsService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "chat",
            model: model,
            provider: provider,
            prompt: prompt,
            status: "pending",
            credits: String(reservation?.reservedAmount ?? 0),
            cost: String(reservation?.reservedAmount ?? 0),
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
            usage?.outputTokens || 0,
          );

          // Reconcile credits (refund excess or charge additional)
          await reservation?.reconcile(totalCost);

          // Create usage record
          const usageRecord = await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "chat",
            model: model,
            provider: provider,
            input_tokens: usage?.inputTokens || 0,
            output_tokens: usage?.outputTokens || 0,
            input_cost: String(inputCost),
            output_cost: String(outputCost),
            is_successful: true,
          });

          // Update generation record
          await generationsService.update(generationId, {
            status: "completed",
            content: fullText,
            tokens: (usage?.inputTokens || 0) + (usage?.outputTokens || 0),
            cost: String(totalCost),
            credits: String(totalCost),
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
          // Refund credits if generation failed
          try {
            await reservation?.reconcile(0);
          } catch (refundError) {
            logger.error("Failed to refund credits:", refundError);
          }

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
              logger.error("Failed to update generation record:", updateError);
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 4: Generate Image - Generate images using Gemini
    server.registerTool(
      "generate_image",
      {
        description:
          "Generate images using Google Gemini 2.5. Deducts credits per image generated.",
        inputSchema: {
          prompt: z
            .string()
            .min(1)
            .max(5000)
            .describe("Description of the image to generate"),
          aspectRatio: z
            .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
            .optional()
            .default("1:1")
            .describe("Aspect ratio for the generated image"),
        },
      },
      async ({ prompt, aspectRatio = "1:1" }) => {
        let generationId: string | undefined;
        let reservation: CreditReservation | null = null;

        try {
          const { user, apiKey } = getAuthContext();

          // Check if user is blocked due to moderation violations
          if (await contentModerationService.shouldBlockUser(user.id)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Account suspended due to policy violations" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          // Start async moderation for image prompt with agent tracking (doesn't block)
          const agentId = `org:${user.organization_id}`;
          contentModerationService.moderateAgentInBackground(
            prompt,
            user.id,
            agentId,
            undefined,
            (result) => {
              logger.warn("[MCP] generate_image moderation violation", {
                userId: user.id,
                categories: result.flaggedCategories,
                action: result.action,
              });
            },
          );

          // Reserve credits BEFORE generation to prevent TOCTOU race condition
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: IMAGE_GENERATION_COST,
              userId: user.id,
              description:
                "MCP image generation: google/gemini-2.5-flash-image",
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          // Create generation record
          const generation = await generationsService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "image",
            model: "google/gemini-2.5-flash-image",
            provider: "google",
            prompt: prompt,
            status: "pending",
            credits: String(IMAGE_GENERATION_COST),
            cost: String(IMAGE_GENERATION_COST),
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
            model: "google/gemini-2.5-flash-image",
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
            // Refund credits since image generation failed
            await reservation?.reconcile(0);

            const usageRecord = await usageService.create({
              organization_id: user.organization_id!!,
              user_id: user.id,
              api_key_id: apiKey?.id || null,
              type: "image",
              model: "google/gemini-2.5-flash-image",
              provider: "google",
              input_tokens: 0,
              output_tokens: 0,
              input_cost: String(0),
              output_cost: String(0),
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
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const usageRecord = await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "image",
            model: "google/gemini-2.5-flash-image",
            provider: "google",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(IMAGE_GENERATION_COST),
            output_cost: String(0),
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
            logger.error("Failed to upload to Vercel Blob:", blobError);
          }

          // Reconcile credits (confirm the charge)
          await reservation?.reconcile(IMAGE_GENERATION_COST);

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
                    cost: String(IMAGE_GENERATION_COST),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          // Refund credits if generation failed
          try {
            await reservation?.reconcile(0);
          } catch (refundError) {
            logger.error("Failed to refund credits:", refundError);
          }

          if (generationId) {
            try {
              await generationsService.update(generationId, {
                status: "failed",
                error:
                  error instanceof Error ? error.message : "Generation failed",
                completed_at: new Date(),
              });
            } catch (updateError) {
              logger.error("Failed to update generation record:", updateError);
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "save_memory",
      {
        description:
          "Save important information to long-term memory with semantic tagging. Deducts 1 credit per save.",
        inputSchema: {
          content: z
            .string()
            .min(1)
            .max(10000)
            .describe("The memory content to save"),
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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

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
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          // SECURITY FIX: Validate and sanitize inputs to prevent XSS and data corruption

          // 1. Sanitize content to prevent stored XSS
          const sanitizedContent = DOMPurify.sanitize(content, {
            ALLOWED_TAGS: [], // Strip all HTML tags
            ALLOWED_ATTR: [], // Strip all attributes
            KEEP_CONTENT: true, // Keep text content
          });

          // 2. Validate metadata size (max 5KB to prevent abuse)
          if (metadata) {
            const metadataSize = JSON.stringify(metadata).length;
            const MAX_METADATA_SIZE = 5 * 1024; // 5KB

            if (metadataSize > MAX_METADATA_SIZE) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Metadata too large",
                        maxSize: MAX_METADATA_SIZE,
                        actualSize: metadataSize,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
          }

          // 3. Validate and sanitize tags
          let sanitizedTags = tags;
          if (tags && tags.length > 0) {
            // Limit number of tags
            if (tags.length > 20) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Too many tags",
                        maxTags: 20,
                        provided: tags.length,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }

            // Sanitize each tag
            sanitizedTags = tags
              .map(
                (tag: string) =>
                  DOMPurify.sanitize(tag, {
                    ALLOWED_TAGS: [],
                    ALLOWED_ATTR: [],
                    KEEP_CONTENT: true,
                  })
                    .trim()
                    .substring(0, 50), // Limit tag length to 50 chars
              )
              .filter((tag: string) => tag.length > 0); // Remove empty tags
          }

          // Reserve credits BEFORE expensive operation to prevent TOCTOU race condition
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: MEMORY_SAVE_COST,
              userId: user.id,
              description: `MCP memory save: ${type}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let result: Awaited<ReturnType<typeof memoryService.saveMemory>>;
          try {
            result = await memoryService.saveMemory({
              organizationId: user.organization_id!!,
              roomId: roomId,
              entityId: user.id,
              content: sanitizedContent,
              type,
              tags: sanitizedTags,
              metadata,
              ttl,
              persistent,
            });
          } catch (saveError) {
            // Refund credits if save failed
            await reservation?.reconcile(0);
            throw saveError;
          }

          // Confirm the charge
          await reservation?.reconcile(MEMORY_SAVE_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "memory-storage",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(MEMORY_SAVE_COST),
            output_cost: String(0),
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
                    cost: String(MEMORY_SAVE_COST),
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "retrieve_memories",
      {
        description:
          "Search and retrieve memories using semantic search or filters. Deducts 0.1 credit per memory retrieved (max 5 credits).",
        inputSchema: {
          query: z.string().optional().describe("Semantic search query"),
          roomId: z
            .string()
            .optional()
            .describe("Filter to specific room/conversation"),
          type: z
            .array(z.string())
            .optional()
            .describe("Filter by memory type"),
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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          // Reserve max credits BEFORE retrieval to prevent TOCTOU race condition
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: MEMORY_RETRIEVAL_MAX_COST,
              userId: user.id,
              description: "MCP memory retrieval",
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let memories: Awaited<
            ReturnType<typeof memoryService.retrieveMemories>
          >;
          try {
            memories = await memoryService.retrieveMemories({
              organizationId: user.organization_id!!,
              query,
              roomId,
              type,
              tags,
              limit,
              sortBy,
            });
          } catch (retrieveError) {
            // Refund credits if retrieval failed
            await reservation?.reconcile(0);
            throw retrieveError;
          }

          // Calculate actual cost and reconcile (refund excess if any)
          const actualCost = Math.min(
            Math.ceil(memories.length * MEMORY_RETRIEVAL_COST_PER_ITEM),
            MEMORY_RETRIEVAL_MAX_COST,
          );
          await reservation?.reconcile(actualCost);

          if (actualCost > 0) {
            await usageService.create({
              organization_id: user.organization_id!!,
              user_id: user.id,
              api_key_id: null,
              type: "memory",
              model: "memory-retrieval",
              provider: "internal",
              input_tokens: 0,
              output_tokens: 0,
              input_cost: String(actualCost),
              output_cost: String(0),
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
                    cost: String(actualCost),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "delete_memory",
      {
        description:
          "Remove a specific memory or bulk delete by filters. No credit cost.",
        inputSchema: {
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
      },
      async ({ memoryId, olderThan, type, tags }) => {
        try {
          const { user } = getAuthContext();

          const result = await memoryService.deleteMemory({
            organizationId: user.organization_id!!,
            memoryId,
            olderThan,
            type,
            tags,
          });

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "memory-deletion",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(0),
            output_cost: String(0),
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
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "get_conversation_context",
      {
        description:
          "Retrieve enriched conversation context with memory integration. Deducts 1 credit per request.",
        inputSchema: {
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
      },
      async ({ roomId, depth = 20 }) => {
        try {
          const { user } = getAuthContext();

          // Reserve credits BEFORE operation to prevent TOCTOU race condition
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: CONTEXT_RETRIEVAL_COST,
              userId: user.id,
              description: `MCP conversation context: ${roomId}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let context;
          try {
            context = await memoryService.getRoomContext(
              roomId,
              user.organization_id!,
              depth,
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(CONTEXT_RETRIEVAL_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "context-retrieval",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(CONTEXT_RETRIEVAL_COST),
            output_cost: String(0),
            is_successful: true,
          });

          const tokenEstimate = await memoryService.estimateTokenCount(
            context.messages,
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
                    cost: String(CONTEXT_RETRIEVAL_COST),
                    messages: context.messages.map((m) => ({
                      id: m.id,
                      content: m.content,
                      createdAt: m.createdAt,
                      entityId: m.entityId,
                    })),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "create_conversation",
      {
        description:
          "Create a new conversation context with initial settings. Deducts 1 credit.",
        inputSchema: {
          title: z.string().min(1).describe("Conversation title"),
          model: z
            .string()
            .optional()
            .describe("Default model to use (default: gpt-4o)"),
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
      },
      async ({ title, model, systemPrompt, settings }) => {
        const actualModel = model || "gpt-4o";
        try {
          const { user } = getAuthContext();

          // Reserve credits BEFORE operation to prevent TOCTOU race condition
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: CONVERSATION_CREATE_COST,
              userId: user.id,
              description: `MCP conversation created: ${title}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let conversation;
          try {
            conversation = await conversationsService.create({
              organization_id: user.organization_id!!,
              user_id: user.id,
              title,
              model: actualModel,
              settings: {
                ...settings,
                systemPrompt,
              },
            });
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(CONVERSATION_CREATE_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-creation",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(CONVERSATION_CREATE_COST),
            output_cost: String(0),
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
                    cost: String(CONVERSATION_CREATE_COST),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "search_conversations",
      {
        description:
          "Search through conversation history with filters. Deducts 2 credits per search.",
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe("Search query (semantic or keyword)"),
          model: z
            .array(z.string())
            .optional()
            .describe("Filter by model used"),
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
      },
      async ({ query, limit = 10 }) => {
        try {
          const { user } = getAuthContext();

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: CONVERSATION_SEARCH_COST,
              userId: user.id,
              description: `MCP conversation search: ${query || "all"}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let conversations;
          try {
            conversations = await conversationsService.listByOrganization(
              user.organization_id!,
              limit,
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          await reservation?.reconcile(CONVERSATION_SEARCH_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-search",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(CONVERSATION_SEARCH_COST),
            output_cost: String(0),
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
                    cost: String(CONVERSATION_SEARCH_COST),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "summarize_conversation",
      {
        description:
          "Generate a summary of conversation history. Deducts 10-50 credits based on token usage.",
        inputSchema: {
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
      },
      async ({
        roomId,
        lastN = 50,
        style = "brief",
        includeMetadata = false,
      }) => {
        try {
          const { user } = getAuthContext();

          // Reserve max cost BEFORE operation
          const estimatedCost = Math.min(
            CONVERSATION_SUMMARY_BASE_COST + Math.floor(lastN / 10),
            CONVERSATION_SUMMARY_MAX_COST,
          );

          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: estimatedCost,
              userId: user.id,
              description: `MCP conversation summary: ${roomId}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let summary;
          try {
            summary = await memoryService.summarizeConversation({
              roomId,
              organizationId: user.organization_id!!,
              lastN,
              style,
              includeMetadata,
            });
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Calculate actual cost and reconcile
          const actualCost = Math.min(
            CONVERSATION_SUMMARY_BASE_COST +
              Math.ceil(summary.tokenCount / 1000),
            CONVERSATION_SUMMARY_MAX_COST,
          );
          await reservation?.reconcile(actualCost);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "chat",
            model: "gpt-4o-mini",
            provider: "openai",
            input_tokens: summary.tokenCount,
            output_tokens: 0,
            input_cost: String(actualCost),
            output_cost: String(0),
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
                    cost: String(actualCost),
                    newBalance: deductionResult.newBalance,
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "optimize_context_window",
      {
        description:
          "Intelligently select the most relevant context for token-limited requests. Deducts 5 credits.",
        inputSchema: {
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
      },
      async ({ roomId, maxTokens, query, preserveRecent = 5 }) => {
        try {
          const { user } = getAuthContext();

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: CONTEXT_OPTIMIZATION_COST,
              userId: user.id,
              description: `MCP context optimization: ${roomId}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                        available: error.available,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let optimized;
          try {
            optimized = await memoryService.optimizeContextWindow(
              roomId,
              user.organization_id!,
              maxTokens,
              query,
              preserveRecent,
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(CONTEXT_OPTIMIZATION_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "context-optimization",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(CONTEXT_OPTIMIZATION_COST),
            output_cost: String(0),
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
                    cost: String(CONTEXT_OPTIMIZATION_COST),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "export_conversation",
      {
        description:
          "Export conversation history in various formats (json, markdown, txt). Deducts 5 credits.",
        inputSchema: {
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
      },
      async ({ conversationId, format }) => {
        try {
          const { user } = getAuthContext();

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: CONVERSATION_EXPORT_COST,
              userId: user.id,
              description: `MCP conversation export: ${conversationId}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                        available: error.available,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let exportData;
          try {
            exportData = await memoryService.exportConversation(
              conversationId,
              user.organization_id!,
              format,
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(CONVERSATION_EXPORT_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-export",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(CONVERSATION_EXPORT_COST),
            output_cost: String(0),
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
                    cost: String(CONVERSATION_EXPORT_COST),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "clone_conversation",
      {
        description:
          "Duplicate a conversation with optional modifications. Deducts 2 credits.",
        inputSchema: {
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

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: CONVERSATION_CLONE_COST,
              userId: user.id,
              description: `MCP conversation clone: ${conversationId}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                        available: error.available,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let cloneResult;
          try {
            cloneResult = await memoryService.cloneConversation(
              conversationId,
              user.organization_id!,
              user.id,
              {
                newTitle,
                preserveMessages,
                preserveMemories,
                newModel,
              },
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(CONVERSATION_CLONE_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "conversation",
            model: "conversation-clone",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(CONVERSATION_CLONE_COST),
            output_cost: String(0),
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
                    cost: String(CONVERSATION_CLONE_COST),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "analyze_memory_patterns",
      {
        description:
          "Analyze user/org memory patterns for insights (topics, sentiment, entities, timeline). Deducts 20 credits.",
        inputSchema: {
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
      },
      async ({ analysisType }) => {
        try {
          const { user } = getAuthContext();

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: MEMORY_ANALYSIS_COST,
              userId: user.id,
              description: `MCP memory analysis: ${analysisType}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                        available: error.available,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let analysis;
          try {
            analysis = await memoryService.analyzeMemoryPatterns(
              user.organization_id!,
              analysisType,
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(MEMORY_ANALYSIS_COST);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: null,
            type: "memory",
            model: "memory-analysis",
            provider: "internal",
            input_tokens: 0,
            output_tokens: 0,
            input_cost: String(MEMORY_ANALYSIS_COST),
            output_cost: String(0),
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
                    cost: String(MEMORY_ANALYSIS_COST),
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 16: Chat with Agent - Direct agent conversation
    server.registerTool(
      "chat_with_agent",
      {
        description:
          "Send a message to your deployed ElizaOS agent and receive a response. Supports streaming via SSE. Charges $0.0001-$0.01 based on token usage.",
        inputSchema: {
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
              "Existing conversation room ID (creates new if not provided)",
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
      },
      async ({ message, roomId, entityId, streaming = false }) => {
        try {
          const { user } = getAuthContext();

          // Check if user is blocked due to moderation violations
          if (await contentModerationService.shouldBlockUser(user.id)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Account suspended due to policy violations" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          // Start async moderation with agent tracking (doesn't block)
          const agentId = `org:${user.organization_id}`;
          contentModerationService.moderateAgentInBackground(
            message,
            user.id,
            agentId,
            roomId,
            (result) => {
              logger.warn("[MCP] chat_with_agent moderation violation", {
                userId: user.id,
                categories: result.flaggedCategories,
                action: result.action,
              });
            },
          );

          // Estimate cost and reserve credits BEFORE operation
          const estimatedInputTokens = Math.ceil(message.length / 4);
          const estimatedCost = Math.max(
            AGENT_CHAT_MIN_COST,
            Math.ceil(estimatedInputTokens * AGENT_CHAT_INPUT_TOKEN_COST),
          );

          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: estimatedCost * 2, // Reserve 2x estimated for output tokens
              userId: user.id,
              description: "MCP chat with agent",
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance",
                        required: error.required,
                        available: error.available,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            throw error;
          }

          let actualRoomId;
          let response;
          try {
            actualRoomId =
              roomId ||
              (await agentService.getOrCreateRoom(
                entityId || user.id,
                user.organization_id!,
              ));

            response = await agentService.sendMessage({
              roomId: actualRoomId,
              entityId: entityId || user.id,
              message,
              organizationId: user.organization_id!!,
              streaming,
            });
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          const actualCost = Math.ceil(
            (response.usage?.inputTokens || estimatedInputTokens) *
              AGENT_CHAT_INPUT_TOKEN_COST +
              (response.usage?.outputTokens || 0) *
                AGENT_CHAT_OUTPUT_TOKEN_COST,
          );

          // Reconcile with actual cost
          await reservation?.reconcile(actualCost);

          await usageService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            type: "mcp_tool",
            model: response.usage?.model || "eliza-agent",
            provider: "eliza",
            input_tokens: response.usage?.inputTokens || 0,
            output_tokens: response.usage?.outputTokens || 0,
            input_cost: String(actualCost),
            output_cost: String(0),
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
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 17: List Agents
    server.registerTool(
      "list_agents",
      {
        description:
          "List all available agents, characters, and deployed ElizaOS instances. FREE tool.",
        inputSchema: {
          filters: z
            .object({
              deployed: z.boolean().optional(),
              template: z.boolean().optional(),
              owned: z.boolean().optional(),
            })
            .optional(),
          includeStats: z.boolean().optional().default(false),
        },
      },
      async ({ filters, includeStats = false }) => {
        try {
          const { user } = getAuthContext();

          const result = await agentDiscoveryService.listAgents(
            user.organization_id!,
            user.id,
            filters,
            includeStats,
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
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 18: Subscribe Agent Events
    server.registerTool(
      "subscribe_agent_events",
      {
        description:
          "Get SSE stream URL for real-time agent events. FREE tool.",
        inputSchema: {
          roomId: z.string().uuid(),
        },
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
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 19: Stream Credit Updates
    server.registerTool(
      "stream_credit_updates",
      {
        description:
          "Get SSE stream URL for real-time credit updates. FREE tool.",
        inputSchema: {
          includeTransactions: z.boolean().optional().default(false),
        },
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
                    organizationId: user.organization_id!!,
                    eventTypes: ["balance_updated", "transaction_created"],
                    includeTransactions,
                  },
                  null,
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 20: List Containers
    server.registerTool(
      "list_containers",
      {
        description: "List all deployed containers with status. FREE tool.",
        inputSchema: {
          status: z
            .enum(["running", "stopped", "failed", "deploying"])
            .optional(),
          includeMetrics: z.boolean().optional().default(false),
        },
      },
      async ({ status }) => {
        try {
          const { user } = getAuthContext();
          let containers = await containersService.listByOrganization(
            user.organization_id!,
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
            }),
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
                  2,
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
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 21: Create Agent
    server.registerTool(
      "create_agent",
      {
        description: "Create a new agent/character. Cost: FREE",
        inputSchema: {
          name: z.string().describe("Agent name"),
          bio: z.union([z.string(), z.array(z.string())]).describe("Agent bio"),
          system: z.string().optional().describe("System prompt"),
          category: z
            .string()
            .optional()
            .default("assistant")
            .describe("Agent category"),
          tags: z.array(z.string()).optional().describe("Agent tags"),
        },
      },
      async ({ name, bio, system, category, tags }) => {
        try {
          const { user } = getAuthContext();

          const character = await charactersService.create({
            organization_id: user.organization_id!,
            user_id: user.id,
            name,
            bio: Array.isArray(bio) ? bio : [bio],
            system: system || null,
            category: category || "assistant",
            tags: tags || [],
            source: "mcp",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    agentId: character.id,
                    name: character.name,
                  },
                  null,
                  2,
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
                        : "Failed to create agent",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 22: Update Agent
    server.registerTool(
      "update_agent",
      {
        description: "Update an existing agent/character. Cost: FREE",
        inputSchema: {
          agentId: z.string().describe("Agent ID to update"),
          name: z.string().optional().describe("New agent name"),
          bio: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe("New agent bio"),
          system: z.string().optional().describe("New system prompt"),
          category: z.string().optional().describe("New category"),
          tags: z.array(z.string()).optional().describe("New tags"),
        },
      },
      async ({ agentId, name, bio, system, category, tags }) => {
        try {
          const { user } = getAuthContext();

          const updates: Record<string, unknown> = {};
          if (name) updates.name = name;
          if (bio) updates.bio = Array.isArray(bio) ? bio : [bio];
          if (system !== undefined) updates.system = system;
          if (category) updates.category = category;
          if (tags) updates.tags = tags;

          const updated = await charactersService.updateForUser(
            agentId,
            user.id,
            updates,
          );
          if (!updated) throw new Error("Agent not found or not owned by user");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, agentId }, null, 2),
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
                        : "Failed to update agent",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 23: Delete Agent
    server.registerTool(
      "delete_agent",
      {
        description: "Delete an agent/character. Cost: FREE",
        inputSchema: {
          agentId: z.string().describe("Agent ID to delete"),
        },
      },
      async ({ agentId }) => {
        try {
          const { user } = getAuthContext();

          const deleted = await charactersService.deleteForUser(
            agentId,
            user.id,
          );
          if (!deleted) throw new Error("Agent not found or not owned by user");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, agentId }, null, 2),
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
                        : "Failed to delete agent",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 24: Generate Video
    server.registerTool(
      "generate_video",
      {
        description: "Generate a video using AI models. Cost: $5 per video",
        inputSchema: {
          prompt: z.string().describe("Video generation prompt"),
          model: z
            .string()
            .optional()
            .default("fal-ai/veo3")
            .describe("Model to use for generation"),
        },
      },
      async ({ prompt, model }) => {
        try {
          const { user, apiKey } = getAuthContext();
          const VIDEO_COST = 5;

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: VIDEO_COST,
              userId: user.id,
              description: `MCP video generation: ${model}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              throw new Error(
                `Insufficient credits: need $${VIDEO_COST.toFixed(2)}`,
              );
            }
            throw error;
          }

          let generation;
          try {
            generation = await generationsService.create({
              organization_id: user.organization_id!,
              user_id: user.id,
              api_key_id: apiKey?.id || null,
              type: "video",
              model,
              provider: "fal",
              prompt,
              status: "pending",
              credits: String(VIDEO_COST),
              cost: String(VIDEO_COST),
            });
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(VIDEO_COST);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    jobId: generation.id,
                    status: "pending",
                    cost: VIDEO_COST,
                    message:
                      "Video generation started. Poll /api/v1/gallery to check status.",
                  },
                  null,
                  2,
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
                        : "Failed to generate video",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 25: Generate Embeddings
    server.registerTool(
      "generate_embeddings",
      {
        description:
          "Generate vector embeddings for text. Cost: ~$0.00002 per 1K tokens",
        inputSchema: {
          input: z
            .union([z.string(), z.array(z.string())])
            .describe("Text or array of texts to embed"),
          model: z
            .string()
            .optional()
            .default("text-embedding-3-small")
            .describe("Embedding model"),
        },
      },
      async ({ input, model }) => {
        try {
          const { user } = getAuthContext();
          const inputs = Array.isArray(input) ? input : [input];
          const totalTokens = inputs.reduce(
            (sum, text) => sum + estimateTokens(text),
            0,
          );
          const COST_PER_TOKEN = 0.00002 / 1000;
          const cost = totalTokens * COST_PER_TOKEN;

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: cost,
              userId: user.id,
              description: `MCP embeddings: ${model}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              throw new Error(`Insufficient credits: need $${cost.toFixed(6)}`);
            }
            throw error;
          }

          let data;
          try {
            const provider = getProvider();
            const response = await provider.createEmbeddings({
              model,
              input: inputs,
            });
            data = await response.json();
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(cost);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    embeddings: data.data.map(
                      (d: { embedding: number[] }) => d.embedding,
                    ),
                    model,
                    usage: { totalTokens },
                    cost,
                  },
                  null,
                  2,
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
                        : "Failed to generate embeddings",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 26: List Models
    server.registerTool(
      "list_models",
      {
        description: "List all available AI models. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const provider = getProvider();
          const response = await provider.listModels();
          const data = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    models: data.data.map(
                      (m: { id: string; owned_by: string }) => ({
                        id: m.id,
                        owned_by: m.owned_by,
                      }),
                    ),
                    total: data.data.length,
                  },
                  null,
                  2,
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
                        : "Failed to list models",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 27: Query Knowledge
    server.registerTool(
      "query_knowledge",
      {
        description:
          "Query the knowledge base using semantic search. Cost: varies by result count",
        inputSchema: {
          query: z.string().describe("Search query"),
          characterId: z
            .string()
            .optional()
            .describe("Filter by character/agent ID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .default(5)
            .describe("Max results"),
        },
      },
      async ({ query, characterId, limit }) => {
        try {
          const { user } = getAuthContext();

          const results = await memoryService.retrieveMemories({
            organizationId: user.organization_id!,
            query,
            roomId: characterId,
            limit,
            sortBy: "relevance",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    results: results.map((r) => ({
                      content:
                        r.memory.content?.text || String(r.memory.content),
                      score: r.score,
                      id: r.memory.id,
                    })),
                    count: results.length,
                  },
                  null,
                  2,
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
                        : "Failed to query knowledge",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 28: List Gallery
    server.registerTool(
      "list_gallery",
      {
        description: "List all generated media (images and videos). FREE tool.",
        inputSchema: {
          type: z
            .enum(["image", "video"])
            .optional()
            .describe("Filter by media type"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .default(20)
            .describe("Max results"),
        },
      },
      async ({ type, limit }) => {
        try {
          const { user } = getAuthContext();

          let generations = await generationsService.listByOrganization(
            user.organization_id!,
            limit,
          );
          if (type) {
            generations = generations.filter((g) => g.type === type);
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    media: generations.map((g) => ({
                      id: g.id,
                      type: g.type,
                      url: g.storage_url || g.content || "",
                      prompt: g.prompt || "",
                      status: g.status,
                      createdAt: g.created_at,
                    })),
                    total: generations.length,
                  },
                  null,
                  2,
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
                        : "Failed to list gallery",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 29: Text to Speech
    server.registerTool(
      "text_to_speech",
      {
        description:
          "Convert text to speech audio. Cost: ~$0.001 per 100 chars",
        inputSchema: {
          text: z.string().max(5000).describe("Text to convert to speech"),
          voiceId: z.string().optional().describe("ElevenLabs voice ID"),
        },
      },
      async ({ text, voiceId }) => {
        try {
          const { user } = getAuthContext();
          const TTS_COST = 0.001 * Math.ceil(text.length / 100);

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: TTS_COST,
              userId: user.id,
              description: "MCP text-to-speech",
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              throw new Error("Insufficient credits");
            }
            throw error;
          }

          let audioUrl;
          try {
            const elevenLabs = await getElevenLabsService();
            const audioBuffer = await elevenLabs.textToSpeech(
              text,
              voiceId || "21m00Tcm4TlvDq8ikWAM",
            );
            const { uploadFromBuffer } = await import("@/lib/blob");
            audioUrl = await uploadFromBuffer(
              audioBuffer,
              `tts-${Date.now()}.mp3`,
              "audio/mpeg",
            );
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(TTS_COST);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, audioUrl, format: "mp3", cost: TTS_COST },
                  null,
                  2,
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
                        : "Failed to generate speech",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 30: List Voices
    server.registerTool(
      "list_voices",
      {
        description: "List available TTS voices. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const elevenLabs = await getElevenLabsService();
          const voices = await elevenLabs.listVoices();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    voices: voices.map(
                      (v: {
                        voice_id: string;
                        name: string;
                        category: string;
                      }) => ({
                        id: v.voice_id,
                        name: v.name,
                        category: v.category,
                      }),
                    ),
                  },
                  null,
                  2,
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
                        : "Failed to list voices",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 31: Get Analytics
    server.registerTool(
      "get_analytics",
      {
        description: "Get usage analytics overview. FREE tool.",
        inputSchema: {
          timeRange: z
            .enum(["daily", "weekly", "monthly"])
            .optional()
            .default("daily")
            .describe("Time range"),
        },
      },
      async ({ timeRange }) => {
        try {
          const { user } = getAuthContext();
          const overview = await analyticsService.getOverview(
            user.organization_id!,
            timeRange,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    overview: {
                      totalRequests: overview.summary.totalRequests,
                      successRate: overview.summary.successRate,
                      totalCost: overview.summary.totalCost,
                      avgCostPerRequest: overview.summary.avgCostPerRequest,
                      timeRange,
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get analytics",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 32: List API Keys
    server.registerTool(
      "list_api_keys",
      {
        description: "List all API keys. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();
          const keys = await apiKeysService.listByOrganization(
            user.organization_id!,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    apiKeys: keys.map((k) => ({
                      id: k.id,
                      name: k.name,
                      keyPrefix: k.key_prefix,
                      isActive: k.is_active,
                      createdAt: k.created_at,
                    })),
                  },
                  null,
                  2,
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
                        : "Failed to list API keys",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 33: Create API Key
    server.registerTool(
      "create_api_key",
      {
        description:
          "Create a new API key. FREE tool. Returns plain key only once!",
        inputSchema: {
          name: z.string().min(1).describe("API key name"),
          description: z.string().optional().describe("Description"),
          rateLimit: z
            .number()
            .int()
            .min(1)
            .optional()
            .default(1000)
            .describe("Rate limit per minute"),
        },
      },
      async ({ name, description, rateLimit }) => {
        try {
          const { user } = getAuthContext();

          const { apiKey, plainKey } = await apiKeysService.create({
            name,
            description: description || null,
            organization_id: user.organization_id!,
            user_id: user.id,
            permissions: [],
            rate_limit: rateLimit,
            expires_at: null,
            is_active: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    apiKey: {
                      id: apiKey.id,
                      name: apiKey.name,
                      keyPrefix: apiKey.key_prefix,
                    },
                    plainKey, // IMPORTANT: Only shown once!
                    warning:
                      "Store this key securely - it will not be shown again!",
                  },
                  null,
                  2,
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
                        : "Failed to create API key",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 34: Delete API Key
    server.registerTool(
      "delete_api_key",
      {
        description: "Delete an API key. FREE tool.",
        inputSchema: {
          apiKeyId: z.string().uuid().describe("API key ID to delete"),
        },
      },
      async ({ apiKeyId }) => {
        try {
          const { user } = getAuthContext();
          await apiKeysService.delete(apiKeyId, user.organization_id!);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, apiKeyId }, null, 2),
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
                        : "Failed to delete API key",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 35: Get Redemption Balance
    server.registerTool(
      "get_redemption_balance",
      {
        description: "Get redeemable token balance. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();
          const balance = await secureTokenRedemptionService.getEarnedBalance(
            user.organization_id!,
          );
          const pending =
            await secureTokenRedemptionService.getPendingRedemptions(
              user.organization_id!,
            );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    redeemableBalance: balance,
                    pendingRedemptions: pending.reduce(
                      (sum, p) => sum + p.pointsAmount,
                      0,
                    ),
                    pendingCount: pending.length,
                  },
                  null,
                  2,
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
                        : "Failed to get redemption balance",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 36: Generate Prompts
    server.registerTool(
      "generate_prompts",
      {
        description: "Generate AI agent concept prompts. Cost: ~$0.01",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();
          const COST = 0.01;

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: COST,
              userId: user.id,
              description: "MCP prompt generation",
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              throw new Error("Insufficient credits");
            }
            throw error;
          }

          let prompts;
          try {
            const { openai } = await import("@ai-sdk/openai");
            const { generateText } = await import("ai");

            const { text } = await generateText({
              model: openai("gpt-4o-mini"),
              prompt: `Generate 4 short, practical AI agent concepts (max 8 words each). Return ONLY a JSON array of strings.`,
            });

            prompts = JSON.parse(text);
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(COST);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, prompts, cost: COST },
                  null,
                  2,
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
                        : "Failed to generate prompts",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 37: Upload Knowledge
    server.registerTool(
      "upload_knowledge",
      {
        description: "Upload a knowledge document for RAG. Cost: ~$0.01",
        inputSchema: {
          content: z.string().describe("Document content"),
          title: z.string().describe("Document title"),
          characterId: z
            .string()
            .optional()
            .describe("Associate with specific agent"),
        },
      },
      async ({ content, title, characterId }) => {
        try {
          const { user } = getAuthContext();
          const COST = 0.01;

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: COST,
              userId: user.id,
              description: "MCP knowledge upload",
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              throw new Error("Insufficient credits");
            }
            throw error;
          }

          let result;
          try {
            result = await memoryService.saveMemory({
              organizationId: user.organization_id!,
              content,
              roomId: characterId,
              metadata: { title, type: "knowledge" },
            });
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(COST);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    documentId: result.memoryId,
                    status: "indexed",
                    cost: COST,
                  },
                  null,
                  2,
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
                        : "Failed to upload knowledge",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 38: Get Container
    server.registerTool(
      "get_container",
      {
        description: "Get container details. FREE tool.",
        inputSchema: {
          containerId: z.string().uuid().describe("Container ID"),
        },
      },
      async ({ containerId }) => {
        try {
          const { user } = getAuthContext();
          const container = await getContainer(
            containerId,
            user.organization_id!,
          );
          if (!container) throw new Error("Container not found");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    container: {
                      id: container.id,
                      name: container.name,
                      status: container.status,
                      url: container.load_balancer_url,
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get container",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 39: Get Container Health
    server.registerTool(
      "get_container_health",
      {
        description: "Get container health status. FREE tool.",
        inputSchema: {
          containerId: z.string().uuid().describe("Container ID"),
        },
      },
      async ({ containerId }) => {
        try {
          const { user } = getAuthContext();
          const container = await getContainer(
            containerId,
            user.organization_id!,
          );
          if (!container) throw new Error("Container not found");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    healthy: container.status === "running",
                    status: container.status,
                  },
                  null,
                  2,
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
                        : "Failed to get container health",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 40: Get Container Logs
    server.registerTool(
      "get_container_logs",
      {
        description: "Get container logs. FREE tool.",
        inputSchema: {
          containerId: z.string().uuid().describe("Container ID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .default(50)
            .describe("Max log entries"),
        },
      },
      async ({ containerId, limit }) => {
        try {
          const { user } = getAuthContext();
          const container = await getContainer(
            containerId,
            user.organization_id!,
          );
          if (!container) throw new Error("Container not found");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    logs: [
                      `Container ${containerId} status: ${container.status}`,
                    ],
                    limit,
                  },
                  null,
                  2,
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
                        : "Failed to get container logs",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 41: List MCPs
    server.registerTool(
      "list_mcps",
      {
        description: "List MCP servers. FREE tool.",
        inputSchema: {
          scope: z
            .enum(["own", "public"])
            .optional()
            .default("own")
            .describe("Scope"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .default(20)
            .describe("Max results"),
        },
      },
      async ({ scope, limit }) => {
        try {
          const { user } = getAuthContext();
          const mcps = await userMcpsService.list({
            organizationId: user.organization_id!,
            scope,
            limit,
            offset: 0,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    mcps: mcps.map((m) => ({
                      id: m.id,
                      name: m.name,
                      slug: m.slug,
                      status: m.status,
                    })),
                    total: mcps.length,
                  },
                  null,
                  2,
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
                        : "Failed to list MCPs",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 42: Create MCP
    server.registerTool(
      "create_mcp",
      {
        description: "Create a new MCP server. FREE tool.",
        inputSchema: {
          name: z.string().min(1).max(100).describe("MCP name"),
          slug: z
            .string()
            .min(1)
            .max(50)
            .regex(/^[a-z0-9-]+$/)
            .describe("URL slug"),
          description: z.string().min(1).max(1000).describe("Description"),
        },
      },
      async ({ name, slug, description }) => {
        try {
          const { user } = getAuthContext();
          const mcp = await userMcpsService.create({
            organization_id: user.organization_id!,
            user_id: user.id,
            name,
            slug,
            description,
            status: "draft",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, mcpId: mcp.id, slug: mcp.slug },
                  null,
                  2,
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
                        : "Failed to create MCP",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 43: Delete MCP
    server.registerTool(
      "delete_mcp",
      {
        description: "Delete an MCP server. FREE tool.",
        inputSchema: {
          mcpId: z.string().uuid().describe("MCP ID to delete"),
        },
      },
      async ({ mcpId }) => {
        try {
          const { user } = getAuthContext();
          await userMcpsService.delete(mcpId, user.organization_id!);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, mcpId }, null, 2),
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
                        : "Failed to delete MCP",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 44: List Rooms
    server.registerTool(
      "list_rooms",
      {
        description: "List chat rooms. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();
          const rooms = await roomsService.getRoomsForEntity(user.id);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    rooms: rooms.map((r) => ({
                      id: r.id,
                      characterId: r.character_id,
                      lastMessage: r.last_message_preview,
                    })),
                    total: rooms.length,
                  },
                  null,
                  2,
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
                        : "Failed to list rooms",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 45: Create Room
    server.registerTool(
      "create_room",
      {
        description: "Create a new chat room. FREE tool.",
        inputSchema: {
          characterId: z.string().optional().describe("Character/agent ID"),
        },
      },
      async ({ characterId }) => {
        try {
          const { user } = getAuthContext();
          const DEFAULT_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";

          // ACCESS CONTROL: Check if user has permission to chat with this character
          if (characterId && characterId !== DEFAULT_AGENT_ID) {
            const character = await charactersService.getById(characterId);
            if (!character) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      { error: "Character not found" },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const isOwner = character.user_id === user.id;
            const isPublic = character.is_public === true;
            const claimCheck =
              await charactersService.isClaimableAffiliateCharacter(
                characterId,
              );
            const isClaimableAffiliate = claimCheck.claimable;

            if (!isPublic && !isOwner && !isClaimableAffiliate) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      { error: "Access denied - this character is private" },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }
          }

          const room = await roomsService.createRoom({
            entityId: user.id,
            agentId: characterId || DEFAULT_AGENT_ID,
            name: "New Chat",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, roomId: room.id, characterId: room.agentId },
                  null,
                  2,
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
                        : "Failed to create room",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 46: Get User Profile
    server.registerTool(
      "get_user_profile",
      {
        description: "Get current user profile. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    user: {
                      id: user.id,
                      email: user.email,
                      name: user.name,
                      organizationId: user.organization_id,
                      creditBalance: user.organization.credit_balance,
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get user profile",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 47: Update User Profile
    server.registerTool(
      "update_user_profile",
      {
        description: "Update user profile. FREE tool.",
        inputSchema: {
          name: z
            .string()
            .min(1)
            .max(100)
            .optional()
            .describe("New display name"),
        },
      },
      async ({ name }) => {
        try {
          const { user } = getAuthContext();
          if (name) {
            await usersService.update(user.id, { name });
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true }, null, 2),
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
                        : "Failed to update profile",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 48: Get Redemption Quote
    server.registerTool(
      "get_redemption_quote",
      {
        description: "Get token redemption quote. FREE tool.",
        inputSchema: {
          pointsAmount: z
            .number()
            .int()
            .min(100)
            .max(100000)
            .describe("Points to redeem"),
          network: z
            .enum(["ethereum", "base", "bnb", "solana"])
            .describe("Payout network"),
        },
      },
      async ({ pointsAmount, network }) => {
        try {
          const quote = await secureTokenRedemptionService.getRedemptionQuote(
            pointsAmount,
            network,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, quote }, null, 2),
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
                        : "Failed to get redemption quote",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 49: Create Container
    server.registerTool(
      "create_container",
      {
        description: "Create and deploy a container. Cost: $10 per deployment",
        inputSchema: {
          name: z.string().min(1).max(100).describe("Container name"),
          ecrImageUri: z.string().describe("ECR image URI"),
          projectName: z.string().min(1).max(50).describe("Project name"),
          port: z
            .number()
            .int()
            .min(1)
            .max(65535)
            .optional()
            .default(3000)
            .describe("Port"),
          cpu: z
            .number()
            .int()
            .min(256)
            .max(2048)
            .optional()
            .default(1792)
            .describe("CPU units"),
          memory: z
            .number()
            .int()
            .min(256)
            .max(2048)
            .optional()
            .default(1792)
            .describe("Memory MB"),
          environmentVars: z
            .record(z.string())
            .optional()
            .describe("Environment variables"),
        },
      },
      async ({
        name,
        ecrImageUri,
        projectName,
        port,
        cpu,
        memory,
        environmentVars,
      }) => {
        try {
          const { user } = getAuthContext();
          const DEPLOYMENT_COST = 10;

          // Reserve credits BEFORE operation
          let reservation: CreditReservation | null = null;
          try {
            reservation = await creditsService.reserve({
              organizationId: user.organization_id!,
              amount: DEPLOYMENT_COST,
              userId: user.id,
              description: `MCP container deployment: ${name}`,
            });
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              throw new Error(`Insufficient credits: need $${DEPLOYMENT_COST}`);
            }
            throw error;
          }

          let container;
          try {
            container = await containersService.create({
              organization_id: user.organization_id!,
              name,
              project_name: projectName,
              ecr_image_uri: ecrImageUri,
              port,
              cpu,
              memory,
              environment_vars: environmentVars || {},
              status: "deploying",
            });
          } catch (opError) {
            await reservation?.reconcile(0);
            throw opError;
          }

          // Confirm the charge
          await reservation?.reconcile(DEPLOYMENT_COST);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    containerId: container.id,
                    name: container.name,
                    status: container.status,
                    cost: DEPLOYMENT_COST,
                  },
                  null,
                  2,
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
                        : "Failed to create container",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 50: Delete Container
    server.registerTool(
      "delete_container",
      {
        description: "Delete a container. FREE tool.",
        inputSchema: {
          containerId: z.string().uuid().describe("Container ID to delete"),
        },
      },
      async ({ containerId }) => {
        try {
          const { user } = getAuthContext();
          const container = await getContainer(
            containerId,
            user.organization_id!,
          );
          if (!container) throw new Error("Container not found");

          await deleteContainer(containerId, user.organization_id!);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, containerId }, null, 2),
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
                        : "Failed to delete container",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 51: Get Container Metrics
    server.registerTool(
      "get_container_metrics",
      {
        description: "Get container metrics. FREE tool.",
        inputSchema: {
          containerId: z.string().uuid().describe("Container ID"),
        },
      },
      async ({ containerId }) => {
        try {
          const { user } = getAuthContext();
          const container = await getContainer(
            containerId,
            user.organization_id!,
          );
          if (!container) throw new Error("Container not found");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    metrics: {
                      containerId,
                      status: container.status,
                      cpu: container.cpu,
                      memory: container.memory,
                      createdAt: container.created_at,
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get container metrics",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 52: Get Container Quota
    server.registerTool(
      "get_container_quota",
      {
        description: "Get container quota. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();
          const containers = await containersService.listByOrganization(
            user.organization_id!,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    quota: {
                      used: containers.length,
                      limit: 5,
                      remaining: Math.max(0, 5 - containers.length),
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get container quota",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 53: Get Credit Summary
    server.registerTool(
      "get_credit_summary",
      {
        description: "Get complete credit summary. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const { user } = getAuthContext();
          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          const redeemable = await redeemableEarningsService.getBalance(
            user.organization_id!,
          );
          const agentBudgets = await agentBudgetService.getOrgBudgets(
            user.organization_id!,
          );
          const totalAgentBudgets = agentBudgets.reduce(
            (sum, b) => sum + Number(b.remaining_budget || 0),
            0,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    summary: {
                      organizationCredits: Number(org.credit_balance),
                      redeemableEarnings: redeemable,
                      totalAgentBudgets,
                      agentCount: agentBudgets.length,
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get credit summary",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 54: List Credit Transactions
    server.registerTool(
      "list_credit_transactions",
      {
        description: "List credit transactions. FREE tool.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .default(50)
            .describe("Max results"),
          hours: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Filter to last N hours"),
        },
      },
      async ({ limit, hours }) => {
        try {
          const { user } = getAuthContext();
          let transactions =
            await creditsService.listTransactionsByOrganization(
              user.organization_id!,
              limit,
            );

          if (hours) {
            const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
            transactions = transactions.filter(
              (t) => new Date(t.created_at) >= cutoffTime,
            );
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    transactions: transactions.map((t) => ({
                      id: t.id,
                      amount: Number(t.amount),
                      type: t.type,
                      description: t.description,
                      createdAt: t.created_at,
                    })),
                    total: transactions.length,
                  },
                  null,
                  2,
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
                        : "Failed to list transactions",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 55: List Credit Packs
    server.registerTool(
      "list_credit_packs",
      {
        description: "List available credit packs for purchase. FREE tool.",
        inputSchema: {},
      },
      async () => {
        try {
          const packs = await creditsService.listActiveCreditPacks();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    packs: packs.map((p) => ({
                      id: p.id,
                      name: p.name,
                      credits: Number(p.credits),
                      price: Number(p.price),
                      currency: p.currency,
                      popular: p.popular,
                    })),
                  },
                  null,
                  2,
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
                        : "Failed to list credit packs",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 56: Get Billing Usage
    server.registerTool(
      "get_billing_usage",
      {
        description: "Get billing usage statistics. FREE tool.",
        inputSchema: {
          days: z
            .number()
            .int()
            .min(1)
            .max(90)
            .optional()
            .default(30)
            .describe("Days to include"),
        },
      },
      async ({ days }) => {
        try {
          const { user } = getAuthContext();
          const usage = await usageService.listByOrganization(
            user.organization_id!,
            1000,
          );

          const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          const recentUsage = usage.filter(
            (u) => new Date(u.created_at) >= cutoffTime,
          );

          const totalCost = recentUsage.reduce(
            (sum, u) =>
              sum + Number(u.input_cost || 0) + Number(u.output_cost || 0),
            0,
          );
          const totalTokens = recentUsage.reduce(
            (sum, u) => sum + (u.input_tokens || 0) + (u.output_tokens || 0),
            0,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    usage: {
                      period: `${days} days`,
                      totalRequests: recentUsage.length,
                      totalTokens,
                      totalCost,
                      byType: {
                        chat: recentUsage.filter((u) => u.type === "chat")
                          .length,
                        image: recentUsage.filter((u) => u.type === "image")
                          .length,
                        video: recentUsage.filter((u) => u.type === "video")
                          .length,
                        embedding: recentUsage.filter(
                          (u) => u.type === "embedding",
                        ).length,
                      },
                    },
                  },
                  null,
                  2,
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
                        : "Failed to get billing usage",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // =========================================================================
    // Discovery Tools
    // Tools for discovering services on Eliza Cloud
    // =========================================================================

    // Tool: Discover Services - Search Eliza Cloud services
    server.registerTool(
      "discover_services",
      {
        description:
          "Discover services (agents, MCPs, apps) from Eliza Cloud. " +
          "Use this to find services to interact with. FREE tool.",
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe("Search query to filter by name or description"),
          types: z
            .array(z.enum(["agent", "mcp", "a2a", "app"]))
            .optional()
            .describe("Types of services to find"),
          categories: z
            .array(z.string())
            .optional()
            .describe("Filter by categories"),
          tags: z.array(z.string()).optional().describe("Filter by tags"),
          x402Only: z
            .boolean()
            .optional()
            .describe("Only return services with x402 payment support"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .default(20)
            .describe("Max results"),
        },
      },
      async ({ query, types, categories, x402Only, limit }) => {
        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
          const services: Array<{
            id: string;
            name: string;
            description: string;
            type: string;
            source: string;
            endpoint?: string;
            mcpEndpoint?: string;
            a2aEndpoint?: string;
            x402Support: boolean;
          }> = [];

          const searchTypes = types ?? ["agent", "mcp"];

          // Search agents
          if (searchTypes.includes("agent")) {
            let chars = await charactersService.listPublic();
            // Apply basic filtering
            if (query) {
              const q = query.toLowerCase();
              chars = chars.filter(
                (c) =>
                  c.name.toLowerCase().includes(q) ||
                  (typeof c.bio === "string" &&
                    c.bio.toLowerCase().includes(q)) ||
                  (Array.isArray(c.bio) &&
                    c.bio.some((b) => b.toLowerCase().includes(q))),
              );
            }
            if (categories?.length) {
              chars = chars.filter((c) =>
                categories.includes(c.category ?? ""),
              );
            }
            chars = chars.slice(0, limit ?? 20);
            for (const char of chars) {
              services.push({
                id: char.id,
                name: char.name,
                description: Array.isArray(char.bio)
                  ? char.bio.join(" ")
                  : char.bio,
                type: "agent",
                source: "local",
                a2aEndpoint: `${baseUrl}/api/agents/${char.id}/a2a`,
                mcpEndpoint: `${baseUrl}/api/agents/${char.id}/mcp`,
                x402Support: false,
              });
            }
          }

          // Search MCPs
          if (searchTypes.includes("mcp")) {
            let mcps = await userMcpsService.listPublic({
              category: categories?.[0],
              search: query,
              limit: limit,
            });
            if (x402Only) {
              mcps = mcps.filter((m) => m.x402_enabled);
            }
            for (const mcp of mcps) {
              services.push({
                id: mcp.id,
                name: mcp.name,
                description: mcp.description,
                type: "mcp",
                source: "local",
                mcpEndpoint: userMcpsService.getEndpointUrl(mcp, baseUrl),
                x402Support: mcp.x402_enabled,
              });
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    count: services.length,
                    services: services.slice(0, limit),
                  },
                  null,
                  2,
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
                        : "Discovery failed",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );
  },
  {},
  { basePath: "/api" },
);

/**
 * Handles MCP protocol requests (GET, POST, DELETE).
 * Authenticates requests and applies rate limiting before forwarding to MCP handler.
 *
 * @param req - The Next.js request object.
 * @returns MCP protocol response or authentication/rate limit error.
 */
async function handleRequest(req: NextRequest) {
  try {
    // Authenticate request
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    // SECURITY FIX: Rate limiting for MCP tool invocations
    // Limit: 100 requests per minute per organization
    const rateLimitKey = `mcp:ratelimit:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          error_description: `Rate limit exceeded. Maximum 100 MCP requests per minute allowed. Try again in ${Math.ceil((rateLimit.retryAfter || 60) / 1000)} seconds.`,
          remaining: rateLimit.remaining,
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toString(),
            "Retry-After": (rateLimit.retryAfter || 60).toString(),
          },
        },
      );
    }

    // Run MCP handler within auth context using AsyncLocalStorage
    // NextRequest extends Request, but the mcp-handler declares a global Request augmentation
    // that adds an optional `auth` property. Direct cast is safe since NextRequest is a subtype.
    return await authContextStorage.run(authResult, async () => {
      return await mcpHandler(req as Request);
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
      },
    );
  }
}

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
