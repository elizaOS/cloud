import { requireAuthOrApiKey } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import type { OpenAIModelsResponse } from "@/lib/providers/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Using shared OpenAIModelsResponse type

export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKey(request);

    const provider = getProvider();
    const response = await provider.listModels();
    const data: OpenAIModelsResponse = await response.json();

    // Transform to expected format for UI compatibility
    const models = data.data.map((model) => ({
      id: model.id,
      name: model.id,
      provider: model.owned_by,
    }));

    // Return both OpenAI format and UI-friendly format
    return Response.json({
      ...data,
      models, // UI-friendly format
    });
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
