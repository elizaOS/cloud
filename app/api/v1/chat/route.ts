import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  conversationsService,
  creditsService,
  usageService,
  generationsService,
} from "@/lib/services";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
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

          const deductionResult = await creditsService.deductCredits(
            user.organization_id,
            totalCost,
            `Chat completion: ${selectedModel}`,
            {
              user_id: user.id,
              model: selectedModel,
            },
          );

          if (!deductionResult.success) {
            logger.error(
              "chat-api",
              "Failed to deduct credits - insufficient balance",
              { userId: user.id, totalCost }
            );
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
            { error: error instanceof Error ? error.message : "Unknown error" }
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
                error: usageError instanceof Error ? usageError.message : "Unknown error",
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
