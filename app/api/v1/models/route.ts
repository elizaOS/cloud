import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKey } from '@/lib/auth';
import type { NextRequest } from 'next/server';

// Cache for 1 hour
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKey(request);

    const response = await gateway.getAvailableModels();

    // getAvailableModels returns a response with models array
    const modelsList = response.models || [];

    return Response.json({
      models: modelsList.map(
        (model: { id: string; name?: string; provider?: string }) => ({
          id: model.id,
          name: model.name || model.id,
          ...(model.provider && { provider: model.provider }),
        })
      ),
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    return Response.json(
      { error: "Failed to fetch available models" },
      { status: 500 }
    );
  }
}
