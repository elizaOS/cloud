import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  conversationsService,
  creditsService,
  usageService,
  generationsService,
  organizationsService,
} from "@/lib/services";
import {
  calculateCost,
  getProviderFromModel,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 60;

async function handlePOST(req: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKey(req);
    const body = await req.json();
    const { messages, id }: { messages: UIMessage[]; id?: string } = body;

    const selectedModel = id || "gpt-4o";
    const provider = getProviderFromModel(selectedModel);
    const lastMessage = messages[messages.length - 1];
    const conversationId = lastMessage?.metadata
      ? (lastMessage.metadata as { conversationId?: string }).conversationId
      : undefined;

    // CRITICAL FIX: Check credit balance BEFORE starting stream to prevent free service
    // Estimate cost based on input messages
    const messageText = messages
      .map((m) =>
        m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""),
      )
      .join(" ");
    const estimatedInputTokens = estimateTokens(messageText);
    const estimatedOutputTokens = 500; // Conservative estimate for streaming response

    const { totalCost: estimatedCost } = await calculateCost(
      selectedModel,
      provider,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    // Check organization balance
    const org = await organizationsService.getById(user.organization_id);
    if (!org) {
      logger.error("chat-api", "Organization not found", {
        organizationId: user.organization_id,
      });
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    if (org.credit_balance < estimatedCost) {
      logger.warn("chat-api", "Insufficient credits", {
        organizationId: user.organization_id,
        required: estimatedCost,
        balance: org.credit_balance,
      });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          details: `Required: ${estimatedCost}, Available: ${org.credit_balance}`,
        },
        { status: 402 },
      );
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

          const deductionResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: totalCost,
            description: `Chat completion: ${selectedModel}`,
            metadata: {
              user_id: user.id,
              model: selectedModel,
            },
          });

          if (!deductionResult.success) {
            // CRITICAL: This should rarely happen since we checked credits before streaming
            // But it can happen if credits were spent elsewhere between check and stream completion
            logger.error(
              "chat-api",
              "CRITICAL: Failed to deduct credits after streaming - race condition detected",
              {
                userId: user.id,
                organizationId: user.organization_id,
                cost: totalCost,
                balance: deductionResult.newBalance,
              },
            );
            // Stream has already completed, so we can't return an error
            // This should trigger an alert for manual review
          }

          if (conversationId) {
            // Add user message
            await conversationsService.addMessageWithSequence(conversationId, {
              role: "user",
              content: userMessage.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join(""),
              model: selectedModel,
              tokens: usage.inputTokens,
              cost: inputCost,
            });

            // Add assistant message
            await conversationsService.addMessageWithSequence(conversationId, {
              role: "assistant",
              content: text,
              model: selectedModel,
              tokens: usage.outputTokens,
              cost: outputCost,
            });
          }

          const usageRecord = await usageService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "chat",
            model: selectedModel,
            provider: provider,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            input_cost: inputCost,
            output_cost: outputCost,
            is_successful: true,
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
              status: "completed",
              content: text,
              tokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
              cost: totalCost,
              credits: totalCost,
              usage_record_id: usageRecord.id,
              completed_at: new Date(),
              result: {
                text: text,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens:
                  (usage.inputTokens || 0) + (usage.outputTokens || 0),
              },
            });
          }

          logger.info("chat-api", "Credits deducted", {
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
                input_cost: 0,
                output_cost: 0,
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
