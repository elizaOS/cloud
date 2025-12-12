import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { getOrCreateSessionUser } from "@/lib/session";
import { getProvider } from "@/lib/providers";
import type { OpenAIModelsResponse } from "@/lib/providers/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/models
 * Lists all available AI models in OpenAI-compatible format.
 * Supports both authenticated and anonymous users.
 *
 * @param request - The Next.js request object.
 * @returns OpenAI-compatible models list response.
 */
export async function GET(request: NextRequest) {
  // Support both authenticated and anonymous users
  try {
    await requireAuthOrApiKey(request);
  } catch {
    // Fallback to session user (creates anonymous if needed)
    await getOrCreateSessionUser(request);
  }

  const provider = getProvider();
  const response = await provider.listModels();
  const data: OpenAIModelsResponse = await response.json();

  // Return OpenAI-compatible format
  return Response.json(data);
}
