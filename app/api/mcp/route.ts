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
                    2,
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
                limit,
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
            totalCost: (record.input_cost || 0) + (record.output_cost || 0),
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
                    2,
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
                    2,
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
            usage?.outputTokens || 0,
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
                    2,
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
                    2,
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
                    2,
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
                    2,
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
                    2,
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
                  2,
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
      },
    );
  }
}

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
