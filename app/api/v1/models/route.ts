import type { NextRequest } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import {
  getAiProviderConfigurationError,
  hasAnyAiProviderConfigured,
} from "@/lib/providers/language-model";
import { getCachedMergedModelCatalog } from "@/lib/services/model-catalog";
import { logger } from "@/lib/utils/logger";

// This route uses cookies for auth, so it must be dynamic
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/models
 * Lists all available AI models in OpenAI-compatible format.
 * Supports both authenticated and anonymous users.
 * Response is cached for 1 hour since model list rarely changes.
 *
 * @param request - The Next.js request object.
 * @returns OpenAI-compatible models list response.
 */
export async function GET(request: NextRequest) {
  try {
    // Models are public; auth/session probing should never turn a catalog read into a 500.
    try {
      await requireAuthOrApiKey(request);
    } catch {
      await getAnonymousUser();
    }

    if (!hasAnyAiProviderConfigured()) {
      return Response.json(
        {
          error: {
            message: getAiProviderConfigurationError(),
            type: "service_unavailable",
          },
        },
        { status: 503 },
      );
    }

    // Return OpenAI-compatible format with cache headers
    return Response.json(
      {
        object: "list",
        data: await getCachedMergedModelCatalog(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      },
    );
  } catch (error) {
    logger.error("Error fetching models:", error);
    return Response.json(
      {
        error: {
          message: "Failed to fetch available models",
          type: "api_error",
        },
      },
      { status: 500 },
    );
  }
}
