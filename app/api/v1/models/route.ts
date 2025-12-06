import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getAnonymousUser,
  getOrCreateAnonymousUser,
} from "@/lib/auth-anonymous";
import { getProvider } from "@/lib/providers";
import type { OpenAIModelsResponse } from "@/lib/providers/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Using shared OpenAIModelsResponse type

export async function GET(request: NextRequest) {
  try {
    // Support both authenticated and anonymous users
    try {
      await requireAuthOrApiKey(request);
    } catch (error) {
      // Fallback to anonymous user
      const anonData = await getAnonymousUser();
      if (!anonData) {
        // Create new anonymous session if none exists
        await getOrCreateAnonymousUser();
      }
    }

    const provider = getProvider();
    const response = await provider.listModels();
    const data: OpenAIModelsResponse = await response.json();

    // Return OpenAI-compatible format
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching models:", error);
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
