// app/api/v1/models/[...model]/route.ts
import { requireAuthOrApiKey } from "@/lib/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ model: string[] }> },
) {
  try {
    await requireAuthOrApiKey(request);

    const resolvedParams = await context.params;
    const modelSegments = resolvedParams.model;
    
    // Validate that we have model segments
    if (!modelSegments || modelSegments.length === 0) {
      return Response.json(
        {
          error: {
            message: "Model parameter is required",
            type: "invalid_request_error",
            code: "missing_parameter",
          },
        },
        { status: 400 },
      );
    }
    
    // Join segments to support both "openai/gpt-4o-mini" and "openai%2Fgpt-4o-mini"
    const model = modelSegments.join("/");
    
    const gatewayKey = process.env.VERCEL_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;

    if (!gatewayKey) {
      throw new Error("VERCEL_AI_GATEWAY_API_KEY or AI_GATEWAY_API_KEY not configured");
    }

    // Forward to Vercel AI Gateway
    const response = await fetch(
      `https://ai-gateway.vercel.sh/v1/models/${model}`,
      {
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json(
          {
            error: {
              message: `Model '${model}' not found`,
              type: "invalid_request_error",
              code: "model_not_found",
            },
          },
          { status: 404 },
        );
      }
      throw new Error(`Gateway error: ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching model:", error);
    return Response.json(
      {
        error: {
          message: "Failed to fetch model details",
          type: "api_error",
        },
      },
      { status: 500 },
    );
  }
}

