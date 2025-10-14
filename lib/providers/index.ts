// lib/providers/index.ts
import { VercelGatewayProvider } from "./vercel-gateway";
import type { AIProvider } from "./types";

export function getProvider(): AIProvider {
  const apiKey =
    process.env.VERCEL_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VERCEL_AI_GATEWAY_API_KEY or AI_GATEWAY_API_KEY not configured",
    );
  }
  return new VercelGatewayProvider(apiKey);
}
