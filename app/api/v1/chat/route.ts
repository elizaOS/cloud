import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKey } from "@/lib/auth";
import { addMessageWithSequence } from "@/lib/queries/conversations";
import { deductCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { createGeneration } from "@/lib/queries/generations";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
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
      onFinish: ({ text, usage }) => {
        (async () => {
          if (!usage) return;

          try {
            const userMessage = messages[messages.length - 1];

            const { inputCost, outputCost, totalCost } = await calculateCost(
              selectedModel,
              provider,
              usage.inputTokens || 0,
              usage.outputTokens || 0,
            );

            if (conversationId) {
              await addMessageWithSequence(conversationId, {
                role: "user",
                content: userMessage.parts
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join(""),
                model: selectedModel,
                tokens: usage.inputTokens,
                cost: inputCost,
              });

              await addMessageWithSequence(conversationId, {
                role: "assistant",
                content: text,
                model: selectedModel,
                tokens: usage.outputTokens,
                cost: outputCost,
              });
            }

            const deductionResult = await deductCredits(
              user.organization_id,
              totalCost,
              `Chat completion: ${selectedModel}`,
              user.id,
            );

            if (!deductionResult.success) {
              console.error(
                "[CHAT API] Failed to deduct credits - insufficient balance",
              );
            }

            const usageRecord = await createUsageRecord({
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
              await createGeneration({
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

            console.log(
              `[CHAT API] Credits deducted: ${totalCost} (Input: ${inputCost}, Output: ${outputCost}), New balance: ${deductionResult.newBalance}`,
            );
          } catch (error) {
            console.error(
              "[CHAT API] Error persisting messages or deducting credits:",
              error,
            );

            if (usage) {
              try {
                const errorUsageRecord = await createUsageRecord({
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
                  await createGeneration({
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
                console.error(
                  "[CHAT API] Error creating usage record:",
                  usageError,
                );
              }
            }
          }
        })().catch((err) => {
          console.error("[CHAT API] Background operation failed:", err);
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[CHAT API] Error:", error);
    return new Response(JSON.stringify({ error: "Failed to process chat" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
