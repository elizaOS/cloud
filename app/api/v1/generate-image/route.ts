import { streamText } from "ai";
import { requireAuthOrApiKey } from '@/lib/auth';
import { createUsageRecord } from '@/lib/queries/usage';
import { deductCredits } from '@/lib/queries/credits';
import type { NextRequest } from 'next/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { user, apiKey, authMethod } = await requireAuthOrApiKey(req);
    const { prompt }: { prompt: string } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return Response.json(
        { error: 'Prompt is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const result = streamText({
      model: "google/gemini-2.5-flash-image-preview",
      providerOptions: {
        google: { responseModalities: ["TEXT", "IMAGE"] },
      },
      prompt: `Generate an image: ${prompt}`,
    });

    let imageBase64: string | null = null;
    let textResponse = "";

    for await (const delta of result.fullStream) {
      switch (delta.type) {
        case "text-delta": {
          textResponse += delta.text;
          break;
        }

        case "file": {
          if (delta.file.mediaType.startsWith("image/")) {
            const uint8Array = delta.file.uint8Array;
            const base64 = Buffer.from(uint8Array).toString("base64");
            const mimeType = delta.file.mediaType || "image/png";
            imageBase64 = `data:${mimeType};base64,${base64}`;
            break;
          }
          break;
        }
      }
    }

    if (!imageBase64) {
      await createUsageRecord({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: 'image',
        model: 'google/gemini-2.5-flash-image-preview',
        provider: 'google',
        input_tokens: 0,
        output_tokens: 0,
        input_cost: 0,
        output_cost: 0,
        is_successful: false,
        error_message: 'No image was generated',
      });

      return Response.json(
        { error: "No image was generated" },
        { status: 500 }
      );
    }

    const imageCost = 100;
    const deductionResult = await deductCredits(
      user.organization_id,
      imageCost,
      'Image generation: google/gemini-2.5-flash-image-preview',
      user.id
    );

    if (!deductionResult.success) {
      console.error('[IMAGE GENERATION] Failed to deduct credits - insufficient balance');
    }

    await createUsageRecord({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: 'image',
      model: 'google/gemini-2.5-flash-image-preview',
      provider: 'google',
      input_tokens: 0,
      output_tokens: 0,
      input_cost: imageCost,
      output_cost: 0,
      is_successful: true,
    });

    console.log(`[IMAGE GENERATION] Credits deducted: ${imageCost}, New balance: ${deductionResult.newBalance}`);

    return Response.json({
      image: imageBase64,
      text: textResponse,
      finishReason: await result.finishReason,
    });
  } catch (error) {
    console.error('[IMAGE GENERATION] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Image generation failed';
    return Response.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes('API key') ? 401 : 500 }
    );
  }
}
