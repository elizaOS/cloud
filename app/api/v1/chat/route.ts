import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { conversationsService } from "@/lib/services/conversations";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { generationsService } from "@/lib/services/generations";
import { organizationsService } from "@/lib/services/organizations";
import { anonymousSessionsService } from "@/lib/services/anonymous-sessions";
import { contentModerationService } from "@/lib/services/content-moderation";
import {
  calculateCost,
  getProviderFromModel,
  estimateTokens,
} from "@/lib/pricing";
import { resolveModel } from "@/lib/models";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import type { AnonymousSession } from "@/db/schemas";

export const maxDuration = 60;

/**
 * POST /api/v1/chat
 * Chat completion endpoint supporting both authenticated and anonymous users.
 * Processes chat messages and returns AI responses with credit deduction.
 *
 * @param req - Request body with messages array and optional conversation ID.
 * @returns Streaming text response or JSON error.
 */
async function handlePOST(req: NextRequest) {
  try {
    let user: UserWithOrganization;
    let apiKey: ApiKey | undefined = undefined;
    let authMethod: "session" | "api_key" | "anonymous";
    let isAnonymous = false;
    let anonymousSession: AnonymousSession | null = null;

    // Try authenticated user first
    try {
      const authResult = await requireAuthOrApiKey(req);
      user = authResult.user;
      apiKey = authResult.apiKey;
      authMethod = authResult.authMethod;
    } catch (error) {
      // Fallback to anonymous user
      const anonData = await getAnonymousUser();
      if (!anonData) {
        throw new Error("Authentication required");
      }

      user = anonData.user;
      anonymousSession = anonData.session;
      isAnonymous = true;
      authMethod = "anonymous";

      logger.info("chat-api", "Anonymous user request", {
        userId: user.id,
        sessionId: anonymousSession?.id,
        messageCount: anonymousSession?.message_count,
      });
    }

    const body = await req.json();
    const {
      messages,
      id,
      tier,
    }: { messages: UIMessage[]; id?: string; tier?: string } = body;

    const modelConfig = resolveModel(tier || id);
    const selectedModel = modelConfig.modelId;
    const provider = modelConfig.provider;
    const lastMessage = messages[messages.length - 1];
    interface MessageMetadata {
      conversationId?: string;
    }
    const metadata =
      lastMessage?.metadata && typeof lastMessage.metadata === "object"
        ? (lastMessage.metadata as MessageMetadata)
        : null;
    const conversationId = metadata?.conversationId;

    // Check if user is blocked due to moderation violations
    if (await contentModerationService.shouldBlockUser(user.id)) {
      logger.warn("chat-api", "User blocked due to moderation violations", {
        userId: user.id,
      });
      return NextResponse.json(
        {
          error:
            "Your account has been suspended due to policy violations. Please contact support.",
        },
        { status: 403 },
      );
    }

    // Start async content moderation (runs in background, doesn't block)
    const lastMessageText =
      typeof lastMessage?.content === "string"
        ? lastMessage.content
        : (
            lastMessage?.content as Array<{ type: string; text?: string }>
          )?.find((c) => c.type === "text")?.text || "";

    if (lastMessageText) {
      contentModerationService.moderateInBackground(
        lastMessageText,
        user.id,
        conversationId,
        (result) => {
          logger.warn("chat-api", "Async moderation detected violation", {
            userId: user.id,
            categories: result.flaggedCategories,
            action: result.action,
          });
        },
      );
    }

    // Handle anonymous user rate limiting
    if (isAnonymous && anonymousSession) {
      // Check message limit for anonymous users
      const limitCheck = await checkAnonymousLimit(
        anonymousSession.session_token,
      );

      if (!limitCheck.allowed) {
        const errorMessage =
          limitCheck.reason === "message_limit"
            ? `You've reached your free message limit (${limitCheck.limit} messages). Sign up to continue chatting!`
            : `You've reached the hourly rate limit. Please wait an hour or sign up for unlimited access.`;

        logger.warn("chat-api", "Anonymous user limit reached", {
          userId: user.id,
          sessionId: anonymousSession.id,
          reason: limitCheck.reason,
          limit: limitCheck.limit,
        });

        return NextResponse.json(
          {
            error: errorMessage,
            requiresSignup: true,
            reason: limitCheck.reason,
            limit: limitCheck.limit,
            remaining: limitCheck.remaining,
          },
          { status: 429 },
        );
      }

      logger.info("chat-api", "Anonymous user message allowed", {
        userId: user.id,
        remaining: limitCheck.remaining,
        limit: limitCheck.limit,
      });
    }

    // For authenticated users: Check credit balance BEFORE starting stream
    if (!isAnonymous) {
      if (!user.organization_id || !user.organization) {
        logger.error("chat-api", "Organization not found for authenticated user", {
          userId: user.id,
          organizationId: user.organization_id,
        });
        return NextResponse.json(
          { error: "Organization not found for authenticated user" },
          { status: 500 },
        );
      }

      const balance = Number(user.organization.credit_balance) || 0;

      // STRICT CHECK: Block users with zero or negative balance immediately
      if (balance <= 0) {
        logger.warn("chat-api", "Zero or negative balance", {
          organizationId: user.organization_id,
          balance: user.organization.credit_balance,
        });
        return NextResponse.json(
          {
            error: "Insufficient balance",
            details: `Your credit balance is $${balance.toFixed(2)}. Please add credits to continue.`,
          },
          { status: 402 },
        );
      }

      // Also check against estimated cost for users with positive but low balance
      const messageText = messages
        .map((m) =>
          m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""),
        )
        .join(" ");
      const estimatedInputTokens = estimateTokens(messageText);
      const estimatedOutputTokens = 500;

      const { totalCost: estimatedCost } = await calculateCost(
        selectedModel,
        provider,
        estimatedInputTokens,
        estimatedOutputTokens,
      );

      // Ensure minimum cost of $0.01 to prevent bypass with 0-cost calculations
      const effectiveEstimatedCost = Math.max(estimatedCost, 0.01);

      if (balance < effectiveEstimatedCost) {
        logger.warn("chat-api", "Insufficient credits", {
          organizationId: user.organization_id,
          required: effectiveEstimatedCost,
          balance: balance,
        });
        return NextResponse.json(
          {
            error: "Insufficient balance",
            details: `Required: $${effectiveEstimatedCost.toFixed(4)}, Available: $${balance.toFixed(2)}`,
          },
          { status: 402 },
        );
      }
    }

    const result = streamText({
      model: gateway.languageModel(selectedModel),
      system: `You are a helpful AI assistant powered by elizaOS. You provide clear, accurate, and helpful responses.
      You are knowledgeable about AI agents, development, and technology.`,
      messages: convertToModelMessages(messages),
      onFinish: async ({ text, usage }) => {
        if (!usage) return;

        try {
          const userMessage = messages[messages.length - 1];

          const { inputCost, outputCost, totalCost } = await calculateCost(
            selectedModel,
            provider,
            usage.inputTokens || 0,
            usage.outputTokens || 0,
          );

          // CRITICAL PATH: Deduct credits first (blocking)
          let deductionResult: { success: boolean; newBalance: string } = {
            success: true,
            newBalance: "0",
          };

          if (!isAnonymous && user.organization_id) {
            const result = await creditsService.deductCredits({
              organizationId: user.organization_id!,
              amount: totalCost,
              description: `Chat completion: ${selectedModel}`,
              metadata: {
                user_id: user.id,
                model: selectedModel,
              },
            });

            deductionResult = {
              success: result.success,
              newBalance: String(result.newBalance),
            };

            if (!deductionResult.success) {
              logger.error(
                "chat-api",
                "CRITICAL: Failed to deduct credits after streaming - race condition detected",
                {
                  userId: user.id,
                  organizationId: user.organization_id,
                  cost: String(totalCost),
                  balance: deductionResult.newBalance,
                },
              );
              return;
            }
          }

          // PARALLEL OPERATIONS: Run all non-critical operations in parallel
          const parallelOperations = [];

          // 1. Anonymous session tracking (if applicable)
          if (isAnonymous && anonymousSession) {
            parallelOperations.push(
              anonymousSessionsService
                .incrementMessageCount(anonymousSession.id)
                .then(() => {
                  logger.info(
                    "chat-api",
                    "Incremented anonymous message count",
                    {
                      sessionId: anonymousSession.id,
                      newCount: anonymousSession.message_count + 1,
                    },
                  );
                }),
              anonymousSessionsService
                .addTokenUsage(
                  anonymousSession.id,
                  (usage.inputTokens || 0) + (usage.outputTokens || 0),
                )
                .then(() => {
                  logger.info(
                    "chat-api",
                    "Anonymous user token usage tracked",
                    {
                      userId: user.id,
                      tokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
                      model: selectedModel,
                    },
                  );
                }),
            );
          }

          // 2. Conversation messages (batch insert for efficiency)
          if (conversationId) {
            parallelOperations.push(
              conversationsService.addMessagesWithSequence(conversationId, [
                {
                  role: "user",
                  content: userMessage.parts
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join(""),
                  model: selectedModel,
                  tokens: usage.inputTokens,
                  cost: String(inputCost),
                },
                {
                  role: "assistant",
                  content: text,
                  model: selectedModel,
                  tokens: usage.outputTokens,
                  cost: String(outputCost),
                },
              ]),
            );
          }

          // 3. Usage record creation
          const usageRecordPromise = usageService.create({
            organization_id: user.organization_id || null,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "chat",
            model: selectedModel,
            provider: provider,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            input_cost: String(inputCost),
            output_cost: String(outputCost),
            is_successful: true,
          });

          parallelOperations.push(usageRecordPromise);

          // 4. Generation record creation (depends on usage record)
          if (apiKey || isAnonymous) {
            const userPrompt =
              messages[messages.length - 1]?.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("") || "";

            parallelOperations.push(
              usageRecordPromise.then((usageRecord) =>
                generationsService.create({
                  organization_id: user.organization_id || null,
                  user_id: user.id,
                  api_key_id: apiKey?.id || null,
                  type: "chat",
                  model: selectedModel,
                  provider: provider,
                  prompt: userPrompt,
                  status: "completed",
                  content: text,
                  tokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
                  cost: String(isAnonymous ? 0 : totalCost),
                  credits: String(isAnonymous ? 0 : totalCost),
                  usage_record_id: usageRecord.id,
                  completed_at: new Date(),
                  result: {
                    text: text,
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    totalTokens:
                      (usage.inputTokens || 0) + (usage.outputTokens || 0),
                  },
                }),
              ),
            );
          }

          // Wait for all parallel operations to complete
          await Promise.allSettled(parallelOperations);

          logger.info("chat-api", "Cost charged", {
            totalCost,
            inputCost,
            outputCost,
            newBalance: deductionResult.newBalance,
          });
        } catch (error) {
          logger.error(
            "chat-api",
            "Error persisting messages or deducting credits",
            { error: error instanceof Error ? error.message : "Unknown error" },
          );

          if (usage) {
            try {
              const errorUsageRecord = await usageService.create({
                organization_id: user.organization_id,
                user_id: user.id,
                api_key_id: apiKey?.id || null,
                type: "chat",
                model: selectedModel,
                provider: provider,
                input_tokens: usage.inputTokens || 0,
                output_tokens: usage.outputTokens || 0,
                input_cost: String(0),
                output_cost: String(0),
                is_successful: false,
                error_message:
                  error instanceof Error ? error.message : "Unknown error",
              });

              if (apiKey) {
                const userPrompt =
                  messages[messages.length - 1]?.parts
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join("") || "";
                await generationsService.create({
                  organization_id: user.organization_id,
                  user_id: user.id,
                  api_key_id: apiKey.id,
                  type: "chat",
                  model: selectedModel,
                  provider: provider,
                  prompt: userPrompt,
                  status: "failed",
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  usage_record_id: errorUsageRecord.id,
                  completed_at: new Date(),
                });
              }
            } catch (usageError) {
              logger.error("chat-api", "Error creating usage record", {
                error:
                  usageError instanceof Error
                    ? usageError.message
                    : "Unknown error",
              });
            }
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    logger.error("chat-api", "Error processing chat", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Response(JSON.stringify({ error: "Failed to process chat" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
