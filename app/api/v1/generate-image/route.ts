import { streamText } from "ai";
import { requireAuthOrApiKey } from "@/lib/auth";
import { createUsageRecord } from "@/lib/queries/usage";
import { deductCredits } from "@/lib/queries/credits";
import { createGeneration, updateGeneration } from "@/lib/queries/generations";
import { IMAGE_GENERATION_COST } from "@/lib/pricing";
import { uploadBase64Image } from "@/lib/blob";
import type { NextRequest } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let generationId: string | undefined;
  try {
    const { user, apiKey } = await requireAuthOrApiKey(req);
    const { prompt }: { prompt: string } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return Response.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const generation = await createGeneration({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "image",
      model: "google/gemini-2.5-flash-image-preview",
      provider: "google",
      prompt: prompt,
      status: "pending",
      credits: IMAGE_GENERATION_COST,
      cost: IMAGE_GENERATION_COST,
    });

    generationId = generation.id;

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
      const usageRecord = await createUsageRecord({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "image",
        model: "google/gemini-2.5-flash-image-preview",
        provider: "google",
        input_tokens: 0,
        output_tokens: 0,
        input_cost: 0,
        output_cost: 0,
        is_successful: false,
        error_message: "No image was generated",
      });

      if (generationId) {
        await updateGeneration(generationId, {
          status: "failed",
          error: "No image was generated",
          usage_record_id: usageRecord.id,
          completed_at: new Date(),
        });
      }

      return Response.json(
        { error: "No image was generated" },
        { status: 500 },
      );
    }

    const deductionResult = await deductCredits(
      user.organization_id,
      IMAGE_GENERATION_COST,
      "Image generation: google/gemini-2.5-flash-image-preview",
      user.id,
    );

    if (!deductionResult.success) {
      console.error(
        "[IMAGE GENERATION] Failed to deduct credits - insufficient balance",
      );
    }

    const usageRecord = await createUsageRecord({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "image",
      model: "google/gemini-2.5-flash-image-preview",
      provider: "google",
      input_tokens: 0,
      output_tokens: 0,
      input_cost: IMAGE_GENERATION_COST,
      output_cost: 0,
      is_successful: true,
    });

    const mimeTypeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

    // Upload to Vercel Blob
    let blobUrl = imageBase64;
    let fileSize: bigint | null = null;
    try {
      const fileExtension = mimeType.split("/")[1] || "png";
      const blobResult = await uploadBase64Image(imageBase64, {
        filename: `${generationId}.${fileExtension}`,
        folder: "images",
        userId: user.id,
      });
      blobUrl = blobResult.url;
      fileSize = blobResult.size ? BigInt(blobResult.size) : null;
      console.log(
        `[IMAGE GENERATION] Uploaded to Vercel Blob: ${blobUrl} (${blobResult.size} bytes)`,
      );
    } catch (blobError) {
      console.error(
        "[IMAGE GENERATION] Failed to upload to Vercel Blob:",
        blobError,
      );
      // Continue with base64 as fallback
    }

    if (generationId) {
      await updateGeneration(generationId, {
        status: "completed",
        content: imageBase64,
        storage_url: blobUrl,
        mime_type: mimeType,
        file_size: fileSize,
        usage_record_id: usageRecord.id,
        completed_at: new Date(),
        result: {
          image: imageBase64,
          text: textResponse,
          blobUrl: blobUrl !== imageBase64 ? blobUrl : undefined,
        },
      });
    }

    console.log(
      `[IMAGE GENERATION] Credits deducted: ${IMAGE_GENERATION_COST}, New balance: ${deductionResult.newBalance}`,
    );

    return Response.json({
      image: imageBase64,
      url: blobUrl !== imageBase64 ? blobUrl : undefined,
      text: textResponse,
      finishReason: await result.finishReason,
    });
  } catch (error) {
    console.error("[IMAGE GENERATION] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Image generation failed";

    if (generationId) {
      try {
        await updateGeneration(generationId, {
          status: "failed",
          error: errorMessage,
          completed_at: new Date(),
        });
      } catch (updateError) {
        console.error(
          "[IMAGE GENERATION] Failed to update generation record:",
          updateError,
        );
      }
    }

    return Response.json(
      { error: errorMessage },
      {
        status:
          error instanceof Error && error.message.includes("API key")
            ? 401
            : 500,
      },
    );
  }
}
