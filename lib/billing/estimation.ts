import {
  calculateCost,
  getProviderFromModel,
  estimateTokens,
} from "@/lib/pricing";
import { COST_BUFFER, MIN_RESERVATION, DEFAULT_OUTPUT_TOKENS } from "./types";

export { estimateTokens } from "@/lib/pricing";

export const ESTIMATED_COSTS = {
  chat_small: 0.005,
  chat_large: 0.02,
  chat_xlarge: 0.05,
  image_gen: 0.05,
  video_gen: 0.5,
  voice_tts: 0.015,
  voice_stt: 0.01,
  mcp_call: 0.02,
  a2a_call: 0.03,
} as const;

export type OperationType = keyof typeof ESTIMATED_COSTS;

export function getEstimatedCost(operation: OperationType): number {
  return ESTIMATED_COSTS[operation];
}

export async function estimateRequestCost(
  model: string,
  messages: Array<{ role: string; content: string | object }>,
): Promise<number> {
  const provider = getProviderFromModel(model);
  const messageText = messages
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    )
    .join(" ");

  const { totalCost } = await calculateCost(
    model,
    provider,
    estimateTokens(messageText),
    DEFAULT_OUTPUT_TOKENS,
  );

  return Math.max(totalCost * COST_BUFFER, MIN_RESERVATION);
}
