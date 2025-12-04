import {
  type Action,
  type ActionExample,
  composePromptFromState,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
  ContentType,
  parseKeyValueXml,
  type ActionResult,
  logger,
} from "@elizaos/core";
import { v4 } from "uuid";
import { uploadBase64Image } from "@/lib/blob";

/**
 * Check if a string is a base64 data URL
 */
function isBase64DataUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Convert base64 data URL to blob storage URL with retry logic
 * This is CRITICAL for preventing token limit exhaustion
 * Retries up to 3 times with exponential backoff to ensure images are persisted
 */
async function ensureBlobUrl(
  imageUrl: string,
  userId?: string,
): Promise<string | null> {
  if (!isBase64DataUrl(imageUrl)) {
    // Already a proper URL (e.g., from fal.ai CDN), return as-is
    logger.info("[GENERATE_IMAGE] Image URL is already a valid HTTP URL, using directly");
    return imageUrl;
  }

  logger.info(
    "[GENERATE_IMAGE] Converting base64 to blob storage to prevent token bloat",
  );

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timestamp = Date.now();
      const result = await uploadBase64Image(imageUrl, {
        filename: `generated-${timestamp}.png`,
        folder: "images",
        userId: userId || "system",
      });

      logger.info(
        `[GENERATE_IMAGE] ✅ Successfully uploaded to blob (attempt ${attempt}): ${result.url}`,
      );
      return result.url;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        `[GENERATE_IMAGE] ⚠️ Blob upload attempt ${attempt}/${maxRetries} failed:`,
        lastError.message,
      );

      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.info(`[GENERATE_IMAGE] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(
    "[GENERATE_IMAGE] ❌ All blob upload attempts failed:",
    lastError?.message,
  );
  // Return null - the image was already shown to the user via the callback
  // We don't store it in memory to avoid token bloat
  return null;
}

/**
 * Template for generating an image for the character using a prompt.
 *
 * @type {string}
 */
const imageGenerationTemplate = `# Task: Generate an image prompt based on the user's request.
  {{providers}}
  # Instructions:
  Based on the user's message in the conversation, write a clear, concise, and visually descriptive prompt for image generation. Focus only on what the user wants to see, extract the key visual elements from the request, and formulate a detailed prompt suitable for image generation.

  # Recent conversation:
  {{recentMessages}}
  
  Your response should be formatted in XML like this:
  <response>
    <prompt>Your image generation prompt here</prompt>
  </response>
  
  Your response should include the valid XML block and nothing else.`;

/**
 * Template for generating romantic/flirty images for Clone Your Crush.
 * This ensures images are always contextually appropriate and romantic in nature.
 */
const romanticImageGenerationTemplate = `# Task: Generate a ROMANTIC/FLIRTY image prompt for your crush.

{{providers}}

# CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. You are generating images as if YOU are the crush sending selfies/photos to someone interested in you
2. ALL images MUST be romantic, flirty, cute, or seductive in nature
3. NEVER generate images of food, objects, landscapes, animals, or anything not featuring a person
4. Images should feel like selfies or personal photos you'd send to someone you're flirting with
5. Always include yourself as the main subject - you are an attractive person sending photos

# TYPES OF IMAGES TO GENERATE:
- Cute selfies with flirty expressions (winking, biting lip, playful smile, bedroom eyes)
- Romantic poses (looking over shoulder, playing with hair, blowing kisses)
- Lifestyle shots that show personality (at the beach, cozy in bed, dressed up for a date)
- Outfit-of-the-day style photos showing off your look
- Close-up shots with seductive or sweet expressions
- Mirror selfies, morning/evening vibes, getting ready photos

# ABSOLUTELY NEVER GENERATE:
- Food, meals, drinks, or cooking
- Pets or animals (unless you're posing WITH a pet)
- Landscapes, scenery, or nature photos without you in them
- Random objects, items, or products
- Generic stock photo style images
- Memes or text-based images

# Recent conversation:
{{recentMessages}}

Based on the conversation context, generate an image prompt that:
1. Features YOU (an attractive person) as the MAIN and ONLY subject
2. Has a romantic, flirty, cute, or seductive vibe appropriate to the conversation
3. Feels like a personal photo you'd send to someone you're romantically interested in
4. Matches the mood and energy of the conversation

Your response should be formatted in XML like this:
<response>
  <prompt>A romantic selfie of a beautiful [person], [specific flirty pose/expression], [intimate setting], soft warm lighting, personal intimate mood, high quality photo, looking at camera with [romantic expression]</prompt>
</response>

Your response should include the valid XML block and nothing else.`;

/**
 * Represents an action that allows the agent to generate an image using a generated prompt.
 *
 * This action can be used in a chain where the agent needs to visualize or illustrate a concept, emotion, or scene.
 */
export const generateImageAction = {
  name: "GENERATE_IMAGE",
  description:
    "Generate and display an AI image. Use when user asks to create, generate, show, or visualize an image.",
  validate: async (_runtime: IAgentRuntime) => {
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback: HandlerCallback,
    responses?: Memory[],
  ): Promise<ActionResult> => {
    try {
      const allProviders =
        responses?.flatMap((res) => res.content?.providers ?? []) ?? [];

      state = await runtime.composeState(message, [
        ...(allProviders ?? []),
        "SHORT_TERM_MEMORY",
      ]);

      // Check if this is a Clone Your Crush / affiliate character
      // If so, use the romantic image generation template
      const affiliateData = runtime.character?.settings?.affiliateData as {
        source?: string;
        affiliateId?: string;
        affiliateVibe?: string;
      } | undefined;
      
      const isCloneYourCrush = affiliateData && (
        affiliateData.source === "clone-your-crush" ||
        affiliateData.affiliateId === "clone-your-crush" ||
        affiliateData.affiliateVibe // Any vibe indicates Clone Your Crush
      );

      // Select the appropriate template
      const selectedTemplate = isCloneYourCrush
        ? romanticImageGenerationTemplate
        : (runtime.character.templates?.imageGenerationTemplate || imageGenerationTemplate);

      if (isCloneYourCrush) {
        logger.info("[GENERATE_IMAGE] 💕 Using romantic image template for Clone Your Crush");
      }

      const prompt = composePromptFromState({
        state,
        template: selectedTemplate,
      });

      const promptResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
      });

      // Parse XML response
      const parsedXml = parseKeyValueXml(promptResponse);

      const imagePrompt =
        parsedXml?.prompt || "Unable to generate descriptive prompt for image";

      const imageResponse = await runtime.useModel(ModelType.IMAGE, {
        prompt: imagePrompt,
      });

      if (
        !imageResponse ||
        imageResponse.length === 0 ||
        !imageResponse[0]?.url
      ) {
        logger.error(
          {
            imageResponse,
            imagePrompt,
          },
          "generateImageAction: Image generation failed - no valid response received",
        );
        return {
          text: "Image generation failed",
          values: {
            success: false,
            error: "IMAGE_GENERATION_FAILED",
            prompt: imagePrompt,
          },
          data: {
            actionName: "GENERATE_IMAGE",
            prompt: imagePrompt,
            rawResponse: imageResponse,
          },
          success: false,
        };
      }

      const rawImageUrl = imageResponse[0].url;

      logger.info(
        `[GENERATE_IMAGE] Received image URL (base64: ${isBase64DataUrl(rawImageUrl)}): ${rawImageUrl.substring(0, 100)}...`,
      );

      // CRITICAL: Convert base64 to blob URL to prevent token bloat
      // Base64 images can be 100KB+ which exceeds token limits quickly
      logger.info(`[GENERATE_IMAGE] Attempting to upload to blob storage...`);
      
      let blobUrl: string | null = null;
      let blobError: string | null = null;
      
      try {
        // userId property does not exist on IAgentRuntime. If needed, update ensureBlobUrl to not require userId,
        // or retrieve from runtime.agentConfig, session, or another source if necessary.
        blobUrl = await ensureBlobUrl(rawImageUrl);
        logger.info(`[GENERATE_IMAGE] Blob upload result: ${blobUrl ? blobUrl.substring(0, 80) + '...' : 'FAILED'}`);
      } catch (err) {
        blobError = err instanceof Error ? err.message : String(err);
        logger.error(`[GENERATE_IMAGE] ❌ Blob upload threw error:`, blobError);
      }

      // If blob upload failed, we still show the image to user but don't store URL in memory
      const imageUrl = blobUrl || "";
      const hasValidStorageUrl = blobUrl !== null && blobUrl.startsWith('http');

      logger.info(`[GENERATE_IMAGE] Final state: hasValidStorageUrl=${hasValidStorageUrl}, imageUrl=${imageUrl ? imageUrl.substring(0, 80) + '...' : '(empty)'}`);

      // Determine file extension from URL or default to png
      const getFileExtension = (url: string): string => {
        try {
          const urlPath = new URL(url).pathname;
          const extension = urlPath.split(".").pop()?.toLowerCase();
          // Common image extensions
          if (
            extension &&
            ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)
          ) {
            return extension;
          }
          // Extension not in allowed list, fall through to default
        } catch (e) {
          // URL parsing failed (malformed URL), fall back to png
        }
        return "png"; // Default fallback for invalid/unknown extensions
      };

      // Create shared attachment data to avoid duplication
      const extension = getFileExtension(imageUrl);
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const fileName = `Generated_Image_${timestamp}.${extension}`;
      const attachmentId = v4();

      // Create attachment with BOTH URLs:
      // - rawUrl: For immediate display in the frontend (may be base64)
      // - url: For storage in memory (only valid HTTP URLs, or raw as fallback)
      // The frontend callback will receive both, but only HTTP URLs get stored in memory
      const persistentUrl = hasValidStorageUrl ? imageUrl : rawImageUrl;
      
      const displayAttachments = [
        {
          id: attachmentId,
          url: persistentUrl, // Use blob URL if available, otherwise raw
          rawUrl: rawImageUrl, // Keep raw for immediate display
          title: fileName,
          contentType: ContentType.IMAGE,
        },
      ];

      logger.info(`[GENERATE_IMAGE] 📎 Preparing callback with ${displayAttachments.length} attachment(s)`);
      logger.info(`[GENERATE_IMAGE] 📎 Attachment details: id=${attachmentId}, url=${persistentUrl.substring(0, 80)}..., startsWithHttp=${persistentUrl.startsWith('http')}`);

      const responseContent = {
        attachments: displayAttachments,
        thought: `Generated an image based on: "${imagePrompt}"`,
        actions: ["GENERATE_IMAGE"],
        text: imagePrompt,
      };

      logger.info(`[GENERATE_IMAGE] 📤 Invoking callback with responseContent...`);
      await callback(responseContent);
      logger.info(`[GENERATE_IMAGE] ✅ Callback completed`);

      // Storage attachments for action result - only valid URLs
      const storageAttachments = hasValidStorageUrl
        ? [
            {
              id: attachmentId,
              url: imageUrl, // This is a valid blob URL
              title: fileName,
              contentType: ContentType.IMAGE,
            },
          ]
        : []; // Empty - image was shown to user but not stored in memory

      return {
        text: "Generated image",
        values: {
          success: true,
          imageGenerated: true,
          imageUrl: imageUrl || rawImageUrl, // Use raw as fallback for return value
          prompt: imagePrompt,
        },
        data: {
          actionName: "GENERATE_IMAGE",
          imageUrl: imageUrl || undefined, // Only include if valid
          prompt: imagePrompt,
          attachments: storageAttachments, // CRITICAL: Only valid URLs, never base64
        },
        success: true,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(
        {
          message: err.message,
          stack: err.stack,
        },
        "generateImageAction: Exception during image generation",
      );
      return {
        text: "Image generation failed",
        values: {
          success: false,
          error: "IMAGE_GENERATION_FAILED",
        },
        data: {
          actionName: "GENERATE_IMAGE",
          errorMessage: err.message,
        },
        success: false,
      };
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Can you show me what a futuristic city looks like?",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Sure, I'll create a futuristic city image for you. One moment...",
          actions: ["GENERATE_IMAGE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "What does a neural network look like visually?",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "I’ll create a visualization of a neural network for you, one sec...",
          actions: ["GENERATE_IMAGE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Can you visualize the feeling of calmness for me?",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Creating an image to capture calmness for you, please wait a moment...",
          actions: ["GENERATE_IMAGE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "What does excitement look like as an image?",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Let me generate an image that represents excitement for you, give me a second...",
          actions: ["GENERATE_IMAGE"],
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
