import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { uploadBase64Image } from "@/lib/blob";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { getProviderFromModel } from "@/lib/pricing";
import { hasOpenRouterProviderConfigured } from "@/lib/providers";
import { billFlatUsage } from "@/lib/services/ai-billing";
import { calculateImageGenerationCostFromCatalog } from "@/lib/services/ai-pricing";
import {
  getSupportedImageModelDefinition,
  SUPPORTED_IMAGE_MODEL_IDS,
} from "@/lib/services/ai-pricing-definitions";
import { appsService } from "@/lib/services/apps";
import {
  type CreditReservation,
  creditsService,
  InsufficientCreditsError,
} from "@/lib/services/credits";
import { discordService } from "@/lib/services/discord";
import { generationsService } from "@/lib/services/generations";
import { usageService } from "@/lib/services/usage";
import type { UserWithOrganization } from "@/lib/types";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 180; // 3 minutes for image generation

// CORS headers - fully open, security via auth tokens
function getCorsHeaders(_origin: string | null) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

/**
 * Valid image generation models
 *
 */
const ALLOWED_IMAGE_MODELS = [...SUPPORTED_IMAGE_MODEL_IDS];

function getImageProvider(modelId: string): string {
  if (modelId.includes("/")) {
    return modelId.split("/")[0];
  }
  return "google";
}

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
  sourceImage?: string; // Base64 data URL for image-to-image generation
  model?: string; // Image model to use (defaults to gemini-2.5-flash-image)
}

interface AuthContext {
  user: UserWithOrganization;
  apiKey?: { id: string } | null;
  session_token?: string;
}

/**
 * Authenticate user - requires valid auth or API key.
 * Anonymous users are not allowed to generate images.
 */
async function authenticateUser(req: NextRequest): Promise<AuthContext> {
  const authResult = await requireAuthOrApiKey(req);
  return {
    user: authResult.user,
    apiKey: authResult.apiKey,
    session_token: authResult.session_token,
  };
}

/**
 * POST /api/v1/generate-image
 * Generates images using AI models.
 * Supports both authenticated and anonymous users with rate limiting.
 *
 * @param req - Request body with prompt, optional numImages, aspectRatio, and stylePreset.
 * @returns Generated image URLs and generation metadata.
 */
async function handlePOST(req: NextRequest) {
  let generationId: string | undefined;
  let imageServiceUnavailable = false;

  try {
    // Authenticate - require valid credentials, no anonymous fallback
    let authContext: AuthContext;
    try {
      authContext = await authenticateUser(req);
    } catch {
      return Response.json(
        {
          error: "Authentication required. Provide a valid session or API key.",
        },
        { status: 401 },
      );
    }
    const { user, apiKey } = authContext;

    const requestBody = await req.json();
    const {
      prompt,
      numImages = 1,
      aspectRatio = "1:1",
      stylePreset,
      sourceImage,
      model: requestedModel,
    }: GenerateImageRequest = requestBody;
    const affiliateCode = req.headers.get("X-Affiliate-Code");

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return Response.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (prompt.length > 4000) {
      return Response.json(
        { error: "Prompt must be 4000 characters or fewer" },
        { status: 400 },
      );
    }

    if (
      typeof numImages !== "number" ||
      !Number.isInteger(numImages) ||
      numImages < 1 ||
      numImages > 4
    ) {
      return Response.json(
        { error: "numImages must be an integer between 1 and 4" },
        { status: 400 },
      );
    }

    if (sourceImage !== undefined) {
      if (typeof sourceImage !== "string") {
        return Response.json(
          { error: "sourceImage must be a base64 data URL string" },
          { status: 400 },
        );
      }
      // ~10 MB base64 limit (base64 overhead ~33%: 10MB * 1.37 ≈ 13.7MB chars)
      const MAX_SOURCE_IMAGE_CHARS = 14_000_000;
      if (sourceImage.length > MAX_SOURCE_IMAGE_CHARS) {
        return Response.json(
          { error: "sourceImage exceeds maximum allowed size" },
          { status: 400 },
        );
      }
    }

    // Image generation depends on OpenRouter resolving image-capable models.
    // Fail fast so local and CI environments without OpenRouter credentials return
    // a stable 503 instead of surfacing an internal provider exception from streamText().
    if (!hasOpenRouterProviderConfigured()) {
      return Response.json(
        { error: "Image generation service is not configured" },
        { status: 503 },
      );
    }

    // Validate and select image model
    const isModelAllowed =
      requestedModel && ALLOWED_IMAGE_MODELS.includes(requestedModel);
    const imageModel = isModelAllowed ? requestedModel : DEFAULT_IMAGE_MODEL;
    const imageProvider = getImageProvider(imageModel);
    const imagePricingDimensions =
      getSupportedImageModelDefinition(imageModel)?.defaultDimensions ??
      undefined;

    // Calculate total cost based on number of images
    const estimatedCost = (
      await calculateImageGenerationCostFromCatalog({
        model: imageModel,
        provider: imageProvider,
        imageCount: numImages,
        dimensions: imagePricingDimensions,
      })
    ).totalCost;

    // Reserve credits BEFORE generation to prevent TOCTOU race condition
    let reservation: CreditReservation;
    if (user.organization_id) {
      try {
        reservation = await creditsService.reserve({
          organizationId: user.organization_id,
          amount: estimatedCost,
          userId: user.id,
          description: `Image generation (${numImages}x): ${imageModel}`,
        });
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          return Response.json(
            {
              error: "Insufficient credits for image generation",
              required: error.required,
            },
            { status: 402 },
          );
        }
        throw error;
      }
    } else {
      // Authenticated user without an organization - this shouldn't normally happen
      // but handle gracefully by creating a no-op reservation
      reservation = creditsService.createAnonymousReservation();
    }

    // Create generation record for authenticated users with an organization
    if (user.organization_id) {
      const generation = await generationsService.create({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "image",
        model: imageModel,
        provider: imageProvider,
        prompt: prompt,
        status: "pending",
        credits: String(estimatedCost),
        cost: String(estimatedCost),
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

    // Function to generate a single image
    async function generateSingleImage(): Promise<{
      imageBase64: string;
      textResponse: string;
      mimeType: string;
    } | null> {
      // Detect provider from model - use centralized helper for robustness
      // This handles gateway aliases that may route models without explicit prefixes
      const isOpenAIModel = getProviderFromModel(imageModel) === "openai";

      // Build the request based on provider and whether we have a source image
      let streamConfig: Parameters<typeof streamText>[0];

      if (isOpenAIModel) {
        // OpenAI models use tools for image generation per AI SDK docs:
        // https://sdk.vercel.ai/docs/ai-sdk-core/image-generation#openai-models-with-image-generation-tool
        // The bare `prompt` field is valid here - AI SDK internally converts it to messages format.
        // Images are returned as tool-result events (handled below in the stream processor).
        streamConfig = {
          model: imageModel,
          prompt: `Generate an image: ${enhancedPrompt}`,
          tools: {
            image_generation: openai.tools.imageGeneration({
              outputFormat: "webp",
              quality: "high",
            }),
          },
        };

        // For image-to-image with OpenAI, include the source image in the prompt
        if (sourceImage) {
          const mediaTypeMatch = sourceImage.match(/^data:([^;]+);base64,/);
          const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/png";
          const base64Data = sourceImage.replace(/^data:[^;]+;base64,/, "");

          streamConfig = {
            model: imageModel,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    image: base64Data,
                    mediaType: mediaType,
                  },
                  {
                    type: "text",
                    text: `Using the provided image as a reference, generate a new image: ${enhancedPrompt}`,
                  },
                ],
              },
            ],
            tools: {
              image_generation: openai.tools.imageGeneration({
                outputFormat: "webp",
                quality: "high",
              }),
            },
          };
        }
      } else if (sourceImage) {
        // Google/other models: Image-to-image with messages format
        const mediaTypeMatch = sourceImage.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/png";
        const base64Data = sourceImage.replace(/^data:[^;]+;base64,/, "");

        streamConfig = {
          model: imageModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: base64Data,
                  mediaType: mediaType,
                },
                {
                  type: "text",
                  text: `Using the provided image as a reference, generate a new image: ${enhancedPrompt}`,
                },
              ],
            },
          ],
        };
      } else {
        // Google/other models: Text-to-image with simple prompt
        streamConfig = {
          model: imageModel,
          prompt: `Generate an image: ${enhancedPrompt}`,
        };
      }

      let imageBase64: string | null = null;
      let textResponse = "";

      try {
        // Image generation endpoints do not use extended thinking (CoT).
        // Always include responseModalities for image output - this endpoint is exclusively
        // for image generation, so it's safe to always request IMAGE modality. This avoids
        // silent failures when gateway aliases route to Google models without the "google/" prefix.
        const providerOpts = isOpenAIModel
          ? {}
          : {
              providerOptions: {
                google: { responseModalities: ["TEXT", "IMAGE"] },
              },
            };
        const result = streamText({ ...streamConfig, ...providerOpts });

        for await (const delta of result.fullStream) {
          switch (delta.type) {
            case "text-delta": {
              textResponse += delta.text;
              break;
            }

            // Google/Gemini models return images as file events
            case "file": {
              if (delta.file.mediaType.startsWith("image/")) {
                const uint8Array = delta.file.uint8Array;
                const base64 = Buffer.from(uint8Array).toString("base64");
                const mimeType = delta.file.mediaType || "image/png";
                imageBase64 = `data:${mimeType};base64,${base64}`;
              }
              break;
            }

            // OpenAI models return images as tool-result events
            // Per AI Gateway docs: check !delta.dynamic and use delta.output.result
            case "tool-result": {
              if (delta.toolName === "image_generation" && !delta.dynamic) {
                // Per AI Gateway docs: image is in delta.output.result
                const toolOutput = delta.output as { result?: string };
                const base64Image = toolOutput?.result;
                if (base64Image && typeof base64Image === "string") {
                  // OpenAI returns webp format based on our config
                  imageBase64 = `data:image/webp;base64,${base64Image}`;
                }
              }
              break;
            }
          }
        }
      } catch (streamError) {
        const errorMessage =
          streamError instanceof Error
            ? streamError.message
            : String(streamError);

        if (
          errorMessage.includes("Unauthenticated") ||
          errorMessage.includes("OPENROUTER_API_KEY")
        ) {
          imageServiceUnavailable = true;
        }

        logger.error("[Generate Image] streamText error:", errorMessage);
        return null;
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
      // Reconcile with 0 cost (full refund)
      await reservation.reconcile(0);

      if (user.organization_id) {
        const usageRecord = await usageService.create({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "image",
          model: imageModel,
          provider: imageProvider,
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
            credits: String(0),
            cost: String(0),
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
          });
        }
      }

      if (imageServiceUnavailable) {
        return Response.json(
          { error: "Image generation service is not configured" },
          { status: 503 },
        );
      }

      return Response.json(
        { error: "No images were generated" },
        { status: 500 },
      );
    }

    // Calculate actual cost based on successful images and reconcile
    const imageCost = await calculateImageGenerationCostFromCatalog({
      model: imageModel,
      provider: imageProvider,
      imageCount: successfulResults.length,
      dimensions: imagePricingDimensions,
    });

    let usageRecordId: string | undefined;
    let actualCostBilled = imageCost.totalCost;
    if (user.organization_id) {
      const billing = await billFlatUsage(
        {
          organizationId: user.organization_id,
          userId: user.id,
          apiKeyId: apiKey?.id,
          model: imageModel,
          provider: imageProvider,
          billingSource: "gateway",
          affiliateCode,
          description: `Image generation (${successfulResults.length}x): ${imageModel}`,
        },
        imageCost,
        reservation,
      );
      actualCostBilled = billing.totalCost;

      const usageRecord = await usageService.create({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "image",
        model: imageModel,
        provider: imageProvider,
        input_tokens: 0,
        output_tokens: 0,
        input_cost: String(actualCostBilled),
        output_cost: String(0),
        markup: String(billing.platformMarkup),
        is_successful: true,
        metadata: {
          billingSource: "gateway",
          baseTotalCost: billing.baseTotalCost,
          imageCount: successfulResults.length,
        },
      });
      usageRecordId = usageRecord.id;

      if (apiKey) {
        const ipAddress =
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          "unknown";
        const userAgent = req.headers.get("user-agent") || "unknown";

        await appsService.trackDetailedRequest(apiKey.id, {
          requestType: "image",
          source: "api_key",
          ipAddress,
          userAgent,
          userId: user.id,
          model: imageModel,
          creditsUsed: String(actualCostBilled),
          status: "success",
        });
      }
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

    // Update generation record if we created one
    if (generationId && usageRecordId) {
      // For multi-image generations, create separate records for each image
      // so they all appear in the gallery (which filters by storage_url)
      if (uploadResults.length > 1 && user.organization_id) {
        // Update the first generation record with the first image
        // First record holds the total cost for the entire batch
        await generationsService.update(generationId, {
          status: "completed",
          credits: String(actualCostBilled),
          cost: String(actualCostBilled),
          content: uploadResults[0].imageBase64,
          storage_url: uploadResults[0].blobUrl,
          mime_type: uploadResults[0].mimeType,
          file_size: uploadResults[0].fileSize,
          usage_record_id: usageRecordId,
          completed_at: new Date(),
          result: {
            imageIndex: 0,
            totalImages: uploadResults.length,
            aspectRatio,
            stylePreset,
          },
        });

        // Create additional generation records for remaining images
        // These have cost: 0 since the batch cost is on the first record
        for (let i = 1; i < uploadResults.length; i++) {
          await generationsService.create({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "image",
            model: imageModel,
            provider: imageProvider,
            prompt: prompt,
            status: "completed",
            content: uploadResults[i].imageBase64,
            storage_url: uploadResults[i].blobUrl,
            mime_type: uploadResults[i].mimeType,
            file_size: uploadResults[i].fileSize,
            credits: String(0),
            cost: String(0),
            usage_record_id: usageRecordId,
            completed_at: new Date(),
            result: {
              imageIndex: i,
              totalImages: uploadResults.length,
              aspectRatio,
              stylePreset,
              batchGenerationId: generationId,
            },
          });
        }
      } else {
        // Single image or multi-image without org (just update existing record)
        await generationsService.update(generationId, {
          status: "completed",
          credits: String(actualCostBilled),
          cost: String(actualCostBilled),
          content: uploadResults[0].imageBase64,
          storage_url: uploadResults[0].blobUrl,
          mime_type: uploadResults[0].mimeType,
          file_size: uploadResults[0].fileSize,
          usage_record_id: usageRecordId,
          completed_at: new Date(),
          result: {
            aspectRatio,
            stylePreset,
            ...(uploadResults.length > 1 && {
              imageIndex: 0,
              totalImages: uploadResults.length,
            }),
          },
        });
      }
    }

    // Log to Discord
    if (
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
          model: imageModel,
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

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
