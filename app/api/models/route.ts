import { gateway } from "@ai-sdk/gateway";

// Cache for 1 hour
export const revalidate = 3600;

export async function GET() {
  try {
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
