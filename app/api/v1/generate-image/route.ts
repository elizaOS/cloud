import { streamText } from "ai";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getAnonymousUser,
  getOrCreateAnonymousUser,
} from "@/lib/auth-anonymous";
import {
  usageService,
  creditsService,
  generationsService,
  discordService,
} from "@/lib/services";
import { IMAGE_GENERATION_COST } from "@/lib/pricing";
import { uploadBase64Image } from "@/lib/blob";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import type { UserWithOrganization } from "@/lib/types";

export const maxDuration = 30;

type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9" | "9:21";
type StylePreset =
  | "none"
  | "photographic"
  | "digital-art"
  | "comic-book"
  | "fantasy-art"
  | "analog-film"
  | "neon-punk"
  | "isometric"
  | "low-poly"
  | "origami"
  | "line-art"
  | "cinematic"
  | "3d-model";

interface GenerateImageRequest {
  prompt: string;
  numImages?: number;
  aspectRatio?: AspectRatio;
  stylePreset?: StylePreset;
}

interface AuthContext {
  user: UserWithOrganization;
  apiKey?: { id: string } | null;
  session_token?: string;
  isAnonymous: boolean;
}

/**
 * Authenticate user - supports both authenticated and anonymous users
 */
async function authenticateUser(req: NextRequest): Promise<AuthContext> {
  // Try authenticated user first
  try {
    const authResult = await requireAuthOrApiKey(req);
    return {
      user: authResult.user,
      apiKey: authResult.apiKey,
      session_token: authResult.session_token,
      isAnonymous: false,
    };
  } catch (authError) {
    // Fall back to anonymous user
    logger.info("[Generate Image] Privy auth failed, trying anonymous...");

    let anonData = await getAnonymousUser();

    if (!anonData) {
      logger.info(
        "[Generate Image] No session cookie - creating new anonymous session",
      );
      const newAnonData = await getOrCreateAnonymousUser();
      anonData = {
        user: newAnonData.user,
        session: newAnonData.session,
      };
      logger.info("[Generate Image] Created anonymous user:", anonData.user.id);
    } else {
      logger.info("[Generate Image] Anonymous user found:", anonData.user.id);
    }

    // Create a minimal UserWithOrganization for anonymous users
    const anonymousUser: UserWithOrganization = {
      ...anonData.user,
      organization_id: null,
      organization: null as unknown as UserWithOrganization["organization"],
    };

    return {
      user: anonymousUser,
      isAnonymous: true,
    };
  }
}

async function handlePOST(req: NextRequest) {
  let generationId: string | undefined;

  try {
    // Authenticate - supports both authenticated and anonymous users
    const authContext = await authenticateUser(req);
    const { user, apiKey, session_token, isAnonymous } = authContext;

    logger.info(
      `[Generate Image] Request from ${isAnonymous ? "anonymous" : "authenticated"} user: ${user.id}`,
    );

    const {
      prompt,
      numImages = 1,
      aspectRatio = "1:1",
      stylePreset,
    }: GenerateImageRequest = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return Response.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Calculate total cost based on number of images
    const totalCost = IMAGE_GENERATION_COST * numImages;

    // Only create generation record for authenticated users with an organization
    if (!isAnonymous && user.organization_id) {
      const generation = await generationsService.create({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "image",
        model: "google/gemini-2.5-flash-image-preview",
        provider: "google",
        prompt: prompt,
        status: "pending",
        credits: String(totalCost),
        cost: String(totalCost),
      });
      generationId = generation.id;
    }

    // Build enhanced prompt with options
    let enhancedPrompt = prompt;

    // Add style preset to prompt if specified
    if (stylePreset && stylePreset !== "none") {
      const styleDescriptions: Record<StylePreset, string> = {
        none: "",
        photographic:
          "in a photographic style with realistic lighting and details",
        "digital-art":
          "in a digital art style with vibrant colors and modern aesthetics",
        "comic-book":
          "in a comic book style with bold lines and dramatic shading",
        "fantasy-art":
          "in a fantasy art style with magical and ethereal elements",
        "analog-film":
          "in an analog film photography style with film grain and vintage tones",
        "neon-punk": "in a neon punk cyberpunk style with glowing neon colors",
        isometric: "in an isometric perspective style with geometric precision",
        "low-poly": "in a low-poly 3D style with geometric facets",
        origami: "in an origami paper-folding style",
        "line-art": "in a clean line art style with minimal shading",
        cinematic:
          "in a cinematic style with dramatic lighting and composition",
        "3d-model": "as a high-quality 3D rendered model",
      };

      enhancedPrompt += ` ${styleDescriptions[stylePreset]}`;
    }

    // Add aspect ratio guidance
    const aspectRatioDescriptions: Record<AspectRatio, string> = {
      "1:1": "square composition",
      "16:9": "wide landscape composition",
      "9:16": "tall portrait composition",
      "4:3": "landscape composition",
      "3:4": "portrait composition",
      "21:9": "ultra-wide cinematic composition",
      "9:21": "ultra-tall vertical composition",
    };

    enhancedPrompt += `, ${aspectRatioDescriptions[aspectRatio]}`;

    logger.info(
      `[Generate Image] Generating ${numImages} image(s) for ${isAnonymous ? "anonymous" : "authenticated"} user with prompt: ${enhancedPrompt.substring(0, 100)}...`,
    );

    // Function to generate a single image
    async function generateSingleImage(): Promise<{
      imageBase64: string;
      textResponse: string;
      mimeType: string;
    } | null> {
      const result = streamText({
        model: "google/gemini-2.5-flash-image-preview",
        providerOptions: {
          google: { responseModalities: ["TEXT", "IMAGE"] },
        },
        prompt: `Generate an image: ${enhancedPrompt}`,
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
        return null;
      }

      const mimeTypeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

      return { imageBase64, textResponse, mimeType };
    }

    // Generate multiple images in parallel
    const imagePromises = Array.from({ length: numImages }, () =>
      generateSingleImage(),
    );
    const results = await Promise.all(imagePromises);

    // Filter out any failed generations
    const successfulResults = results.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    if (successfulResults.length === 0) {
      // Only create usage record for authenticated users
      if (!isAnonymous && user.organization_id) {
        const usageRecord = await usageService.create({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "image",
          model: "google/gemini-2.5-flash-image-preview",
          provider: "google",
          input_tokens: 0,
          output_tokens: 0,
          input_cost: String(0),
          output_cost: String(0),
          is_successful: false,
          error_message: "No images were generated",
        });

        if (generationId) {
          await generationsService.update(generationId, {
            status: "failed",
            error: "No images were generated",
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
          });
        }
      }

      return Response.json(
        { error: "No images were generated" },
        { status: 500 },
      );
    }

    // Calculate actual cost based on successful images
    const actualCost = IMAGE_GENERATION_COST * successfulResults.length;
    let deductionResult: { success: boolean; newBalance: number } = {
      success: true,
      newBalance: 0,
    };

    // Only deduct credits for authenticated users with an organization
    if (!isAnonymous && user.organization_id) {
      deductionResult = await creditsService.deductCredits({
        organizationId: user.organization_id,
        amount: actualCost,
        description: `Image generation (${successfulResults.length}x): google/gemini-2.5-flash-image-preview`,
        metadata: { user_id: user.id },
        session_token,
      });

      // Fail the request if credit deduction fails for authenticated users
      if (!deductionResult.success) {
        logger.error(
          "[Generate Image] Failed to deduct credits - insufficient balance",
          {
            organizationId: user.organization_id,
            cost: String(actualCost),
            balance: deductionResult.newBalance,
          },
        );

        return Response.json(
          {
            error: "Insufficient credits to complete image generation",
            required: actualCost,
            available: deductionResult.newBalance,
          },
          { status: 402 }, // Payment Required
        );
      }
    } else {
      logger.info(
        `[Generate Image] Anonymous user - skipping credit deduction`,
      );
    }

    // Only create usage record for authenticated users
    let usageRecordId: string | undefined;
    if (!isAnonymous && user.organization_id) {
      const usageRecord = await usageService.create({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "image",
        model: "google/gemini-2.5-flash-image-preview",
        provider: "google",
        input_tokens: 0,
        output_tokens: 0,
        input_cost: String(actualCost),
        output_cost: String(0),
        is_successful: true,
      });
      usageRecordId = usageRecord.id;
    }

    // Upload all images to Vercel Blob
    const uploadResults: Array<{
      imageBase64: string;
      textResponse: string;
      mimeType: string;
      blobUrl: string;
      fileSize: bigint | null;
    }> = [];

    for (let index = 0; index < successfulResults.length; index++) {
      const result = successfulResults[index];
      const { imageBase64, textResponse, mimeType } = result;
      let blobUrl = imageBase64;
      let fileSize: bigint | null = null;

      try {
        const fileExtension = mimeType.split("/")[1] || "png";
        const blobResult = await uploadBase64Image(imageBase64, {
          filename: `${generationId || user.id}-${index}.${fileExtension}`,
          folder: "images",
          userId: user.id,
        });
        blobUrl = blobResult.url;
        fileSize = blobResult.size ? BigInt(blobResult.size) : null;
        logger.info(
          `[Generate Image] Uploaded image ${index + 1} to Vercel Blob: ${blobUrl} (${blobResult.size} bytes)`,
        );
      } catch (blobError) {
        logger.error(
          `[Generate Image] Failed to upload image ${index + 1} to Vercel Blob:`,
          blobError instanceof Error ? blobError.message : String(blobError),
        );
        // Continue with base64 as fallback
      }

      uploadResults.push({
        imageBase64,
        textResponse,
        mimeType,
        blobUrl,
        fileSize,
      });
    }

    // Prepare images for JSON response (convert BigInt to number)
    // IMPORTANT: Do NOT include base64 data in response - it causes massive token bloat
    // when stored in conversation context. Only return the blob URL.
    const uploadedImages = uploadResults.map((result) => {
      const hasBlobUrl = result.blobUrl !== result.imageBase64;
      return {
        // Only include base64 as fallback if blob upload failed
        // This prevents token explosion in conversation context
        ...(hasBlobUrl ? {} : { image: result.imageBase64 }),
        url: hasBlobUrl ? result.blobUrl : undefined,
        text: result.textResponse,
        mimeType: result.mimeType,
        fileSize: result.fileSize ? Number(result.fileSize) : undefined,
      };
    });

    // Update generation record for authenticated users
    if (generationId && usageRecordId) {
      await generationsService.update(generationId, {
        status: "completed",
        content: uploadResults[0].imageBase64,
        storage_url: uploadResults[0].blobUrl,
        mime_type: uploadResults[0].mimeType,
        file_size: uploadResults[0].fileSize,
        usage_record_id: usageRecordId,
        completed_at: new Date(),
        result: {
          images: uploadedImages,
          numImages: successfulResults.length,
          aspectRatio,
          stylePreset,
        },
      });
    }

    if (!isAnonymous) {
      logger.info(
        `[Generate Image] Generated ${successfulResults.length} image(s), Cost: $${actualCost.toFixed(2)}, New balance: $${deductionResult.newBalance.toFixed(2)}`,
      );
    } else {
      logger.info(
        `[Generate Image] Generated ${successfulResults.length} image(s) for anonymous user (no charge)`,
      );
    }

    // Log to Discord only for authenticated users with organization
    if (
      !isAnonymous &&
      user.organization_id &&
      user.organization &&
      uploadResults.length > 0 &&
      uploadResults[0].blobUrl !== uploadResults[0].imageBase64
    ) {
      discordService
        .logImageGenerated({
          generationId: generationId || "unknown",
          prompt: prompt,
          imageUrl: uploadResults[0].blobUrl,
          userName: user.name || user.email || null,
          userId: user.id,
          organizationName: user.organization.name,
          numImages: successfulResults.length,
          aspectRatio: aspectRatio,
          model: "google/gemini-2.5-flash-image-preview",
        })
        .catch((error) => {
          logger.error(
            "[Generate Image] Failed to log to Discord:",
            error instanceof Error ? error.message : String(error),
          );
        });
    }

    return Response.json({
      images: uploadedImages,
      numImages: successfulResults.length,
    });
  } catch (error) {
    logger.error(
      "[Generate Image] Error:",
      error instanceof Error ? error.message : String(error),
    );
    const errorMessage =
      error instanceof Error ? error.message : "Image generation failed";

    if (generationId) {
      try {
        await generationsService.update(generationId, {
          status: "failed",
          error: errorMessage,
          completed_at: new Date(),
        });
      } catch (updateError) {
        logger.error(
          "[Generate Image] Failed to update generation record:",
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
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

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);
