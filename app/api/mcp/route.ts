import { createMcpHandler } from "mcp-handler";
import { logger } from "@/lib/utils/logger";
// IMPORTANT: Must use zod v3.x (aliased as zod3) for MCP SDK compatibility
// The MCP SDK internally uses zod v3.x, and zod v4.x has breaking internal API changes
import { z } from "zod3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AsyncLocalStorage } from "node:async_hooks";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";

// Dynamic import for DOMPurify to avoid jsdom build issues with Turbopack
let domPurifyModule: typeof import("isomorphic-dompurify") | null = null;
async function getDOMPurify() {
  if (!domPurifyModule) {
    domPurifyModule = await import("isomorphic-dompurify");
  }
  return domPurifyModule.default;
}
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
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { generationsService } from "@/lib/services/generations";
import { conversationsService } from "@/lib/services/conversations";
import { memoryService } from "@/lib/services/memory";
import { containersService } from "@/lib/services/containers";
import { contentModerationService } from "@/lib/services/content-moderation";
import { agentReputationService } from "@/lib/services/agent-reputation";
import { characterDeploymentDiscoveryService as agentDiscoveryService } from "@/lib/services/deployments/discovery";
import { agentsService } from "@/lib/services/agents/agents";
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
import {
  storageService,
  calculateUploadCost,
  formatPrice,
} from "@/lib/services/storage";
import { ipfsService } from "@/lib/services/ipfs";
import { seoService } from "@/lib/services/seo";
import { webhookService } from "@/lib/services/webhooks/webhook-service";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
  IMAGE_GENERATION_COST,
} from "@/lib/pricing";
import { stripProviderPrefix } from "@/lib/utils/model-names";
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
import {
  seoArtifactsRepository,
  seoProviderCallsRepository,
  seoRequestsRepository,
} from "@/db/repositories";
import { seoRequestTypeEnum } from "@/db/schemas/seo";

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
              "gpt-4-turbo",
              "claude-sonnet-4",
              "claude-haiku-4",
              "claude-3-5-sonnet-20241022",
              "gemini-2.0-flash",
              "gemini-1.5-pro",
              "gemini-1.5-flash",
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
        let creditsDeducted = false;
        let deductedAmount = 0;
        let userOrganizationId: string | undefined;

        try {
          const { user, apiKey } = getAuthContext();
          userOrganizationId = user.organization_id!;

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          // Estimate cost before generation (returns integer credits)
          const estimatedCost = await estimateRequestCost(model, [
            { role: "user", content: prompt },
          ]);

          // CRITICAL FIX: Deduct credits BEFORE generation to prevent race conditions
          // The deductCredits method uses database-level locking (SELECT FOR UPDATE)
          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: estimatedCost,
            description: `MCP text generation (pending): ${model}`,
            metadata: {
              user_id: user.id,
              model: model,
              prompt: prompt.substring(0, 100),
            },
          });

          if (!deductionResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: estimatedCost,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          creditsDeducted = true;
          deductedAmount = estimatedCost;

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
            credits: String(estimatedCost),
            cost: String(estimatedCost),
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

          // Handle cost difference: refund excess or deduct additional
          const costDifference = totalCost - deductedAmount;
          if (costDifference > 0) {
            // Need to deduct more
            const additionalDeduction = await creditsService.deductCredits({
              organizationId: user.organization_id!!,
              amount: costDifference,
              description: `MCP text generation (additional): ${model}`,
              metadata: {
                user_id: user.id,
                model: model,
                generation_id: generationId,
              },
            });
            if (!additionalDeduction.success) {
              // Refund the initial deduction since we can't complete
              await creditsService.refundCredits({
                organizationId: user.organization_id!!,
                amount: deductedAmount,
                description: `MCP text generation refund (insufficient balance): ${model}`,
                metadata: { user_id: user.id, generation_id: generationId },
              });
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        error: "Insufficient balance for actual cost",
                        estimated: deductedAmount,
                        actual: totalCost,
                        refunded: deductedAmount,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
          } else if (costDifference < 0) {
            // Refund excess
            await creditsService.refundCredits({
              organizationId: user.organization_id!!,
              amount: -costDifference,
              description: `MCP text generation refund (overestimate): ${model}`,
              metadata: { user_id: user.id, generation_id: generationId },
            });
          }

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
          // CRITICAL FIX: Refund credits if generation failed after deduction
          if (creditsDeducted && deductedAmount > 0 && userOrganizationId) {
            try {
              await creditsService.refundCredits({
                organizationId: userOrganizationId,
                amount: deductedAmount,
                description: `MCP text generation refund (failed): ${model}`,
                metadata: {
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  generation_id: generationId,
                },
              });
            } catch (refundError) {
              logger.error("Failed to refund credits:", refundError);
            }
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
                    refunded: creditsDeducted ? deductedAmount : 0,
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
        let creditsDeducted = false;
        let deductedAmount = 0;
        let userOrganizationId: string | undefined;

        try {
          const { user, apiKey } = getAuthContext();
          userOrganizationId = user.organization_id!;

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          // CRITICAL FIX: Deduct credits BEFORE generation to prevent race conditions
          // The deductCredits method uses database-level locking (SELECT FOR UPDATE)
          const initialDeduction = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: IMAGE_GENERATION_COST,
            description:
              "MCP image generation (pending): google/gemini-2.5-flash-image",
            metadata: { user_id: user.id, prompt: prompt.substring(0, 100) },
          });

          if (!initialDeduction.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: IMAGE_GENERATION_COST,
                      available: initialDeduction.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          creditsDeducted = true;
          deductedAmount = IMAGE_GENERATION_COST;

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
            // CRITICAL FIX: Refund credits since image generation failed
            if (creditsDeducted && deductedAmount > 0 && userOrganizationId) {
              try {
                await creditsService.refundCredits({
                  organizationId: userOrganizationId,
                  amount: deductedAmount,
                  description:
                    "MCP image generation refund (no image): google/gemini-2.5-flash-image",
                  metadata: { generation_id: generationId },
                });
              } catch (refundError) {
                logger.error("Failed to refund credits:", refundError);
              }
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
                    {
                      error: "No image was generated",
                      refunded: deductedAmount,
                    },
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
                    newBalance: initialDeduction.newBalance,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          // CRITICAL FIX: Refund credits if generation failed after deduction
          if (creditsDeducted && deductedAmount > 0 && userOrganizationId) {
            try {
              await creditsService.refundCredits({
                organizationId: userOrganizationId,
                amount: deductedAmount,
                description:
                  "MCP image generation refund (failed): google/gemini-2.5-flash-image",
                metadata: {
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  generation_id: generationId,
                },
              });
            } catch (refundError) {
              logger.error("Failed to refund credits:", refundError);
            }
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
                    refunded: creditsDeducted ? deductedAmount : 0,
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
          const DOMPurify = await getDOMPurify();
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

          // CRITICAL FIX: Deduct credits BEFORE expensive operation to prevent race conditions
          // The deductCredits method uses database-level locking (SELECT FOR UPDATE)
          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: MEMORY_SAVE_COST,
            description: `MCP memory save (pending): ${type}`,
            metadata: {
              user_id: user.id,
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
                      error: "Insufficient balance",
                      required: MEMORY_SAVE_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
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
            // CRITICAL FIX: Refund credits if save failed after deduction
            await creditsService.refundCredits({
              organizationId: user.organization_id!!,
              amount: MEMORY_SAVE_COST,
              description: `MCP memory save refund (failed): ${type}`,
              metadata: {
                user_id: user.id,
                error:
                  saveError instanceof Error
                    ? saveError.message
                    : "Unknown error",
              },
            });
            throw saveError;
          }

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

          // CRITICAL FIX: Deduct credits BEFORE retrieval to prevent race conditions
          // Estimate max cost upfront, then refund difference if actual cost is lower
          const estimatedMaxCost = MEMORY_RETRIEVAL_MAX_COST;

          const initialDeduction = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: estimatedMaxCost,
            description: "MCP memory retrieval (pending): estimated max",
            metadata: {
              user_id: user.id,
              query,
              estimated: true,
            },
          });

          if (!initialDeduction.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: estimatedMaxCost,
                      available: initialDeduction.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
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
            // CRITICAL FIX: Refund credits if retrieval failed
            await creditsService.refundCredits({
              organizationId: user.organization_id!!,
              amount: estimatedMaxCost,
              description: "MCP memory retrieval refund (failed)",
              metadata: {
                user_id: user.id,
                error:
                  retrieveError instanceof Error
                    ? retrieveError.message
                    : "Unknown error",
              },
            });
            throw retrieveError;
          }

          // Calculate actual cost and refund difference if lower than estimated
          const actualCost = Math.min(
            Math.ceil(memories.length * MEMORY_RETRIEVAL_COST_PER_ITEM),
            MEMORY_RETRIEVAL_MAX_COST,
          );

          const costDifference = estimatedMaxCost - actualCost;
          if (costDifference > 0) {
            // Refund the overestimate
            await creditsService.refundCredits({
              organizationId: user.organization_id!!,
              amount: costDifference,
              description: `MCP memory retrieval refund (overestimate): ${memories.length} memories`,
              metadata: {
                user_id: user.id,
                query,
                count: memories.length,
                estimated: estimatedMaxCost,
                actual: actualCost,
              },
            });
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < CONTEXT_RETRIEVAL_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: CONTEXT_RETRIEVAL_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const context = await memoryService.getRoomContext(
            roomId,
            user.organization_id!,
            depth,
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: CONTEXT_RETRIEVAL_COST,
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
                      required: CONTEXT_RETRIEVAL_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < CONVERSATION_CREATE_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: CONVERSATION_CREATE_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const conversation = await conversationsService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            title,
            model: actualModel,
            settings: {
              ...settings,
              systemPrompt,
            },
          });

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
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
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < CONVERSATION_SEARCH_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: CONVERSATION_SEARCH_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const conversations = await conversationsService.listByOrganization(
            user.organization_id!,
            limit,
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: CONVERSATION_SEARCH_COST,
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
                      required: CONVERSATION_SEARCH_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          const estimatedCost = Math.min(
            CONVERSATION_SUMMARY_BASE_COST + Math.floor(lastN / 10),
            CONVERSATION_SUMMARY_MAX_COST,
          );
          if (Number(org.credit_balance) < estimatedCost) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      estimated: estimatedCost,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const summary = await memoryService.summarizeConversation({
            roomId,
            organizationId: user.organization_id!!,
            lastN,
            style,
            includeMetadata,
          });

          const actualCost = Math.min(
            CONVERSATION_SUMMARY_BASE_COST +
              Math.ceil(summary.tokenCount / 1000),
            CONVERSATION_SUMMARY_MAX_COST,
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
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
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < CONTEXT_OPTIMIZATION_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: CONTEXT_OPTIMIZATION_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const optimized = await memoryService.optimizeContextWindow(
            roomId,
            user.organization_id!,
            maxTokens,
            query,
            preserveRecent,
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: CONTEXT_OPTIMIZATION_COST,
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
                      required: CONTEXT_OPTIMIZATION_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < CONVERSATION_EXPORT_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: CONVERSATION_EXPORT_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const exportData = await memoryService.exportConversation(
            conversationId,
            user.organization_id!,
            format,
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: CONVERSATION_EXPORT_COST,
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
                      required: CONVERSATION_EXPORT_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < CONVERSATION_CLONE_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: CONVERSATION_CLONE_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const cloneResult = await memoryService.cloneConversation(
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

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: CONVERSATION_CLONE_COST,
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
                      required: CONVERSATION_CLONE_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          if (Number(org.credit_balance) < MEMORY_ANALYSIS_COST) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: MEMORY_ANALYSIS_COST,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const analysis = await memoryService.analyzeMemoryPatterns(
            user.organization_id!,
            analysisType,
          );

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: MEMORY_ANALYSIS_COST,
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
                      required: MEMORY_ANALYSIS_COST,
                      available: deductionResult.newBalance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

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

          // Use org data from auth context (already fetched, avoids redundant DB call)
          const org = user.organization;

          const estimatedInputTokens = Math.ceil(message.length / 4);
          const estimatedCost = Math.max(
            AGENT_CHAT_MIN_COST,
            Math.ceil(estimatedInputTokens * AGENT_CHAT_INPUT_TOKEN_COST),
          );

          if (Number(org.credit_balance) < estimatedCost) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Insufficient balance",
                      required: estimatedCost,
                      available: org.credit_balance,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const actualRoomId =
            roomId ||
            (await agentsService.getOrCreateRoom(entityId || user.id, org.id));

          const response = await agentsService.sendMessage({
            roomId: actualRoomId,
            entityId: entityId || user.id,
            message,
            organizationId: user.organization_id!!,
            streaming,
          });

          const actualCost = Math.ceil(
            (response.usage?.inputTokens || estimatedInputTokens) *
              AGENT_CHAT_INPUT_TOKEN_COST +
              (response.usage?.outputTokens || 0) *
                AGENT_CHAT_OUTPUT_TOKEN_COST,
          );

          await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: actualCost,
            description: "MCP chat with agent",
            metadata: {
              user_id: user.id,
              room_id: actualRoomId,
              message_id: response.messageId,
              input_tokens: response.usage?.inputTokens || 0,
              output_tokens: response.usage?.outputTokens || 0,
            },
          });

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
            .default("google/veo3")
            .describe(
              "Model to use (e.g., google/veo3, kling/v2.1-master, minimax/hailuo-standard)",
            ),
        },
      },
      async ({ prompt, model }) => {
        try {
          const { user, apiKey } = getAuthContext();
          const VIDEO_COST = 5;
          const displayModel = stripProviderPrefix(model);

          if (Number(user.organization.credit_balance) < VIDEO_COST) {
            throw new Error(
              `Insufficient credits: need $${VIDEO_COST.toFixed(2)}`,
            );
          }

          const deduction = await creditsService.deductCredits({
            organizationId: user.organization_id!,
            amount: VIDEO_COST,
            description: `MCP video generation: ${displayModel}`,
            metadata: { user_id: user.id, model: displayModel },
          });
          if (!deduction.success) throw new Error("Credit deduction failed");

          const generation = await generationsService.create({
            organization_id: user.organization_id!,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "video",
            model: displayModel,
            provider: "video",
            prompt,
            status: "pending",
            credits: String(VIDEO_COST),
            cost: String(VIDEO_COST),
          });

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

          if (Number(user.organization.credit_balance) < cost) {
            throw new Error(`Insufficient credits: need $${cost.toFixed(6)}`);
          }

          const deduction = await creditsService.deductCredits({
            organizationId: user.organization_id!,
            amount: cost,
            description: `MCP embeddings: ${model}`,
            metadata: { user_id: user.id, tokenCount: totalTokens },
          });
          if (!deduction.success) throw new Error("Credit deduction failed");

          const provider = getProvider();
          const response = await provider.createEmbeddings({
            model,
            input: inputs,
          });
          const data = await response.json();

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

          const deduction = await creditsService.deductCredits({
            organizationId: user.organization_id!,
            amount: TTS_COST,
            description: "MCP text-to-speech",
            metadata: { user_id: user.id, chars: text.length },
          });
          if (!deduction.success) throw new Error("Insufficient credits");

          const elevenLabs = await getElevenLabsService();
          const audioBuffer = await elevenLabs.textToSpeech(
            text,
            voiceId || "21m00Tcm4TlvDq8ikWAM",
          );
          const { uploadFromBuffer } = await import("@/lib/blob");
          const audioUrl = await uploadFromBuffer(
            audioBuffer,
            `tts-${Date.now()}.mp3`,
            "audio/mpeg",
          );

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

          const deduction = await creditsService.deductCredits({
            organizationId: user.organization_id!,
            amount: COST,
            description: "MCP prompt generation",
            metadata: { user_id: user.id },
          });
          if (!deduction.success) throw new Error("Insufficient credits");

          const { openai } = await import("@ai-sdk/openai");
          const { generateText } = await import("ai");

          const { text } = await generateText({
            model: openai("gpt-4o-mini"),
            prompt: `Generate 4 short, practical AI agent concepts (max 8 words each). Return ONLY a JSON array of strings.`,
          });

          const prompts = JSON.parse(text);
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

          const deduction = await creditsService.deductCredits({
            organizationId: user.organization_id!,
            amount: COST,
            description: "MCP knowledge upload",
            metadata: { user_id: user.id, title },
          });
          if (!deduction.success) throw new Error("Insufficient credits");

          const result = await memoryService.saveMemory({
            organizationId: user.organization_id!,
            content,
            roomId: characterId,
            metadata: { title, type: "knowledge" },
          });

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

          if (Number(user.organization.credit_balance) < DEPLOYMENT_COST) {
            throw new Error(`Insufficient credits: need $${DEPLOYMENT_COST}`);
          }

          const deduction = await creditsService.deductCredits({
            organizationId: user.organization_id!,
            amount: DEPLOYMENT_COST,
            description: `MCP container deployment: ${name}`,
            metadata: { user_id: user.id },
          });
          if (!deduction.success) throw new Error("Credit deduction failed");

          const container = await containersService.create({
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

    // Tool 56: Get x402 Topup Payment Requirements
    // NOTE: This tool does NOT require authentication - it's designed for permissionless access
    // The MCP handler will still try to authenticate, but this tool works even if auth fails
    server.registerTool(
      "get_x402_topup_requirements",
      {
        description:
          "Get x402 payment requirements for permissionless credit topup. Returns payment details needed to top up credits via x402. FREE tool - works without authentication.",
        inputSchema: {},
      },
      async () => {
        try {
          const {
            X402_ENABLED,
            X402_RECIPIENT_ADDRESS,
            getDefaultNetwork,
            USDC_ADDRESSES,
            TOPUP_PRICE,
            CREDITS_PER_DOLLAR,
            isX402Configured,
          } = await import("@/lib/config/x402");

          if (!isX402Configured()) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "x402 payments not configured",
                      message: "x402 payments are not enabled on this server",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const network = getDefaultNetwork();
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    x402: {
                      enabled: X402_ENABLED,
                      topupEndpoint: `${baseUrl}/api/v1/credits/topup`,
                      network,
                      asset: USDC_ADDRESSES[network],
                      payTo: X402_RECIPIENT_ADDRESS,
                      price: TOPUP_PRICE,
                      creditsPerDollar: CREDITS_PER_DOLLAR,
                      creditsPerTopup: Math.floor(
                        parseFloat(TOPUP_PRICE.replace("$", "")) *
                          CREDITS_PER_DOLLAR,
                      ),
                      instructions: [
                        "1. Sign payment authorization with your wallet using x402 protocol",
                        "2. Include X-PAYMENT header in POST request to topupEndpoint",
                        "3. Credits will be added to your organization (created from wallet address if needed)",
                        "4. Get API key from the organization to use for subsequent MCP/A2A calls",
                        "5. Use the credits to call MCP tools or A2A skills",
                      ],
                      docs: "https://x402.org",
                      note: "After topping up, you can get an API key from your organization to authenticate future requests",
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
                        : "Failed to get x402 topup requirements",
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
    // ERC-8004 Discovery Tools
    // Tools for discovering and searching services on the decentralized registry
    // =========================================================================

    // Tool: Discover Services - Search the discovery API
    server.registerTool(
      "discover_services",
      {
        description:
          "Discover services (agents, MCPs, apps) from both Eliza Cloud and the ERC-8004 registry. " +
          "Use this to find external services to interact with. FREE tool.",
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe("Search query to filter by name or description"),
          types: z
            .array(z.enum(["agent", "mcp", "a2a", "app"]))
            .optional()
            .describe("Types of services to find"),
          sources: z
            .array(z.enum(["local", "erc8004"]))
            .optional()
            .describe(
              "Sources to search (local = Eliza Cloud, erc8004 = decentralized)",
            ),
          categories: z
            .array(z.string())
            .optional()
            .describe("Filter by categories"),
          tags: z.array(z.string()).optional().describe("Filter by tags"),
          mcpTools: z
            .array(z.string())
            .optional()
            .describe("Find services with specific MCP tools"),
          a2aSkills: z
            .array(z.string())
            .optional()
            .describe("Find services with specific A2A skills"),
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
      async ({
        query,
        types,
        sources,
        categories,
        tags,
        mcpTools,
        a2aSkills,
        x402Only,
        limit,
      }) => {
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

          const searchSources = sources ?? ["local", "erc8004"];
          const searchTypes = types ?? ["agent", "mcp"];

          // Search local services
          if (searchSources.includes("local")) {
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

            if (searchTypes.includes("mcp")) {
              const mcps = await userMcpsService.listPublic({
                category: categories?.[0],
                search: query,
                limit: limit,
              });
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
          }

          // Search ERC-8004 registry
          if (searchSources.includes("erc8004")) {
            const network = getDefaultNetwork();
            const chainId = CHAIN_IDS[network];

            const agents = await agent0Service.searchAgentsCached({
              name: query,
              mcpTools: mcpTools,
              a2aSkills: a2aSkills,
              x402Support: x402Only,
              active: true,
            });

            for (const agent of agents) {
              const discovered = agent0ToDiscoveredService(
                agent,
                network,
                chainId,
              );
              if (
                !searchTypes.length ||
                searchTypes.includes(discovered.type)
              ) {
                services.push({
                  id: discovered.id,
                  name: discovered.name,
                  description: discovered.description,
                  type: discovered.type,
                  source: "erc8004",
                  mcpEndpoint: discovered.mcpEndpoint,
                  a2aEndpoint: discovered.a2aEndpoint,
                  x402Support: discovered.x402Support,
                });
              }
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

    // Tool: Get Service Details - Get detailed info about a discovered service
    server.registerTool(
      "get_service_details",
      {
        description:
          "Get detailed information about a specific service from the ERC-8004 registry. " +
          "Use agentId in format 'chainId:tokenId'. FREE tool.",
        inputSchema: {
          agentId: z
            .string()
            .describe(
              "Agent ID in format 'chainId:tokenId' (e.g., '84532:123')",
            ),
        },
      },
      async ({ agentId }) => {
        try {
          const agent = await agent0Service.getAgentCached(agentId);
          if (!agent) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Agent not found", agentId },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const network = getDefaultNetwork();
          const chainId = CHAIN_IDS[network];
          const service = agent0ToDiscoveredService(agent, network, chainId);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    service,
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
                        : "Failed to get service details",
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

    // Tool: Find MCP Tools - Search for services that provide specific MCP tools
    server.registerTool(
      "find_mcp_tools",
      {
        description:
          "Find services that provide specific MCP tools. " +
          "Useful for discovering external capabilities. FREE tool.",
        inputSchema: {
          tools: z
            .array(z.string())
            .describe("List of MCP tool names to search for"),
          x402Only: z
            .boolean()
            .optional()
            .describe("Only return services with x402 payment"),
        },
      },
      async ({ tools, x402Only }) => {
        try {
          const network = getDefaultNetwork();
          const chainId = CHAIN_IDS[network];

          const agents = await agent0Service.findAgentsWithToolsCached(tools);
          const filtered = x402Only
            ? agents.filter((a) => a.x402Support)
            : agents;

          const results = filtered.map((agent) => ({
            agentId: agent.agentId,
            name: agent.name,
            description: agent.description,
            mcpEndpoint: agent.mcpEndpoint,
            mcpTools: agent.mcpTools,
            x402Support: agent.x402Support,
            network,
            chainId,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    searchedTools: tools,
                    count: results.length,
                    services: results,
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
                        : "Failed to find MCP tools",
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

    // Tool: Find A2A Skills - Search for agents with specific skills
    server.registerTool(
      "find_a2a_skills",
      {
        description:
          "Find agents that have specific A2A skills for agent-to-agent communication. " +
          "Useful for discovering agents to collaborate with. FREE tool.",
        inputSchema: {
          skills: z
            .array(z.string())
            .describe("List of A2A skill names to search for"),
          x402Only: z
            .boolean()
            .optional()
            .describe("Only return services with x402 payment"),
        },
      },
      async ({ skills, x402Only }) => {
        try {
          const network = getDefaultNetwork();
          const chainId = CHAIN_IDS[network];

          const agents = await agent0Service.findAgentsWithSkillsCached(skills);
          const filtered = x402Only
            ? agents.filter((a) => a.x402Support)
            : agents;

          const results = filtered.map((agent) => ({
            agentId: agent.agentId,
            name: agent.name,
            description: agent.description,
            a2aEndpoint: agent.a2aEndpoint,
            a2aSkills: agent.a2aSkills,
            x402Support: agent.x402Support,
            network,
            chainId,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    searchedSkills: skills,
                    count: results.length,
                    agents: results,
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
                        : "Failed to find A2A skills",
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

    // ============ STORAGE TOOLS ============

    // Tool: Storage Upload
    server.registerTool(
      "storage_upload",
      {
        description:
          "Upload file to decentralized storage (Vercel Blob + optional IPFS pinning)",
        inputSchema: {
          content: z.string().describe("Base64 encoded file content"),
          filename: z.string().describe("Filename for the upload"),
          contentType: z
            .string()
            .optional()
            .describe("MIME type (default: application/octet-stream)"),
          pinToIPFS: z
            .boolean()
            .optional()
            .default(true)
            .describe("Also pin to IPFS"),
        },
      },
      async ({
        content,
        filename,
        contentType = "application/octet-stream",
        pinToIPFS = true,
      }) => {
        const { user } = getAuthContext();

        const buffer = Buffer.from(content, "base64");
        const cost = calculateUploadCost(buffer.length);

        // Check balance
        const org = await organizationsService.getById(user.organization_id);
        if (!org || Number(org.credit_balance) < cost) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: `Insufficient credits: need ${formatPrice(cost)}` },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Deduct credits
        await creditsService.deductCredits({
          organizationId: user.organization_id,
          amount: cost,
          description: `MCP storage upload: ${filename}`,
          metadata: { user_id: user.id, filename, size: buffer.length },
        });

        const result = await storageService.upload(buffer, {
          filename,
          contentType,
          ownerAddress: user.id,
          pinToIPFS,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: result.id,
                  url: result.url,
                  cid: result.cid,
                  ipfsGatewayUrl: result.ipfsGatewayUrl,
                  size: result.size,
                  contentType: result.contentType,
                  cost: formatPrice(cost),
                  pinned: result.pinned,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Storage List
    server.registerTool(
      "storage_list",
      {
        description: "List your stored files",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .default(50)
            .describe("Max files to return"),
          cursor: z.string().optional().describe("Pagination cursor"),
        },
      },
      async ({ limit = 50, cursor }) => {
        const { user } = getAuthContext();

        const result = await storageService.list({
          ownerAddress: user.id,
          limit,
          cursor,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  items: result.items.map((item) => ({
                    id: item.id,
                    url: item.url,
                    pathname: item.pathname,
                    contentType: item.contentType,
                    size: item.size,
                    uploadedAt: item.uploadedAt.toISOString(),
                  })),
                  count: result.items.length,
                  hasMore: result.hasMore,
                  cursor: result.cursor,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Storage Stats
    server.registerTool(
      "storage_stats",
      {
        description: "Get storage statistics and pricing",
        inputSchema: {},
      },
      async () => {
        const { user } = getAuthContext();

        const stats = await storageService.getStats(user.id);
        const pricing = storageService.getPricing();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  totalFiles: stats.totalFiles,
                  totalSizeBytes: stats.totalSizeBytes,
                  totalSizeGB: stats.totalSizeGB,
                  pricing,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Storage Calculate Cost
    server.registerTool(
      "storage_calculate_cost",
      {
        description: "Calculate storage cost for a given file size",
        inputSchema: {
          sizeBytes: z.number().int().positive().describe("File size in bytes"),
        },
      },
      async ({ sizeBytes }) => {
        const cost = calculateUploadCost(sizeBytes);
        const pricing = storageService.getPricing();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  sizeBytes,
                  sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
                  cost,
                  costFormatted: formatPrice(cost),
                  pricing,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: IPFS Pin
    server.registerTool(
      "ipfs_pin",
      {
        description: "Pin an existing CID to IPFS",
        inputSchema: {
          cid: z.string().describe("IPFS Content ID to pin"),
          name: z.string().optional().describe("Name for the pin"),
        },
      },
      async ({ cid, name }) => {
        const health = await ipfsService.health().catch(() => null);
        if (!health) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "IPFS service unavailable" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const result = await ipfsService.pin({ cid, name: name || cid });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: result.id,
                  cid: result.cid,
                  status: result.status,
                  gatewayUrl: ipfsService.getGatewayUrl(result.cid),
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: IPFS List Pins
    server.registerTool(
      "ipfs_list_pins",
      {
        description: "List pinned content on IPFS",
        inputSchema: {
          status: z
            .string()
            .optional()
            .describe("Filter by status (pinning, pinned, failed)"),
          limit: z.number().int().min(1).max(100).optional().default(50),
        },
      },
      async ({ status, limit = 50 }) => {
        const health = await ipfsService.health().catch(() => null);
        if (!health) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "IPFS service unavailable" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const result = await ipfsService.listPins({ status, limit });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: result.count,
                  pins: result.results.map((pin) => ({
                    ...pin,
                    gatewayUrl: ipfsService.getGatewayUrl(pin.cid),
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // ============ N8N WORKFLOW TOOLS ============

    // Tool: Create N8N Workflow
    server.registerTool(
      "n8n_create_workflow",
      {
        description:
          "Create a new n8n workflow. Requires workflow name and workflow data (nodes, connections, etc.)",
        inputSchema: {
          name: z.string().describe("Workflow name"),
          description: z.string().optional().describe("Workflow description"),
          workflowData: z
            .record(z.unknown())
            .describe("n8n workflow JSON (nodes, connections, settings)"),
          tags: z.array(z.string()).optional().describe("Workflow tags"),
        },
      },
      async ({ name, description, workflowData, tags }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const validationResult =
          await n8nWorkflowsService.validateWorkflow(workflowData);
        if (!validationResult.valid) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Invalid workflow structure",
                    errors: validationResult.errors,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const workflow = await n8nWorkflowsService.createWorkflow({
          organizationId: user.organization_id,
          userId: user.id,
          name,
          description,
          workflowData,
          tags,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    status: workflow.status,
                    version: workflow.version,
                    createdAt: workflow.created_at,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: List N8N Workflows
    server.registerTool(
      "n8n_list_workflows",
      {
        description:
          "List n8n workflows. Can filter by status (draft, active, archived).",
        inputSchema: {
          status: z
            .enum(["draft", "active", "archived"])
            .optional()
            .describe("Filter by workflow status"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
      },
      async ({ status, limit = 20 }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const workflows = await n8nWorkflowsService.listWorkflows(
          user.organization_id,
          {
            status,
            limit,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflows: workflows.map((w) => ({
                    id: w.id,
                    name: w.name,
                    description: w.description,
                    status: w.status,
                    version: w.version,
                    tags: w.tags,
                    createdAt: w.created_at.toISOString(),
                    updatedAt: w.updated_at.toISOString(),
                  })),
                  count: workflows.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Generate N8N Workflow
    server.registerTool(
      "n8n_generate_workflow",
      {
        description:
          "Generate an n8n workflow using AI from a natural language prompt. Uses Claude Opus 4.5.",
        inputSchema: {
          prompt: z
            .string()
            .describe("Natural language description of the desired workflow"),
          context: z
            .object({
              availableNodes: z
                .array(z.unknown())
                .optional()
                .describe("Available n8n nodes for context"),
              existingWorkflows: z
                .array(z.unknown())
                .optional()
                .describe("Existing workflows for reference"),
              variables: z
                .record(z.string())
                .optional()
                .describe("Available variables"),
            })
            .optional()
            .describe("Additional context for generation"),
          autoSave: z
            .boolean()
            .optional()
            .default(false)
            .describe("Automatically save the generated workflow"),
          workflowName: z
            .string()
            .optional()
            .describe("Name for the workflow (required if autoSave is true)"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Tags for the workflow"),
        },
      },
      async ({ prompt, context, autoSave, workflowName, tags }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");
        const { endpointDiscoveryService } =
          await import("@/lib/services/endpoint-discovery");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          // Discover available endpoints
          const availableEndpoints =
            await endpointDiscoveryService.discoverAllEndpoints();
          const endpointNodes = availableEndpoints.map((e) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            type: e.type,
            category: e.category,
            endpoint: e.endpoint,
            method: e.method,
          }));

          // Get user's existing workflows for context
          const existingWorkflows = await n8nWorkflowsService.listWorkflows(
            user.organization_id,
            { limit: 10 },
          );
          const workflowContext = existingWorkflows.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            tags: w.tags,
          }));

          // Get global variables
          const globalVariables = await n8nWorkflowsService.getGlobalVariables(
            user.organization_id,
          );
          const variablesContext = Object.fromEntries(
            globalVariables.map((v) => [v.name, v.is_secret ? "***" : v.value]),
          );

          // Call the generation endpoint via HTTP (using API key for internal calls)
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const apiKey = process.env.ELIZA_CLOUD_API_KEY;

          if (!apiKey) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Cloud API key not configured" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const response = await fetch(
            `${baseUrl}/api/v1/n8n/generate-workflow`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                prompt,
                context: {
                  ...context,
                  availableNodes: endpointNodes,
                  existingWorkflows: workflowContext,
                  variables: variablesContext,
                },
                autoSave,
                workflowName,
                tags,
              }),
            },
          );

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const result = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    workflow: result.workflow,
                    savedWorkflow: result.savedWorkflow,
                    validation: result.validation,
                    metadata: result.metadata,
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
                        : "Failed to generate workflow",
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

    // Tool: Get N8N Workflow
    server.registerTool(
      "n8n_get_workflow",
      {
        description: "Get details of a specific n8n workflow by ID",
        inputSchema: {
          workflowId: z.string().describe("Workflow ID"),
        },
      },
      async ({ workflowId }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");
        const { appsService } = await import("@/lib/services/apps");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const apps = await appsService.listByOrganization(user.organization_id);
        if (apps.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "No app found for this organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
        if (!workflow || workflow.app_id !== apps[0].id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Workflow not found" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    description: workflow.description,
                    workflowData: workflow.workflow_data,
                    status: workflow.status,
                    version: workflow.version,
                    tags: workflow.tags,
                    n8nWorkflowId: workflow.n8n_workflow_id,
                    isActiveInN8n: workflow.is_active_in_n8n,
                    createdAt: workflow.created_at.toISOString(),
                    updatedAt: workflow.updated_at.toISOString(),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Update N8N Workflow
    server.registerTool(
      "n8n_update_workflow",
      {
        description: "Update an existing n8n workflow",
        inputSchema: {
          workflowId: z.string().describe("Workflow ID"),
          name: z.string().optional().describe("New workflow name"),
          description: z
            .string()
            .optional()
            .describe("New workflow description"),
          workflowData: z
            .record(z.unknown())
            .optional()
            .describe("Updated workflow data"),
          status: z
            .enum(["draft", "active", "archived"])
            .optional()
            .describe("New workflow status"),
          tags: z.array(z.string()).optional().describe("New workflow tags"),
        },
      },
      async ({ workflowId, name, description, workflowData, status, tags }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");
        const { appsService } = await import("@/lib/services/apps");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const apps = await appsService.listByOrganization(user.organization_id);
        if (apps.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "No app found for this organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        if (workflowData) {
          const validationResult =
            await n8nWorkflowsService.validateWorkflow(workflowData);
          if (!validationResult.valid) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: "Invalid workflow structure",
                      errors: validationResult.errors,
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

        const workflow = await n8nWorkflowsService.updateWorkflow(workflowId, {
          name,
          description,
          workflowData,
          status,
          tags,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    status: workflow.status,
                    version: workflow.version,
                    updatedAt: workflow.updated_at.toISOString(),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: List N8N Workflow Versions
    server.registerTool(
      "n8n_list_workflow_versions",
      {
        description: "List version history for a workflow",
        inputSchema: {
          workflowId: z.string().describe("Workflow ID"),
          limit: z.number().int().min(1).max(100).optional().default(50),
        },
      },
      async ({ workflowId, limit = 50 }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        const versions = await n8nWorkflowsService.getWorkflowVersions(
          workflowId,
          limit,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  versions: versions.map((v) => ({
                    id: v.id,
                    version: v.version,
                    changeDescription: v.change_description,
                    createdAt: v.created_at.toISOString(),
                    createdBy: v.created_by,
                  })),
                  count: versions.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Revert N8N Workflow
    server.registerTool(
      "n8n_revert_workflow",
      {
        description: "Revert a workflow to a specific version",
        inputSchema: {
          workflowId: z.string().describe("Workflow ID"),
          version: z
            .number()
            .int()
            .positive()
            .describe("Version number to revert to"),
        },
      },
      async ({ workflowId, version }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const workflow = await n8nWorkflowsService.revertWorkflowToVersion(
          workflowId,
          version,
          user.id,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflow: {
                    id: workflow.id,
                    version: workflow.version,
                    updatedAt: workflow.updated_at.toISOString(),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Test N8N Workflow
    server.registerTool(
      "n8n_test_workflow",
      {
        description: "Test execution of a workflow",
        inputSchema: {
          workflowId: z.string().describe("Workflow ID"),
          inputData: z
            .record(z.unknown())
            .optional()
            .describe("Input data for the workflow test"),
        },
      },
      async ({ workflowId, inputData }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "User has no organization" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const execution = await n8nWorkflowsService.testWorkflow({
          workflowId,
          inputData,
          userId: user.id,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  execution: {
                    id: execution.id,
                    status: execution.status,
                    outputData: execution.output_data,
                    errorMessage: execution.error_message,
                    durationMs: execution.duration_ms,
                    startedAt: execution.started_at.toISOString(),
                    finishedAt: execution.finished_at?.toISOString(),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // ============ N8N NODE DISCOVERY & GENERATION TOOLS ============

    // Tool: Discover N8N Nodes
    server.registerTool(
      "n8n_discover_nodes",
      {
        description:
          "Discover all available A2A, MCP, and REST endpoints that can be used as n8n workflow nodes. Search across the entire marketplace network.",
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe(
              "Search query to filter endpoints by name, description, or category",
            ),
          types: z
            .array(z.enum(["a2a", "mcp", "rest"]))
            .optional()
            .describe("Filter by endpoint type"),
          categories: z
            .array(z.string())
            .optional()
            .describe(
              "Filter by category (e.g., 'ai', 'storage', 'infrastructure')",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .default(100)
            .describe("Maximum number of results"),
        },
      },
      async ({ query, types, categories, limit }) => {
        const { endpointDiscoveryService } =
          await import("@/lib/services/endpoint-discovery");

        const results = await endpointDiscoveryService.searchEndpoints(
          query || "",
          {
            types,
            categories,
            limit,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  nodes: results.nodes,
                  total: results.total,
                  categories: results.categories,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Generate N8N Node from Endpoint
    server.registerTool(
      "n8n_generate_node",
      {
        description:
          "Generate an n8n workflow node from a discovered endpoint. Creates an HTTP Request node configured for the endpoint.",
        inputSchema: {
          endpointId: z.string().describe("Endpoint ID from discover_nodes"),
          position: z
            .tuple([z.number(), z.number()])
            .optional()
            .describe("Node position [x, y]"),
          parameters: z
            .record(z.unknown())
            .optional()
            .describe("Additional parameters for the node"),
        },
      },
      async ({ endpointId, position, parameters }) => {
        const { n8nNodeGeneratorService } =
          await import("@/lib/services/n8n-node-generator");

        const node = await n8nNodeGeneratorService.generateNode({
          endpointId,
          position,
          parameters,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  node,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Generate N8N Workflow from Endpoints
    server.registerTool(
      "n8n_generate_workflow_from_endpoints",
      {
        description:
          "Generate a complete n8n workflow by connecting multiple endpoints as nodes.",
        inputSchema: {
          endpointIds: z
            .array(z.string())
            .min(1)
            .describe("Array of endpoint IDs to include in the workflow"),
          workflowName: z
            .string()
            .min(1)
            .describe("Name for the generated workflow"),
        },
      },
      async ({ endpointIds, workflowName }) => {
        const { n8nNodeGeneratorService } =
          await import("@/lib/services/n8n-node-generator");

        const workflow =
          await n8nNodeGeneratorService.generateWorkflowFromEndpoints(
            endpointIds,
            workflowName,
          );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  workflow,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Execute N8N Workflow via Trigger
    server.registerTool(
      "n8n_execute_trigger",
      {
        description:
          "Execute an n8n workflow via its A2A or MCP trigger. Use this to run workflows that have been configured with triggers.",
        inputSchema: {
          triggerKey: z.string().optional().describe("Trigger key to execute"),
          workflowId: z
            .string()
            .optional()
            .describe("Workflow ID (finds active A2A/MCP trigger)"),
          inputData: z
            .record(z.unknown())
            .optional()
            .describe("Input data to pass to the workflow"),
        },
      },
      async ({ triggerKey, workflowId, inputData }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No organization" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        if (!triggerKey && !workflowId) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Either triggerKey or workflowId is required" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        let trigger;
        if (triggerKey) {
          trigger = await n8nWorkflowsService.findTriggerByKey(triggerKey);
        } else if (workflowId) {
          const triggers = await n8nWorkflowsService.listTriggers(workflowId);
          trigger = triggers.find(
            (t) =>
              t.is_active &&
              (t.trigger_type === "a2a" || t.trigger_type === "mcp"),
          );
        }

        if (!trigger) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "No active A2A/MCP trigger found" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        if (trigger.organization_id !== user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Unauthorized" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        if (trigger.trigger_type !== "a2a" && trigger.trigger_type !== "mcp") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Use webhook endpoint for webhook triggers" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const execution = await n8nWorkflowsService.executeWorkflowTrigger(
          trigger.id,
          inputData,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  executionId: execution.id,
                  status: execution.status,
                  workflowId: trigger.workflow_id,
                  triggerId: trigger.id,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: List N8N Workflow Triggers
    server.registerTool(
      "n8n_list_triggers",
      {
        description:
          "List n8n workflow triggers for your organization. Can filter by workflow ID or trigger type.",
        inputSchema: {
          workflowId: z.string().optional().describe("Filter by workflow ID"),
          triggerType: z
            .enum(["cron", "webhook", "a2a", "mcp"])
            .optional()
            .describe("Filter by trigger type"),
        },
      },
      async ({ workflowId, triggerType }) => {
        const { n8nWorkflowTriggersRepository } =
          await import("@/db/repositories/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No organization" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        let triggers;
        if (workflowId) {
          triggers =
            await n8nWorkflowTriggersRepository.findByWorkflow(workflowId);
        } else {
          triggers = await n8nWorkflowTriggersRepository.findByOrganization(
            user.organization_id,
          );
        }

        if (triggerType) {
          triggers = triggers.filter((t) => t.trigger_type === triggerType);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  triggers: triggers.map((t) => ({
                    id: t.id,
                    workflowId: t.workflow_id,
                    triggerType: t.trigger_type,
                    triggerKey:
                      t.trigger_type === "webhook"
                        ? t.trigger_key.slice(0, 8) + "..."
                        : t.trigger_key,
                    isActive: t.is_active,
                    executionCount: t.execution_count,
                    lastExecutedAt: t.last_executed_at?.toISOString() || null,
                  })),
                  total: triggers.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Create N8N Workflow Trigger
    server.registerTool(
      "n8n_create_trigger",
      {
        description:
          "Create a new trigger for an n8n workflow. Supports cron, webhook, A2A, and MCP trigger types.",
        inputSchema: {
          workflowId: z.string().describe("Workflow ID to create trigger for"),
          triggerType: z
            .enum(["cron", "webhook", "a2a", "mcp"])
            .describe("Type of trigger"),
          triggerKey: z
            .string()
            .optional()
            .describe("Custom trigger key (auto-generated if not provided)"),
          config: z
            .object({
              cronExpression: z
                .string()
                .optional()
                .describe("Cron expression (required for cron triggers)"),
              maxExecutionsPerDay: z
                .number()
                .optional()
                .describe("Maximum executions per day"),
              estimatedCostPerExecution: z
                .number()
                .optional()
                .describe("Estimated cost in credits per execution"),
            })
            .optional()
            .describe("Trigger configuration"),
        },
      },
      async ({ workflowId, triggerType, triggerKey, config }) => {
        const { n8nWorkflowsService } =
          await import("@/lib/services/n8n-workflows");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No organization" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
        if (!workflow || workflow.organization_id !== user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Workflow not found" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        if (triggerType === "cron" && !config?.cronExpression) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "cronExpression is required for cron triggers" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const trigger = await n8nWorkflowsService.createTrigger(
          workflowId,
          triggerType,
          triggerKey,
          config || {},
        );

        const result: Record<string, unknown> = {
          success: true,
          triggerId: trigger.id,
          triggerType: trigger.trigger_type,
          triggerKey: trigger.trigger_key,
          isActive: trigger.is_active,
        };

        if (triggerType === "webhook") {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
          result.webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${trigger.trigger_key}`;
          result.webhookSecret = trigger.config.webhookSecret;
          result.note = "Save webhookSecret now - it will not be shown again";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    // ============ APPLICATION TRIGGERS (Apps, Agents, MCPs) ============

    // Tool: Create Application Trigger
    server.registerTool(
      "create_app_trigger",
      {
        description:
          "Create a trigger for an app (fragment project), agent (container), or MCP. Supports cron, webhook, and event triggers.",
        inputSchema: {
          targetType: z
            .enum(["fragment_project", "container", "user_mcp"])
            .describe(
              "Type of target: fragment_project (app), container (agent), or user_mcp",
            ),
          targetId: z
            .string()
            .uuid()
            .describe("ID of the target app, agent, or MCP"),
          triggerType: z
            .enum(["cron", "webhook", "event"])
            .describe("Type of trigger"),
          name: z.string().describe("Human-readable name for the trigger"),
          description: z
            .string()
            .optional()
            .describe("Description of what this trigger does"),
          config: z
            .object({
              cronExpression: z
                .string()
                .optional()
                .describe("Cron expression (required for cron triggers)"),
              eventTypes: z
                .array(z.string())
                .optional()
                .describe(
                  "Event types to listen for (required for event triggers)",
                ),
              maxExecutionsPerDay: z
                .number()
                .optional()
                .describe("Maximum executions per day"),
              timeout: z.number().optional().describe("Timeout in seconds"),
            })
            .optional()
            .describe("Trigger configuration"),
          actionType: z
            .enum(["call_endpoint", "restart", "execute_workflow", "notify"])
            .optional()
            .describe("Action to perform"),
          actionConfig: z
            .object({
              endpoint: z.string().optional().describe("Endpoint to call"),
              method: z
                .enum(["GET", "POST", "PUT", "DELETE"])
                .optional()
                .describe("HTTP method"),
              workflowId: z
                .string()
                .uuid()
                .optional()
                .describe("N8N workflow ID for execute_workflow action"),
            })
            .optional()
            .describe("Action configuration"),
        },
      },
      async ({
        targetType,
        targetId,
        triggerType,
        name,
        description,
        config,
        actionType,
        actionConfig,
      }) => {
        const { applicationTriggersService } =
          await import("@/lib/services/application-triggers");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No organization" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        if (triggerType === "cron" && !config?.cronExpression) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "cronExpression is required for cron triggers" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        if (
          triggerType === "event" &&
          (!config?.eventTypes || config.eventTypes.length === 0)
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "eventTypes is required for event triggers" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const trigger = await applicationTriggersService.createTrigger({
          organizationId: user.organization_id,
          createdBy: user.id,
          targetType,
          targetId,
          triggerType,
          name,
          description,
          config,
          actionType,
          actionConfig,
        });

        const result: Record<string, unknown> = {
          success: true,
          triggerId: trigger.id,
          triggerType: trigger.trigger_type,
          triggerKey: trigger.trigger_key,
          isActive: trigger.is_active,
        };

        if (triggerType === "webhook") {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
          result.webhookUrl = `${baseUrl}/api/v1/triggers/webhooks/${trigger.trigger_key}`;
          result.webhookSecret = trigger.config.webhookSecret;
          result.note = "Save webhookSecret now - it will not be shown again";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    // Tool: List Application Triggers
    server.registerTool(
      "list_app_triggers",
      {
        description:
          "List triggers for apps, agents, or MCPs in your organization.",
        inputSchema: {
          targetType: z
            .enum(["fragment_project", "container", "user_mcp"])
            .optional()
            .describe("Filter by target type"),
          targetId: z
            .string()
            .uuid()
            .optional()
            .describe("Filter by specific target ID"),
          triggerType: z
            .enum(["cron", "webhook", "event"])
            .optional()
            .describe("Filter by trigger type"),
        },
      },
      async ({ targetType, targetId, triggerType }) => {
        const { applicationTriggersService } =
          await import("@/lib/services/application-triggers");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No organization" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        let triggers;
        if (targetId && targetType) {
          triggers = await applicationTriggersService.listTriggersByTarget(
            targetType,
            targetId,
          );
          triggers = triggers.filter(
            (t) => t.organization_id === user.organization_id,
          );
        } else {
          triggers =
            await applicationTriggersService.listTriggersByOrganization(
              user.organization_id,
              { targetType, triggerType },
            );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  triggers: triggers.map((t) => ({
                    id: t.id,
                    name: t.name,
                    targetType: t.target_type,
                    targetId: t.target_id,
                    triggerType: t.trigger_type,
                    triggerKey:
                      t.trigger_type === "webhook"
                        ? t.trigger_key.slice(0, 8) + "..."
                        : t.trigger_key,
                    isActive: t.is_active,
                    executionCount: t.execution_count,
                    lastExecutedAt: t.last_executed_at?.toISOString() || null,
                  })),
                  total: triggers.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Execute Application Trigger
    server.registerTool(
      "execute_app_trigger",
      {
        description: "Manually execute a trigger for an app, agent, or MCP.",
        inputSchema: {
          triggerId: z.string().uuid().describe("ID of the trigger to execute"),
          inputData: z
            .record(z.unknown())
            .optional()
            .describe("Input data to pass to the trigger"),
        },
      },
      async ({ triggerId, inputData }) => {
        const { applicationTriggersService } =
          await import("@/lib/services/application-triggers");

        if (!user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No organization" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const trigger = await applicationTriggersService.getTrigger(triggerId);
        if (!trigger) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Trigger not found" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        if (trigger.organization_id !== user.organization_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Unauthorized" }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const result = await applicationTriggersService.executeTrigger(
          triggerId,
          inputData,
          "manual",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.status === "success",
                  executionId: result.executionId,
                  status: result.status,
                  ...(result.output && { output: result.output }),
                  ...(result.error && { error: result.error }),
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: Generate Fragment
    server.registerTool(
      "fragments_generate",
      {
        description:
          "Generate a code fragment from a natural language prompt. Supports Next.js, Vue, Streamlit, Gradio, and Python templates.",
        inputSchema: {
          prompt: z
            .string()
            .describe(
              "Natural language description of the desired code fragment",
            ),
          template: z
            .string()
            .optional()
            .describe(
              "Template to use (auto, nextjs-developer, vue-developer, streamlit-developer, gradio-developer, code-interpreter-v1)",
            ),
          model: z
            .string()
            .optional()
            .describe("Model to use for generation (default: gpt-4o)"),
          temperature: z
            .number()
            .optional()
            .describe("Temperature for generation (0-1)"),
        },
      },
      async ({ prompt, template = "auto", model = "gpt-4o", temperature }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const response = await fetch(`${baseUrl}/api/fragments/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              messages: [{ role: "user", content: prompt }],
              template,
              model,
              config: {
                model,
                temperature: temperature || 0.7,
                maxTokens: 4000,
              },
            }),
          });

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          // Parse streaming response
          const reader = response.body?.getReader();
          if (!reader) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "No response body" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let fragment: unknown = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                if (!data.trim()) continue;

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.object) {
                    fragment = parsed.object;
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }

          if (!fragment) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Failed to parse fragment" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    fragment,
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
                        : "Failed to generate fragment",
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

    // Tool: Execute Fragment
    server.registerTool(
      "fragments_execute",
      {
        description:
          "Execute a code fragment in a sandbox environment. Returns preview URL for web apps or execution results for Python.",
        inputSchema: {
          fragment: z
            .object({
              template: z.string(),
              code: z.string(),
              file_path: z.string(),
              port: z.number().nullable().optional(),
              additional_dependencies: z.array(z.string()).optional(),
              has_additional_dependencies: z.boolean().optional(),
              install_dependencies_command: z.string().optional(),
            })
            .describe("Fragment object to execute"),
        },
      },
      async ({ fragment }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const response = await fetch(`${baseUrl}/api/fragments/sandbox`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              fragment,
            }),
          });

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const result = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    result,
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
                        : "Failed to execute fragment",
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

    // Tool: List Fragment Projects
    server.registerTool(
      "fragments_list_projects",
      {
        description:
          "List all fragment projects for the organization. Supports filtering by status and userId.",
        inputSchema: {
          status: z
            .string()
            .optional()
            .describe("Filter by status (draft, deployed, archived)"),
          userId: z.string().optional().describe("Filter by user ID"),
        },
      },
      async ({ status, userId }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const searchParams = new URLSearchParams();
          if (status) searchParams.set("status", status);
          if (userId) searchParams.set("userId", userId);

          const response = await fetch(
            `${baseUrl}/api/v1/fragments/projects?${searchParams.toString()}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            },
          );

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const data = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    projects: data.projects,
                    count: data.projects?.length || 0,
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
                        : "Failed to list projects",
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

    // Tool: Create Fragment Project
    server.registerTool(
      "fragments_create_project",
      {
        description:
          "Create a new fragment project from a fragment. Saves the fragment for later use and deployment.",
        inputSchema: {
          name: z.string().describe("Project name"),
          description: z.string().optional().describe("Project description"),
          fragment: z
            .object({
              template: z.string(),
              code: z.string(),
              file_path: z.string(),
              commentary: z.string().optional(),
              title: z.string().optional(),
              description: z.string().optional(),
              additional_dependencies: z.array(z.string()).optional(),
              has_additional_dependencies: z.boolean().optional(),
              install_dependencies_command: z.string().optional(),
              port: z.number().nullable().optional(),
            })
            .describe("Fragment object to save as project"),
        },
      },
      async ({ name, description, fragment }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const response = await fetch(`${baseUrl}/api/v1/fragments/projects`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              name,
              description,
              fragment,
            }),
          });

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const data = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    project: data.project,
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
                        : "Failed to create project",
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

    // Tool: Get Fragment Project
    server.registerTool(
      "fragments_get_project",
      {
        description:
          "Get a fragment project by ID. Returns full project details including fragment data.",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
        },
      },
      async ({ projectId }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const response = await fetch(
            `${baseUrl}/api/v1/fragments/projects/${projectId}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            },
          );

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const data = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    project: data.project,
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
                        : "Failed to get project",
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

    // Tool: Update Fragment Project
    server.registerTool(
      "fragments_update_project",
      {
        description:
          "Update a fragment project. Can update name, description, fragment data, or status.",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          name: z.string().optional().describe("New project name"),
          description: z
            .string()
            .optional()
            .describe("New project description"),
          fragment: z
            .object({
              template: z.string(),
              code: z.string(),
              file_path: z.string(),
              commentary: z.string().optional(),
              title: z.string().optional(),
              description: z.string().optional(),
              additional_dependencies: z.array(z.string()).optional(),
              has_additional_dependencies: z.boolean().optional(),
              install_dependencies_command: z.string().optional(),
              port: z.number().nullable().optional(),
            })
            .optional()
            .describe("Updated fragment data"),
          status: z
            .enum(["draft", "deployed", "archived"])
            .optional()
            .describe("Project status"),
        },
      },
      async ({ projectId, name, description, fragment, status }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const updateData: Record<string, unknown> = {};
          if (name !== undefined) updateData.name = name;
          if (description !== undefined) updateData.description = description;
          if (fragment !== undefined) updateData.fragment = fragment;
          if (status !== undefined) updateData.status = status;

          const response = await fetch(
            `${baseUrl}/api/v1/fragments/projects/${projectId}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(updateData),
            },
          );

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const data = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    project: data.project,
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
                        : "Failed to update project",
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

    // Tool: Delete Fragment Project
    server.registerTool(
      "fragments_delete_project",
      {
        description: "Delete a fragment project. This is a permanent action.",
        inputSchema: {
          projectId: z.string().describe("Project ID to delete"),
        },
      },
      async ({ projectId }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const response = await fetch(
            `${baseUrl}/api/v1/fragments/projects/${projectId}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            },
          );

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Project deleted successfully",
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
                        : "Failed to delete project",
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

    // Tool: Deploy Fragment Project
    server.registerTool(
      "fragments_deploy_project",
      {
        description:
          "Deploy a fragment project as a app or container. Returns deployment details including app ID and API key.",
        inputSchema: {
          projectId: z.string().describe("Project ID to deploy"),
          type: z.enum(["app", "container"]).describe("Deployment type"),
          appUrl: z
            .string()
            .url()
            .optional()
            .describe(
              "App URL for app deployment (auto-generated if not provided)",
            ),
          allowedOrigins: z
            .array(z.string())
            .optional()
            .describe("Allowed origins for app"),
          autoStorage: z
            .boolean()
            .optional()
            .default(true)
            .describe("Auto-create storage collections"),
          autoInject: z
            .boolean()
            .optional()
            .default(true)
            .describe("Auto-inject app helpers"),
          // Container deployment options
          name: z
            .string()
            .optional()
            .describe("Container name (for container deployment)"),
          project_name: z
            .string()
            .optional()
            .describe("Project name (for container deployment)"),
          port: z
            .number()
            .optional()
            .describe("Container port (for container deployment)"),
        },
      },
      async ({
        projectId,
        type,
        appUrl,
        allowedOrigins,
        autoStorage,
        autoInject,
        name,
        project_name,
        port,
      }) => {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const apiKey = process.env.ELIZA_CLOUD_API_KEY;

        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Cloud API key not configured" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          const deployData: Record<string, unknown> = { type };
          if (type === "app") {
            if (appUrl) deployData.appUrl = appUrl;
            if (allowedOrigins) deployData.allowedOrigins = allowedOrigins;
            if (autoStorage !== undefined) deployData.autoStorage = autoStorage;
            if (autoInject !== undefined) deployData.autoInject = autoInject;
          } else {
            if (name) deployData.name = name;
            if (project_name) deployData.project_name = project_name;
            if (port) deployData.port = port;
          }

          const response = await fetch(
            `${baseUrl}/api/v1/fragments/projects/${projectId}/deploy`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(deployData),
            },
          );

          if (!response.ok) {
            const error = await response
              .json()
              .catch(() => ({ error: "Unknown error" }));
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: error.error || response.statusText },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const data = await response.json();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    deployment: data.deployment,
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
                        : "Failed to deploy project",
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

    // Tool: SEO Create Request
    server.registerTool(
      "seo_create_request",
      {
        description:
          "Create an SEO request using DataForSEO, SerpApi, Claude, and IndexNow.",
        inputSchema: {
          type: z
            .enum(seoRequestTypeEnum.enumValues)
            .describe("SEO request type"),
          pageUrl: z.string().url().optional().describe("Target page URL"),
          keywords: z.array(z.string()).optional().describe("Seed keywords"),
          locale: z.string().optional().describe("Locale, e.g., en-US"),
          searchEngine: z
            .string()
            .optional()
            .describe("Search engine (google, bing)"),
          device: z
            .string()
            .optional()
            .describe("Device type (desktop, mobile)"),
          environment: z.string().optional().describe("App environment"),
          agentIdentifier: z
            .string()
            .optional()
            .describe("Agent identifier for attribution"),
          promptContext: z
            .string()
            .optional()
            .describe("Additional context for Claude"),
          idempotencyKey: z
            .string()
            .optional()
            .describe("Idempotency key for deduplication"),
          locationCode: z
            .number()
            .int()
            .optional()
            .describe("DataForSEO location code (defaults to US 2840)"),
          query: z
            .string()
            .optional()
            .describe("Explicit query for SERP snapshot"),
          appId: z
            .string()
            .optional()
            .describe("App ID to associate the request"),
        },
      },
      async (input) => {
        try {
          const { user } = getAuthContext();
          const result = await seoService.createRequest({
            organizationId: user.organization_id!,
            userId: user.id,
            apiKeyId: user.api_key_id || undefined,
            appId: input.appId,
            type: input.type,
            pageUrl: input.pageUrl,
            keywords: input.keywords,
            locale: input.locale,
            searchEngine: input.searchEngine,
            device: input.device,
            environment: input.environment,
            agentIdentifier: input.agentIdentifier,
            promptContext: input.promptContext,
            idempotencyKey: input.idempotencyKey,
            locationCode: input.locationCode,
            query: input.query,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    request: {
                      id: result.request.id,
                      status: result.request.status,
                      type: result.request.type,
                      pageUrl: result.request.page_url,
                    },
                    artifacts: result.artifacts.map((a) => ({
                      id: a.id,
                      type: a.type,
                      provider: a.provider,
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
                        : "Failed to create SEO request",
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

    // Tool: SEO Get Request
    server.registerTool(
      "seo_get_request",
      {
        description: "Get SEO request status, artifacts, and provider calls.",
        inputSchema: {
          id: z.string().describe("SEO request ID"),
        },
      },
      async ({ id }) => {
        try {
          const { user } = getAuthContext();
          const request = await seoRequestsRepository.findById(id);

          if (!request || request.organization_id !== user.organization_id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "SEO request not found" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const [artifacts, providerCalls] = await Promise.all([
            seoArtifactsRepository.listByRequest(request.id),
            seoProviderCallsRepository.listByRequest(request.id),
          ]);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    request: {
                      id: request.id,
                      status: request.status,
                      type: request.type,
                      pageUrl: request.page_url,
                      totalCost: request.total_cost,
                    },
                    artifacts: artifacts.map((a) => ({
                      id: a.id,
                      type: a.type,
                      provider: a.provider,
                    })),
                    providerCalls: providerCalls.map((call) => ({
                      id: call.id,
                      provider: call.provider,
                      status: call.status,
                      operation: call.operation,
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
                        : "Failed to fetch SEO request",
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
    // DOMAIN MANAGEMENT TOOLS
    // =========================================================================

    // Tool: Search Domains
    server.registerTool(
      "domains_search",
      {
        description:
          "Search for available domain names. Returns availability status and pricing. " +
          "Provide a keyword and optionally specific TLDs to check. FREE tool.",
        inputSchema: {
          query: z
            .string()
            .min(1)
            .max(63)
            .describe("Domain name keyword to search for"),
          tlds: z
            .array(z.string())
            .optional()
            .describe("TLDs to check (default: com, ai, io, co, app, dev)"),
        },
      },
      async ({ query, tlds }) => {
        try {
          const { domainManagementService } =
            await import("@/lib/services/domain-management");
          const results = await domainManagementService.searchDomains(
            query,
            tlds,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    query,
                    results: results.map((r) => ({
                      domain: r.domain,
                      available: r.available,
                      price: r.price
                        ? {
                            amount: r.price.price / 100, // Convert cents to dollars
                            currency: r.price.currency,
                            period: r.price.period,
                          }
                        : null,
                    })),
                    availableCount: results.filter((r) => r.available).length,
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
                        : "Failed to search domains",
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

    // Tool: Check Domain Availability
    server.registerTool(
      "domains_check",
      {
        description:
          "Check if a specific domain is available for purchase. " +
          "Returns availability, pricing, and any moderation concerns. FREE tool.",
        inputSchema: {
          domain: z
            .string()
            .min(3)
            .max(253)
            .describe("Full domain name to check (e.g., example.com)"),
        },
      },
      async ({ domain }) => {
        try {
          const { domainManagementService } =
            await import("@/lib/services/domain-management");
          const { domainModerationService } =
            await import("@/lib/services/domain-moderation");

          const moderation =
            await domainModerationService.validateDomainName(domain);
          if (!moderation.allowed) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      domain,
                      available: false,
                      reason: "Domain name not allowed by moderation policy",
                      flags: moderation.flags,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          const result =
            await domainManagementService.checkAvailability(domain);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    domain: result.domain,
                    available: result.available,
                    price: result.price
                      ? {
                          amount: result.price.price / 100,
                          currency: result.price.currency,
                          period: result.price.period,
                          renewalAmount: result.price.renewalPrice / 100,
                        }
                      : null,
                    moderationFlags: moderation.flags,
                    requiresReview: moderation.requiresReview,
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
                        : "Failed to check domain",
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

    // Tool: List My Domains
    server.registerTool(
      "domains_list",
      {
        description:
          "List all domains owned by your organization. " +
          "Shows status, assignment, and expiration info. FREE tool.",
        inputSchema: {
          filter: z
            .enum(["all", "unassigned", "assigned"])
            .optional()
            .default("all")
            .describe("Filter domains by assignment status"),
        },
      },
      async ({ filter }) => {
        try {
          const { user } = getAuthContext();
          const { domainManagementService } =
            await import("@/lib/services/domain-management");

          let domains;
          if (filter === "unassigned") {
            domains = await domainManagementService.listUnassignedDomains(
              user.organization_id,
            );
          } else {
            domains = await domainManagementService.listDomains(
              user.organization_id,
            );
            if (filter === "assigned") {
              domains = domains.filter((d) => d.resourceType !== null);
            }
          }

          const stats = await domainManagementService.getStats(
            user.organization_id,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    domains: domains.map((d) => ({
                      id: d.id,
                      domain: d.domain,
                      status: d.status,
                      verified: d.verified,
                      resourceType: d.resourceType,
                      resourceId:
                        d.appId || d.containerId || d.agentId || d.mcpId,
                      expiresAt: d.expiresAt?.toISOString(),
                      sslStatus: d.sslStatus,
                      isLive: d.isLive,
                    })),
                    stats,
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
                        : "Failed to list domains",
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

    // Tool: Register External Domain
    server.registerTool(
      "domains_register_external",
      {
        description:
          "Register an external domain you already own. " +
          "Returns DNS instructions for verification. Costs 1 credit.",
        inputSchema: {
          domain: z
            .string()
            .min(3)
            .max(253)
            .describe("Domain name to register"),
          nameserverMode: z
            .enum(["vercel", "external"])
            .optional()
            .default("external")
            .describe(
              "'vercel' = delegate nameservers to Vercel, 'external' = keep your nameservers and add DNS records",
            ),
        },
      },
      async ({ domain, nameserverMode }) => {
        try {
          const { user } = getAuthContext();

          // Deduct credit
          const creditResult = await creditsService.deduct({
            organizationId: user.organization_id,
            amount: 1,
            description: `Register external domain: ${domain}`,
            metadata: { tool: "domains_register_external", domain },
          });

          if (!creditResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Insufficient credits", required: 1 },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const { domainManagementService } =
            await import("@/lib/services/domain-management");
          const result = await domainManagementService.registerExternalDomain(
            domain,
            user.organization_id,
            nameserverMode,
          );

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    domain: {
                      id: result.domain!.id,
                      domain: result.domain!.domain,
                      status: result.domain!.status,
                      verificationToken: result.domain!.verificationToken,
                    },
                    dnsInstructions: result.dnsInstructions,
                    message:
                      "Add the DNS records below to verify domain ownership",
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
                        : "Failed to register domain",
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

    // Tool: Verify Domain
    server.registerTool(
      "domains_verify",
      {
        description:
          "Verify domain ownership by checking DNS records. " +
          "Call this after adding the verification TXT record. FREE tool.",
        inputSchema: {
          domainId: z.string().uuid().describe("Domain ID to verify"),
        },
      },
      async ({ domainId }) => {
        try {
          const { user } = getAuthContext();
          const { domainManagementService } =
            await import("@/lib/services/domain-management");

          const domain = await domainManagementService.getDomain(
            domainId,
            user.organization_id,
          );
          if (!domain) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Domain not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await domainManagementService.verifyDomain(domainId);

          if (result.verified) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      success: true,
                      verified: true,
                      domain: domain.domain,
                      message:
                        "Domain verified successfully! You can now assign it to a resource.",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          const dnsInstructions =
            domainManagementService.generateDnsInstructions(
              domain.domain,
              domain.verificationToken || "",
              domain.nameserverMode,
            );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    verified: false,
                    error: result.error,
                    dnsInstructions,
                    message:
                      "Verification failed. Please check your DNS configuration and try again.",
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
                        : "Failed to verify domain",
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

    // Tool: Assign Domain
    server.registerTool(
      "domains_assign",
      {
        description:
          "Assign a verified domain to an app, container, agent, or MCP. " +
          "The domain must be verified first. Costs 1 credit.",
        inputSchema: {
          domainId: z.string().uuid().describe("Domain ID to assign"),
          resourceType: z
            .enum(["app", "container", "agent", "mcp"])
            .describe("Type of resource to assign to"),
          resourceId: z.string().uuid().describe("ID of the resource"),
        },
      },
      async ({ domainId, resourceType, resourceId }) => {
        try {
          const { user } = getAuthContext();

          // Deduct credit
          const creditResult = await creditsService.deduct({
            organizationId: user.organization_id,
            amount: 1,
            description: `Assign domain to ${resourceType}: ${resourceId}`,
            metadata: {
              tool: "domains_assign",
              domainId,
              resourceType,
              resourceId,
            },
          });

          if (!creditResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Insufficient credits", required: 1 },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const { domainManagementService } =
            await import("@/lib/services/domain-management");

          const updated = await domainManagementService.assignToResource(
            domainId,
            resourceType,
            resourceId,
            user.organization_id,
          );
          if (!updated) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error:
                        "Failed to assign domain. Ensure the domain is verified and the resource exists.",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    domain: {
                      id: updated.id,
                      domain: updated.domain,
                      resourceType: updated.resourceType,
                      resourceId:
                        updated.appId ||
                        updated.containerId ||
                        updated.agentId ||
                        updated.mcpId,
                    },
                    message: `Domain assigned to ${resourceType}`,
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
                        : "Failed to assign domain",
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

    // Tool: Unassign Domain
    server.registerTool(
      "domains_unassign",
      {
        description:
          "Unassign a domain from its current resource. " +
          "The domain will remain in your account but not point anywhere. FREE tool.",
        inputSchema: {
          domainId: z.string().uuid().describe("Domain ID to unassign"),
        },
      },
      async ({ domainId }) => {
        try {
          const { user } = getAuthContext();
          const { domainManagementService } =
            await import("@/lib/services/domain-management");

          const updated = await domainManagementService.unassignDomain(
            domainId,
            user.organization_id,
          );

          if (!updated) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Domain not found or already unassigned" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    domain: {
                      id: updated.id,
                      domain: updated.domain,
                    },
                    message: "Domain unassigned successfully",
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
                        : "Failed to unassign domain",
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

    // Tool: Get DNS Records
    server.registerTool(
      "domains_get_dns",
      {
        description:
          "Get DNS records for a domain. Only works for domains using Vercel nameservers. FREE tool.",
        inputSchema: {
          domainId: z.string().uuid().describe("Domain ID"),
        },
      },
      async ({ domainId }) => {
        try {
          const { user } = getAuthContext();
          const { domainManagementService } =
            await import("@/lib/services/domain-management");

          const domain = await domainManagementService.getDomain(
            domainId,
            user.organization_id,
          );
          if (!domain) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Domain not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const records = await domainManagementService.getDnsRecords(domainId);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    domain: domain.domain,
                    manageable:
                      domain.registrar === "vercel" &&
                      domain.nameserverMode === "vercel",
                    records,
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
                        : "Failed to get DNS records",
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

    // Tool: Add DNS Record
    server.registerTool(
      "domains_add_dns_record",
      {
        description:
          "Add a DNS record to a domain. Only works for domains using Vercel nameservers. Costs 1 credit.",
        inputSchema: {
          domainId: z.string().uuid().describe("Domain ID"),
          type: z
            .enum(["A", "AAAA", "CNAME", "TXT", "MX"])
            .describe("Record type"),
          name: z.string().min(1).describe("Record name (subdomain or @)"),
          value: z.string().min(1).describe("Record value"),
          ttl: z
            .number()
            .int()
            .min(60)
            .max(86400)
            .optional()
            .describe("TTL in seconds"),
          priority: z
            .number()
            .int()
            .optional()
            .describe("Priority for MX records"),
        },
      },
      async ({ domainId, type, name, value, ttl, priority }) => {
        try {
          const { user } = getAuthContext();

          // Deduct credit
          const creditResult = await creditsService.deduct({
            organizationId: user.organization_id,
            amount: 1,
            description: `Add DNS ${type} record`,
            metadata: { tool: "domains_add_dns_record", domainId, type, name },
          });

          if (!creditResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Insufficient credits", required: 1 },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          const { domainManagementService } =
            await import("@/lib/services/domain-management");

          const domain = await domainManagementService.getDomain(
            domainId,
            user.organization_id,
          );
          if (!domain) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Domain not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await domainManagementService.addDnsRecord(domainId, {
            type,
            name,
            value,
            ttl,
            priority,
          });

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    record: result.record,
                    message: "DNS record added",
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
                        : "Failed to add DNS record",
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
    // SECRETS MANAGEMENT TOOLS
    // =========================================================================

    // Tool: List Secrets
    server.registerTool(
      "secrets_list",
      {
        description:
          "List secrets (metadata only, no values). FREE tool. Use filters to narrow results.",
        inputSchema: {
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe("Filter by project ID"),
          projectType: z
            .enum(["character", "app", "workflow", "container", "mcp"])
            .optional()
            .describe("Filter by project type"),
          environment: z
            .enum(["development", "preview", "production"])
            .optional()
            .describe("Filter by environment"),
          provider: z
            .enum([
              "openai",
              "anthropic",
              "google",
              "elevenlabs",
              "fal",
              "stripe",
              "discord",
              "telegram",
              "twitter",
              "github",
              "slack",
              "aws",
              "vercel",
              "custom",
            ])
            .optional()
            .describe("Filter by provider"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .default(100)
            .describe("Max results"),
          offset: z
            .number()
            .int()
            .min(0)
            .optional()
            .default(0)
            .describe("Offset for pagination"),
        },
      },
      async ({
        projectId,
        projectType,
        environment,
        provider,
        limit,
        offset,
      }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          const result = await secretsService.listFiltered({
            organizationId: user.organization_id!,
            projectId,
            projectType,
            environment,
            provider,
            limit,
            offset,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    secrets: result.secrets.map((s) => ({
                      id: s.id,
                      name: s.name,
                      description: s.description,
                      scope: s.scope,
                      projectId: s.projectId,
                      projectType: s.projectType,
                      environment: s.environment,
                      provider: s.provider,
                      version: s.version,
                      createdAt: s.createdAt.toISOString(),
                      lastAccessedAt: s.lastAccessedAt?.toISOString(),
                      accessCount: s.accessCount,
                    })),
                    total: result.total,
                    limit,
                    offset,
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
                        : "Failed to list secrets",
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

    // Tool: Get Secret
    server.registerTool(
      "secrets_get",
      {
        description:
          "Get a secret value by name. Retrieves the decrypted value.",
        inputSchema: {
          name: z.string().min(1).describe("Secret name"),
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe("Project ID for scoped secrets"),
          environment: z
            .enum(["development", "preview", "production"])
            .optional()
            .describe("Environment"),
        },
      },
      async ({ name, projectId, environment }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          const value = await secretsService.get(
            user.organization_id!,
            name,
            projectId,
            environment,
            { actorType: "api_key", actorId: user.id, source: "mcp" },
          );

          if (!value) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ name, found: false }, null, 2),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ name, value }, null, 2),
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
                        : "Failed to get secret",
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

    // Tool: Get Multiple Secrets
    server.registerTool(
      "secrets_get_bulk",
      {
        description:
          "Get multiple secrets by names. Returns a key-value object of decrypted values.",
        inputSchema: {
          names: z
            .array(z.string())
            .min(1)
            .max(50)
            .describe("Secret names to retrieve"),
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe("Project ID for scoped secrets"),
          projectType: z
            .enum(["character", "app", "workflow", "container", "mcp"])
            .optional()
            .describe("Project type"),
          environment: z
            .enum(["development", "preview", "production"])
            .optional()
            .describe("Environment"),
          includeBindings: z
            .boolean()
            .optional()
            .default(true)
            .describe("Include bound secrets"),
        },
      },
      async ({
        names,
        projectId,
        projectType,
        environment,
        includeBindings,
      }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          const secrets = await secretsService.getDecrypted(
            {
              organizationId: user.organization_id!,
              projectId,
              projectType,
              environment,
              names,
              includeBindings,
            },
            { actorType: "api_key", actorId: user.id, source: "mcp" },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { secrets, count: Object.keys(secrets).length },
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
                        : "Failed to get secrets",
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

    // Tool: Create Secret
    server.registerTool(
      "secrets_create",
      {
        description: "Create a new secret. Secrets are encrypted at rest.",
        inputSchema: {
          name: z
            .string()
            .min(1)
            .max(255)
            .describe("Secret name (unique within scope)"),
          value: z.string().min(1).describe("Secret value"),
          description: z.string().optional().describe("Description"),
          provider: z
            .enum([
              "openai",
              "anthropic",
              "google",
              "elevenlabs",
              "fal",
              "stripe",
              "discord",
              "telegram",
              "twitter",
              "github",
              "slack",
              "aws",
              "vercel",
              "custom",
            ])
            .optional()
            .describe("Provider type"),
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe("Project ID for scoped secrets"),
          projectType: z
            .enum(["character", "app", "workflow", "container", "mcp"])
            .optional()
            .describe("Project type"),
          environment: z
            .enum(["development", "preview", "production"])
            .optional()
            .describe("Environment"),
        },
      },
      async ({
        name,
        value,
        description,
        provider,
        projectId,
        projectType,
        environment,
      }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          const secret = await secretsService.create(
            {
              organizationId: user.organization_id!,
              name,
              value,
              description,
              provider,
              projectId,
              projectType,
              environment,
              scope: projectId ? "project" : "organization",
              createdBy: user.id,
            },
            { actorType: "api_key", actorId: user.id, source: "mcp" },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, id: secret.id, name: secret.name },
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
                        : "Failed to create secret",
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

    // Tool: Update Secret
    server.registerTool(
      "secrets_update",
      {
        description: "Update an existing secret's value or description.",
        inputSchema: {
          secretId: z.string().uuid().describe("Secret ID"),
          value: z.string().optional().describe("New secret value"),
          description: z.string().optional().describe("New description"),
        },
      },
      async ({ secretId, value, description }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          const updated = await secretsService.update(
            secretId,
            user.organization_id!,
            { value, description },
            { actorType: "api_key", actorId: user.id, source: "mcp" },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    id: updated.id,
                    name: updated.name,
                    version: updated.version,
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
                        : "Failed to update secret",
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

    // Tool: Delete Secret
    server.registerTool(
      "secrets_delete",
      {
        description: "Delete a secret permanently.",
        inputSchema: {
          secretId: z.string().uuid().describe("Secret ID to delete"),
        },
      },
      async ({ secretId }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          await secretsService.delete(secretId, user.organization_id!, {
            actorType: "api_key",
            actorId: user.id,
            source: "mcp",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, secretId }, null, 2),
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
                        : "Failed to delete secret",
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

    // Tool: Bind Secret to Project
    server.registerTool(
      "secrets_bind",
      {
        description:
          "Bind an organization-level secret to a project. Allows reusing secrets across projects without duplication.",
        inputSchema: {
          secretId: z.string().uuid().describe("Secret ID to bind"),
          projectId: z.string().uuid().describe("Project ID"),
          projectType: z
            .enum(["character", "app", "workflow", "container", "mcp"])
            .describe("Project type"),
        },
      },
      async ({ secretId, projectId, projectType }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          const binding = await secretsService.bindSecret(
            { secretId, projectId, projectType, createdBy: user.id },
            { actorType: "api_key", actorId: user.id, source: "mcp" },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    bindingId: binding.id,
                    secretName: binding.secretName,
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
                        : "Failed to bind secret",
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

    // Tool: Unbind Secret from Project
    server.registerTool(
      "secrets_unbind",
      {
        description: "Remove a secret binding from a project.",
        inputSchema: {
          bindingId: z.string().uuid().describe("Binding ID to remove"),
        },
      },
      async ({ bindingId }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          await secretsService.unbindSecret(bindingId, user.organization_id!, {
            actorType: "api_key",
            actorId: user.id,
            source: "mcp",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, bindingId }, null, 2),
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
                        : "Failed to unbind secret",
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

    // Tool: List Secret Bindings
    server.registerTool(
      "secrets_list_bindings",
      {
        description:
          "List secret bindings for a project or for a specific secret.",
        inputSchema: {
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe("Project ID to list bindings for"),
          projectType: z
            .enum(["character", "app", "workflow", "container", "mcp"])
            .optional()
            .describe("Project type filter"),
          secretId: z
            .string()
            .uuid()
            .optional()
            .describe("Secret ID to list bindings for"),
        },
      },
      async ({ projectId, projectType, secretId }) => {
        try {
          const { user } = getAuthContext();
          const { secretsService } = await import("@/lib/services/secrets");

          if (!projectId && !secretId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: "Either projectId or secretId is required" },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          if (secretId) {
            const bindings = await secretsService.listSecretBindings(secretId);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { bindings, count: bindings.length },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          const result = await secretsService.listBindings(
            user.organization_id,
            projectId!,
            projectType,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { bindings: result.bindings, total: result.total },
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
                        : "Failed to list bindings",
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
    // CODE AGENT TOOLS
    // =========================================================================

    // Tool: Create Code Agent Session
    server.registerTool(
      "code_agent_create_session",
      {
        description:
          "Create a new code agent session for writing and executing code. " +
          "Sessions provide an isolated environment with file system, git, and command execution. " +
          "Cost: ~$0.01 to create, plus usage-based billing.",
        inputSchema: {
          name: z.string().max(200).optional().describe("Session name"),
          description: z
            .string()
            .max(1000)
            .optional()
            .describe("Session description"),
          templateUrl: z
            .string()
            .url()
            .optional()
            .describe("Git URL for template to clone"),
          loadOrgSecrets: z
            .boolean()
            .optional()
            .default(true)
            .describe("Load organization secrets into environment"),
          expiresInSeconds: z
            .number()
            .min(60)
            .max(86400)
            .optional()
            .default(1800)
            .describe("Session timeout in seconds (default: 30 min, max: 24h)"),
        },
      },
      async ({
        name,
        description,
        templateUrl,
        loadOrgSecrets,
        expiresInSeconds,
      }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.createSession({
            organizationId: user.organization_id!,
            userId: user.id,
            name,
            description,
            templateUrl,
            loadOrgSecrets,
            expiresInSeconds,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    session: {
                      id: session.id,
                      name: session.name,
                      status: session.status,
                      runtimeUrl: session.runtimeUrl,
                      expiresAt: session.expiresAt,
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
                        : "Failed to create session",
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

    // Tool: Execute Code in Session
    server.registerTool(
      "code_agent_execute",
      {
        description:
          "Execute code or shell commands in a code agent session. " +
          "Supports Python, JavaScript, TypeScript, and shell commands.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          type: z.enum(["code", "command"]).describe("Execution type"),
          language: z
            .enum(["python", "javascript", "typescript", "shell"])
            .optional()
            .describe("Language for code execution"),
          code: z.string().max(100000).optional().describe("Code to execute"),
          command: z
            .string()
            .max(10000)
            .optional()
            .describe("Shell command to run"),
          args: z.array(z.string()).optional().describe("Command arguments"),
          workingDirectory: z.string().optional().describe("Working directory"),
          timeout: z
            .number()
            .min(1000)
            .max(300000)
            .optional()
            .default(60000)
            .describe("Timeout in milliseconds"),
        },
      },
      async ({
        sessionId,
        type,
        language,
        code,
        command,
        args,
        workingDirectory,
        timeout,
      }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          // Verify session ownership
          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          let result;
          if (type === "code") {
            if (!code || !language) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      { error: "code and language required for type=code" },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            result = await codeAgentService.executeCode({
              sessionId,
              language,
              code,
              options: { workingDirectory, timeout },
            });
          } else {
            if (!command) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      { error: "command required for type=command" },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            result = await codeAgentService.runCommand({
              sessionId,
              command,
              args,
              options: { workingDirectory, timeout },
            });
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: result.success,
                    exitCode: result.exitCode,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    durationMs: result.durationMs,
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
                        : "Execution failed",
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

    // Tool: Read File from Session
    server.registerTool(
      "code_agent_read_file",
      {
        description: "Read a file from a code agent session.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          path: z.string().describe("File path to read"),
        },
      },
      async ({ sessionId, path }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await codeAgentService.readFile({ sessionId, path });

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { path, content: result.content, size: result.size },
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
                        : "Failed to read file",
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

    // Tool: Write File to Session
    server.registerTool(
      "code_agent_write_file",
      {
        description:
          "Write a file to a code agent session. Creates directories as needed.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          path: z.string().describe("File path to write"),
          content: z.string().describe("File content"),
        },
      },
      async ({ sessionId, path, content }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await codeAgentService.writeFile({
            sessionId,
            path,
            content,
          });

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, path }, null, 2),
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
                        : "Failed to write file",
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

    // Tool: List Files in Session
    server.registerTool(
      "code_agent_list_files",
      {
        description: "List files and directories in a code agent session.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          path: z.string().describe("Directory path to list"),
          recursive: z
            .boolean()
            .optional()
            .default(true)
            .describe("List recursively"),
          maxDepth: z
            .number()
            .min(1)
            .max(10)
            .optional()
            .default(3)
            .describe("Max directory depth"),
        },
      },
      async ({ sessionId, path, recursive, maxDepth }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await codeAgentService.listFiles({
            sessionId,
            path,
            recursive,
            maxDepth,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    path,
                    entries: result.entries,
                    count: result.entries.length,
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
                        : "Failed to list files",
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

    // Tool: Git Clone in Session
    server.registerTool(
      "code_agent_git_clone",
      {
        description: "Clone a git repository into a code agent session.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          url: z.string().url().describe("Git repository URL"),
          branch: z.string().optional().describe("Branch to clone"),
          depth: z
            .number()
            .min(1)
            .optional()
            .describe("Clone depth (shallow clone)"),
          directory: z.string().optional().describe("Target directory"),
        },
      },
      async ({ sessionId, url, branch, depth, directory }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await codeAgentService.gitClone({
            sessionId,
            url,
            branch,
            depth,
            directory,
          });

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: result.message,
                    gitState: result.gitState,
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
                        : "Git clone failed",
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

    // Tool: Install Packages in Session
    server.registerTool(
      "code_agent_install_packages",
      {
        description:
          "Install packages in a code agent session using npm, pip, bun, or cargo.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          packages: z
            .array(z.string())
            .min(1)
            .max(50)
            .describe("Package names to install"),
          manager: z
            .enum(["npm", "pip", "bun", "cargo"])
            .optional()
            .default("npm")
            .describe("Package manager"),
          dev: z
            .boolean()
            .optional()
            .default(false)
            .describe("Install as dev dependency"),
        },
      },
      async ({ sessionId, packages, manager, dev }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await codeAgentService.installPackages({
            sessionId,
            packages,
            manager,
            dev,
          });

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    { error: result.error, output: result.output },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    packages: result.packages,
                    installedCount: result.installedCount,
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
                        : "Package installation failed",
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

    // Tool: Create Session Snapshot
    server.registerTool(
      "code_agent_snapshot",
      {
        description:
          "Create a snapshot of a code agent session for later restoration.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID"),
          name: z.string().max(200).optional().describe("Snapshot name"),
          description: z
            .string()
            .max(1000)
            .optional()
            .describe("Snapshot description"),
        },
      },
      async ({ sessionId, name, description }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          const session = await codeAgentService.getSession(
            sessionId,
            user.organization_id!,
          );
          if (!session) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Session not found" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const result = await codeAgentService.createSnapshot({
            sessionId,
            name,
            description,
          });

          if (!result.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: result.error }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, snapshot: result.snapshot },
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
                        : "Snapshot creation failed",
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

    // Tool: Terminate Session
    server.registerTool(
      "code_agent_terminate",
      {
        description:
          "Terminate a code agent session. Creates a final snapshot before termination.",
        inputSchema: {
          sessionId: z.string().uuid().describe("Session ID to terminate"),
        },
      },
      async ({ sessionId }) => {
        try {
          const { user } = getAuthContext();
          const { codeAgentService } =
            await import("@/lib/services/code-agent");

          await codeAgentService.terminateSession(
            sessionId,
            user.organization_id!,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, message: "Session terminated" },
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
                        : "Failed to terminate session",
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
    // CODE INTERPRETER TOOL (Quick Stateless Execution)
    // =========================================================================

    server.registerTool(
      "code_interpreter",
      {
        description:
          "Quick stateless code execution for fast evaluations. " +
          "Supports Python, JavaScript, TypeScript, and shell. " +
          "No session required - great for calculations, data processing, quick scripts. " +
          "Cost: ~$0.001 per execution.",
        inputSchema: {
          language: z
            .enum(["python", "javascript", "typescript", "shell"])
            .describe("Programming language"),
          code: z.string().min(1).max(50000).describe("Code to execute"),
          packages: z
            .array(z.string())
            .max(20)
            .optional()
            .describe("Packages to install (Python/npm)"),
          timeout: z
            .number()
            .min(1000)
            .max(60000)
            .optional()
            .default(30000)
            .describe("Timeout in milliseconds"),
        },
      },
      async ({ language, code, packages, timeout }) => {
        try {
          const { user } = getAuthContext();
          const { interpreterService } =
            await import("@/lib/services/code-agent");

          const result = await interpreterService.execute({
            organizationId: user.organization_id!,
            userId: user.id,
            language,
            code,
            packages,
            timeout,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: result.success,
                    output: result.output,
                    error: result.error,
                    exitCode: result.exitCode,
                    durationMs: result.durationMs,
                    costCents: result.costCents,
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
                        : "Execution failed",
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
    // WEBHOOK MANAGEMENT TOOLS
    // =========================================================================

    server.registerTool(
      "webhook_create",
      {
        description:
          "Create a new webhook for receiving events. " +
          "Returns webhook details including the webhook URL and secret.",
        inputSchema: {
          name: z.string().min(1).max(200).describe("Webhook name"),
          description: z.string().optional().describe("Webhook description"),
          targetType: z
            .enum(["url", "agent", "application", "workflow", "a2a", "mcp"])
            .describe("Target type for the webhook"),
          targetId: z
            .string()
            .uuid()
            .optional()
            .describe("Target ID (required for non-url types)"),
          targetUrl: z
            .string()
            .url()
            .optional()
            .describe("Target URL (required for url type)"),
          eventTypes: z
            .array(z.string())
            .optional()
            .describe("Event types to subscribe to (empty = all events)"),
          requireSignature: z
            .boolean()
            .optional()
            .default(true)
            .describe("Require HMAC signature verification"),
        },
      },
      async ({
        name,
        description,
        targetType,
        targetId,
        targetUrl,
        eventTypes,
        requireSignature,
      }) => {
        const { user } = getAuthContext();

        const webhook = await webhookService.createWebhook({
          organizationId: user.organization_id!,
          createdBy: user.id,
          name,
          description,
          targetType,
          targetId,
          targetUrl,
          config: {
            eventTypes,
            requireSignature,
          },
        });

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
        const webhookUrl = `${baseUrl}/api/webhooks/${webhook.webhook_key}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  webhook: {
                    id: webhook.id,
                    name: webhook.name,
                    webhookUrl,
                    webhookKey: webhook.webhook_key,
                    targetType: webhook.target_type,
                    isActive: webhook.is_active,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "webhook_list",
      {
        description: "List webhooks for your organization",
        inputSchema: {
          targetType: z
            .enum(["url", "agent", "application", "workflow", "a2a", "mcp"])
            .optional()
            .describe("Filter by target type"),
          isActive: z
            .boolean()
            .optional()
            .describe("Filter by active status"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .default(50)
            .describe("Maximum number of webhooks to return"),
        },
      },
      async ({ targetType, isActive, limit }) => {
        const { user } = getAuthContext();

        const webhooks = await webhookService.listWebhooks(
          user.organization_id!,
          {
            targetType,
            isActive,
            limit,
          },
        );

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  webhooks: webhooks.map((w) => ({
                    id: w.id,
                    name: w.name,
                    webhookUrl: `${baseUrl}/api/webhooks/${w.webhook_key}`,
                    targetType: w.target_type,
                    isActive: w.is_active,
                    executionCount: w.execution_count,
                    successCount: w.success_count,
                    errorCount: w.error_count,
                    lastTriggeredAt: w.last_triggered_at?.toISOString(),
                  })),
                  count: webhooks.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "webhook_get",
      {
        description: "Get webhook details by ID",
        inputSchema: {
          webhookId: z.string().uuid().describe("Webhook ID"),
        },
      },
      async ({ webhookId }) => {
        const { user } = getAuthContext();

        const webhook = await webhookService.getWebhookById(
          webhookId,
          user.organization_id!,
        );

        if (!webhook) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Webhook not found" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  webhook: {
                    id: webhook.id,
                    name: webhook.name,
                    description: webhook.description,
                    webhookUrl: `${baseUrl}/api/webhooks/${webhook.webhook_key}`,
                    targetType: webhook.target_type,
                    targetId: webhook.target_id,
                    targetUrl: webhook.target_url,
                    isActive: webhook.is_active,
                    config: webhook.config,
                    executionCount: webhook.execution_count,
                    successCount: webhook.success_count,
                    errorCount: webhook.error_count,
                    lastTriggeredAt: webhook.last_triggered_at?.toISOString(),
                    lastSuccessAt: webhook.last_success_at?.toISOString(),
                    lastErrorAt: webhook.last_error_at?.toISOString(),
                    createdAt: webhook.created_at.toISOString(),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "webhook_update",
      {
        description: "Update webhook configuration",
        inputSchema: {
          webhookId: z.string().uuid().describe("Webhook ID"),
          name: z.string().min(1).max(200).optional().describe("New name"),
          description: z.string().optional().describe("New description"),
          targetUrl: z.string().url().optional().describe("New target URL"),
          isActive: z.boolean().optional().describe("Active status"),
          eventTypes: z
            .array(z.string())
            .optional()
            .describe("Event types to subscribe to"),
        },
      },
      async ({ webhookId, name, description, targetUrl, isActive, eventTypes }) => {
        const { user } = getAuthContext();

        const existing = await webhookService.getWebhookById(
          webhookId,
          user.organization_id!,
        );

        if (!existing) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Webhook not found" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const config: any = { ...existing.config };
        if (eventTypes !== undefined) {
          config.eventTypes = eventTypes;
        }

        const webhook = await webhookService.updateWebhook(
          webhookId,
          user.organization_id!,
          {
            name,
            description,
            targetUrl,
            isActive,
            config,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  webhook: {
                    id: webhook.id,
                    name: webhook.name,
                    isActive: webhook.is_active,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "webhook_delete",
      {
        description: "Delete a webhook",
        inputSchema: {
          webhookId: z.string().uuid().describe("Webhook ID"),
        },
      },
      async ({ webhookId }) => {
        const { user } = getAuthContext();

        await webhookService.deleteWebhook(webhookId, user.organization_id!);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, message: "Webhook deleted" },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "webhook_test",
      {
        description: "Manually trigger a webhook for testing",
        inputSchema: {
          webhookId: z.string().uuid().describe("Webhook ID"),
          eventType: z.string().optional().describe("Event type"),
          payload: z
            .record(z.unknown())
            .optional()
            .describe("Test payload (default: empty object)"),
        },
      },
      async ({ webhookId, eventType, payload }) => {
        const { user } = getAuthContext();

        const webhook = await webhookService.getWebhookById(
          webhookId,
          user.organization_id!,
        );

        if (!webhook) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: "Webhook not found" },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const result = await webhookService.executeWebhook({
          webhookId,
          eventType,
          payload: payload || {},
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.status === "success",
                  executionId: result.executionId,
                  status: result.status,
                  responseStatus: result.responseStatus,
                  durationMs: result.durationMs,
                  error: result.error,
                },
                null,
                2,
              ),
            },
          ],
        };
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

    // Track request for agent reputation (fire and forget)
    const agentIdentifier = `org:${authResult.user.organization_id}`;
    agentReputationService
      .recordRequest({
        agentIdentifier,
        isSuccessful: true,
        method: "mcp",
      })
      .catch(() => {
        // Ignore errors - don't fail MCP request for reputation tracking
      });

    // Run MCP handler within auth context using AsyncLocalStorage
    // NextRequest extends Request, but the mcp-handler declares a global Request augmentation
    // that adds an optional `auth` property. Direct cast is safe since NextRequest is a subtype.
    return await authContextStorage.run(authResult, async () => {
      return await mcpHandler(req as Request);
    });
  } catch (error) {
    // Return 402 with x402 payment info if enabled and configured
    const {
      X402_ENABLED,
      X402_RECIPIENT_ADDRESS,
      getDefaultNetwork,
      USDC_ADDRESSES,
      TOPUP_PRICE,
      CREDITS_PER_DOLLAR,
      isX402Configured,
    } = await import("@/lib/config/x402");

    if (isX402Configured()) {
      return NextResponse.json(
        {
          error: "authentication_failed",
          error_description:
            "Authentication required. Get an API key or top up credits via x402 payment.",
          x402: {
            topupEndpoint: "/api/v1/credits/topup",
            network: getDefaultNetwork(),
            asset: USDC_ADDRESSES[getDefaultNetwork()],
            payTo: X402_RECIPIENT_ADDRESS,
            minimumTopup: TOPUP_PRICE,
            creditsPerDollar: CREDITS_PER_DOLLAR,
          },
        },
        {
          status: 402,
          headers: {
            "WWW-Authenticate":
              'Bearer realm="MCP Server", error="invalid_token"',
          },
        },
      );
    }

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
