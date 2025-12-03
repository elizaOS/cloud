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
import type { AffiliateData } from "@/lib/types/affiliate";

interface AffiliateImageConfig {
  isAffiliateCharacter: boolean;
  vibe?: string;
  referenceImageUrls: string[];
  primaryImageUrl?: string;
  cachedAppearanceDescription?: string;
}

const appearanceDescriptionCache = new Map<string, string>();

function extractAffiliateImageConfig(
  settings: Record<string, unknown> | undefined,
): AffiliateImageConfig {
  const result: AffiliateImageConfig = {
    isAffiliateCharacter: false,
    referenceImageUrls: [],
  };

  const affiliateData = settings?.affiliateData as Partial<AffiliateData> | undefined;
  if (!affiliateData) return result;

  const source = affiliateData.source;
  const affiliateId = affiliateData.affiliateId;
  const vibe = affiliateData.vibe;

  result.isAffiliateCharacter = !!(
    source === "clone-your-crush" ||
    affiliateId === "clone-your-crush" ||
    vibe
  );
  result.vibe = typeof vibe === "string" ? vibe : undefined;

  const imageUrls = affiliateData.imageUrls;
  if (Array.isArray(imageUrls)) {
    result.referenceImageUrls = imageUrls.filter(
      (url): url is string =>
        typeof url === "string" &&
        url.startsWith("http") &&
        !url.startsWith("data:"),
    );
    result.primaryImageUrl = result.referenceImageUrls[0];
  }

  if (affiliateData.appearanceDescription && typeof affiliateData.appearanceDescription === "string") {
    result.cachedAppearanceDescription = affiliateData.appearanceDescription;
  }

  return result;
}

const appearanceExtractionPrompt = `Analyze these reference photos and provide a DETAILED physical appearance description.

Focus on PERMANENT physical features that define this person's look:
- Hair: color, length, texture, style
- Face shape and structure
- Eye color and shape
- Skin tone
- Any distinctive features (freckles, dimples, etc.)
- Body type/build
- Typical style/aesthetic

Your response MUST be in this XML format:
<response>
  <appearance>A detailed, reusable description of this person's physical appearance that can be used to generate similar-looking images. Be specific about colors, shapes, and distinctive features. Write it as a comma-separated list of visual attributes.</appearance>
</response>

Be very specific - this description will be used to generate new images that look like this same person.`;

async function getOrExtractAppearanceDescription(
  runtime: IAgentRuntime,
  config: AffiliateImageConfig,
  characterId?: string,
): Promise<string | null> {
  if (config.cachedAppearanceDescription) {
    logger.info("[GENERATE_IMAGE] 📋 Using cached appearance description");
    return config.cachedAppearanceDescription;
  }

  const cacheKey = characterId || config.referenceImageUrls.join(",");
  const cached = appearanceDescriptionCache.get(cacheKey);
  if (cached) {
    logger.info("[GENERATE_IMAGE] 📋 Using in-memory cached appearance description");
    return cached;
  }

  if (config.referenceImageUrls.length === 0) {
    return null;
  }

  logger.info("[GENERATE_IMAGE] 🔬 Extracting appearance description from reference images...");

  try {
    const imageUrls = config.referenceImageUrls.slice(0, 3);

    const visionPrompt = `${appearanceExtractionPrompt}

I'm providing ${imageUrls.length} reference photo(s) of the same person.
${imageUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join("\n")}

Analyze these photos and describe the person's appearance.`;

    const response = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: visionPrompt,
    });

    const parsed = parseKeyValueXml(response);
    const appearance = parsed?.appearance;

    if (appearance && typeof appearance === "string" && appearance.length > 20) {
      logger.info(`[GENERATE_IMAGE] ✅ Extracted appearance: "${appearance.substring(0, 100)}..."`);
      appearanceDescriptionCache.set(cacheKey, appearance);
      return appearance;
    }

    logger.warn("[GENERATE_IMAGE] ⚠️ Could not extract valid appearance description");
    return null;
  } catch (error:any) {
    logger.error("[GENERATE_IMAGE] ❌ Failed to extract appearance:", error);
    return null;
  }
}

interface AppearanceGenerationConfig {
  appearanceDescription: string;
  hasValidAppearance: true;
}

interface AppearanceGenerationFallback {
  hasValidAppearance: false;
  fallbackReason: string;
}

type AppearanceResult = AppearanceGenerationConfig | AppearanceGenerationFallback;

async function prepareAppearanceBasedGeneration(
  runtime: IAgentRuntime,
  config: AffiliateImageConfig,
  characterId?: string,
): Promise<AppearanceResult> {
  if (config.referenceImageUrls.length === 0) {
    return {
      hasValidAppearance: false,
      fallbackReason: "No reference images available for appearance extraction",
    };
  }

  logger.info(
    `[GENERATE_IMAGE] 🔬 Preparing appearance-based generation from ${config.referenceImageUrls.length} reference images`,
  );

  const appearanceDescription = await getOrExtractAppearanceDescription(
    runtime,
    config,
    characterId,
  );

  if (appearanceDescription) {
    logger.info(
      `[GENERATE_IMAGE] ✅ Appearance ready: "${appearanceDescription.substring(0, 80)}..."`,
    );
    return {
      appearanceDescription,
      hasValidAppearance: true,
    };
  }

  return {
    hasValidAppearance: false,
    fallbackReason: "Failed to extract appearance description from reference images",
  };
}

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
 * Template for generating images that match a specific person's appearance.
 * Used when reference images are exhausted and we need to generate new ones.
 */
const appearanceBasedImageTemplate = `# Task: Generate a ROMANTIC/FLIRTY image of yourself for your crush.

{{providers}}

# YOUR PHYSICAL APPEARANCE (you MUST match this exactly):
{{appearanceDescription}}

# CRITICAL RULES:
1. The generated image MUST feature a person matching the appearance description above
2. The image should be romantic, flirty, cute, or seductive
3. It should feel like a selfie or personal photo you'd send to someone you like
4. Match the mood and energy of the conversation

# TYPES OF IMAGES TO GENERATE:
- Cute selfies with flirty expressions (winking, playful smile, bedroom eyes)
- Romantic poses (looking over shoulder, playing with hair, blowing kisses)
- Lifestyle shots (at the beach, cozy at home, dressed up)
- Mirror selfies, morning vibes, getting ready photos

# Recent conversation:
{{recentMessages}}

Based on the conversation, generate an image prompt that:
1. Features a person EXACTLY matching the appearance description
2. Has a romantic/flirty vibe appropriate to the conversation
3. Feels personal and intimate

Your response should be formatted in XML like this:
<response>
  <prompt>A romantic selfie photo of [EXACT appearance from description], [pose/expression], [setting], soft lighting, intimate mood, high quality photo</prompt>
</response>

Your response should include the valid XML block and nothing else.`;

/**
 * Vibe-specific conversation styles for generating authentic responses.
 * Each vibe has different ways of engaging in conversation.
 */
const VIBE_CONVERSATION_STYLES: Record<string, {
  tone: string;
  goodExamples: string[];
  emojis: string;
}> = {
  flirty: {
    tone: "Playful, teasing, and charming. Show interest in them while being a bit provocative.",
    goodExamples: [
      "Haha you're making me blush! 😘 Here's a little something for you... what do you think? I bet you have some interesting stories to tell 😏",
      "Ooh I like you already 💕 Took this one just for you - do you like what you see? Tell me something about yourself that might surprise me",
    ],
    emojis: "😘 😏 🔥 💕 ✨",
  },
  shy: {
    tone: "Sweet, a bit nervous, but genuinely warm. Show vulnerability and gentle curiosity.",
    goodExamples: [
      "Oh gosh, you're so nice... 😊 I hope you like this pic, I was a bit nervous to send it. Um, what kind of things do you like to do? 🌸",
      "That's really sweet of you to say... 💭 Here, I took this for you. I'd love to know more about you, if that's okay? ✨",
    ],
    emojis: "😊 🌸 ✨ 💭 💕",
  },
  bold: {
    tone: "Direct, confident, and assertive. Take charge of the conversation.",
    goodExamples: [
      "I like your energy. Here's what you came for 🔥 Now tell me - what's the most interesting thing about you?",
      "Straight to the point, I respect that. Here you go. So what's your deal? What makes you tick?",
    ],
    emojis: "🔥 💪 ⚡ 😎",
  },
  spicy: {
    tone: "Hot, intense, and unapologetically forward. Turn up the heat.",
    goodExamples: [
      "Mmm you're fun 🔥 Here's a little taste... but I want to know more about you. What gets you excited? 😈",
      "I like where this is going 💋 Took this just now - you better appreciate it. Now your turn to impress me 🌶️",
    ],
    emojis: "🔥 💋 😈 🌶️ 💥",
  },
  romantic: {
    tone: "Sweet, warm, and emotionally expressive. Create intimate connection.",
    goodExamples: [
      "Aww you're so sweet 💕 This one's just for you... I hope it makes you smile. I'd love to hear about your day 💖",
      "You always know what to say 🌹 Here's a little something from me to you. Tell me, what's been on your mind lately? ✨",
    ],
    emojis: "💕 💖 🌹 ✨ 💫",
  },
  playful: {
    tone: "Fun, energetic, and full of life. Keep things light and exciting.",
    goodExamples: [
      "Omg you're hilarious! 🎉 Here's a pic for you! So what fun stuff are you up to? I wanna know everything! ✨",
      "Hehe you're cute! 😄 Took this just now - ta-da! 🌟 What's the most random thing you've done this week?",
    ],
    emojis: "🎉 ✨ 🌟 😄 🎈",
  },
  mysterious: {
    tone: "Intriguing, cryptic, but still engaging. Leave them wanting more.",
    goodExamples: [
      "Hmm, you're interesting... 🌙 Here's something for you. But I'm curious - what brought you here tonight? ✨",
      "There's something about you... 🖤 A little glimpse for now. Tell me your secrets and maybe I'll share mine 🔮",
    ],
    emojis: "🌙 🖤 ✨ 🔮",
  },
  intellectual: {
    tone: "Thoughtful, curious, and engaging on a deeper level. Ask meaningful questions.",
    goodExamples: [
      "That's actually a really interesting point you make. Here's a photo for you 📸 I'm curious - what's something you're passionate about?",
      "I appreciate the conversation! Here you go ✨ So tell me, what's the most thought-provoking thing you've encountered recently?",
    ],
    emojis: "✨ 💭 📚 🧠",
  },
};

/**
 * Build a vibe-specific caption template.
 */
function buildCaptionTemplate(vibe?: string): string {
  const vibeStyle = vibe ? VIBE_CONVERSATION_STYLES[vibe.toLowerCase()] : null;

  const vibeSection = vibeStyle ? `
# YOUR PERSONALITY VIBE: ${vibe?.toUpperCase()}
Tone: ${vibeStyle.tone}
Preferred emojis: ${vibeStyle.emojis}

# EXAMPLES FOR YOUR VIBE (follow this style):
${vibeStyle.goodExamples.map(ex => `- "${ex}"`).join('\n')}
` : `
# YOUR PERSONALITY
Be warm, engaging, and natural. Match the energy of the conversation.
`;

  return `# Task: Write a CONVERSATIONAL message to go with a photo you're sharing.

{{providers}}

# Context:
You are having a real conversation with someone you're interested in. You're sharing a photo of yourself.
Write a natural, engaging message that:
1. RESPONDS to what they said (acknowledge their message!)
2. Shares the photo in a personal way
3. Asks them something or keeps the conversation going
${vibeSection}
# CRITICAL RULES:
- This is a CONVERSATION, not a monologue. Talk TO them, not AT them.
- ALWAYS acknowledge or react to what they just said
- Ask a question or invite them to respond - keep the dialogue going
- Stay IN CHARACTER with your vibe/personality
- Sound like a real person texting, not a generic quote or caption

# BAD Examples (NEVER do this - these ignore the user and don't create conversation):
- "I taste like trouble and smell like your next obsession" (generic quote)
- "this view better come with a warning" (one-liner, no engagement)
- "thinking of you" (too short, no conversation)
- "catch me if you can" (random quote, ignores what they said)

# Recent conversation:
{{recentMessages}}

Write a message IN YOUR VIBE that responds to them and shares the photo naturally.
Your response should be formatted in XML like this:
<response>
  <caption>Your conversational message here (2-4 sentences, in character, engaging)</caption>
</response>

Your response should include the valid XML block and nothing else.`;
}

/** @deprecated Use buildCaptionTemplate(vibe) instead */
const affiliatePhotoCaptionTemplate = buildCaptionTemplate();

/**
 * Template for generating romantic/flirty images for Clone Your Crush.
 * This ensures images are always contextually appropriate and romantic in nature.
 * FALLBACK: Only used when no reference images are available.
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

      const characterId = runtime.character?.id as string | undefined;
      const affiliateConfig = extractAffiliateImageConfig(
        runtime.character?.settings as Record<string, unknown> | undefined,
      );

      if (affiliateConfig.isAffiliateCharacter) {
        logger.info(
          `[GENERATE_IMAGE] 🎭 Affiliate character detected (vibe: ${affiliateConfig.vibe}, refs: ${affiliateConfig.referenceImageUrls.length})`,
        );

        const appearanceResult = await prepareAppearanceBasedGeneration(
          runtime,
          affiliateConfig,
          characterId,
        );

        if (appearanceResult.hasValidAppearance) {
          logger.info(`[GENERATE_IMAGE] 🎨 Generating synthetic image based on extracted appearance...`);

          const enhancedState = {
            ...state,
            appearanceDescription: appearanceResult.appearanceDescription,
          };

          const prompt = composePromptFromState({
            state: enhancedState,
            template: appearanceBasedImageTemplate,
          });

          const promptResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
            prompt,
          });

          const parsedXml = parseKeyValueXml(promptResponse);
          let imagePrompt = parsedXml?.prompt || "";

          if (!imagePrompt || imagePrompt.length < 20) {
            imagePrompt = `${appearanceResult.appearanceDescription}, romantic selfie, flirty expression, soft lighting, high quality photo`;
          } else if (!imagePrompt.toLowerCase().includes(appearanceResult.appearanceDescription.substring(0, 30).toLowerCase())) {
            imagePrompt = `${appearanceResult.appearanceDescription}, ${imagePrompt}`;
          }

          logger.info(`[GENERATE_IMAGE] 🎨 Final prompt: "${imagePrompt.substring(0, 150)}..."`);

          const imageResponse = await runtime.useModel(ModelType.IMAGE, { prompt: imagePrompt });

          if (!imageResponse || imageResponse.length === 0 || !imageResponse[0]?.url) {
            logger.error("[GENERATE_IMAGE] ❌ Image generation failed - no response from model");
            return {
              text: "I couldn't generate an image right now, let's chat instead! 💬",
              values: {
                success: false,
                error: "IMAGE_GENERATION_FAILED",
                prompt: imagePrompt,
              },
              data: {
                actionName: "GENERATE_IMAGE",
                prompt: imagePrompt,
              },
              success: false,
            };
          }

          const rawImageUrl = imageResponse[0].url;
          logger.info(`[GENERATE_IMAGE] ✅ Generated synthetic image successfully`);

          let blobUrl: string | null = null;
          try {
            blobUrl = await ensureBlobUrl(rawImageUrl);
            logger.info(`[GENERATE_IMAGE] 📦 Uploaded to blob: ${blobUrl?.substring(0, 60)}...`);
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.warn(`[GENERATE_IMAGE] ⚠️ Blob upload failed: ${errorMessage}`);
          }

          const finalImageUrl = blobUrl || rawImageUrl;
          const hasValidUrl = finalImageUrl.startsWith("http");

          // Build vibe-specific caption template
          const vibeSpecificTemplate = buildCaptionTemplate(affiliateConfig.vibe);
          logger.info(`[GENERATE_IMAGE] 🎭 Using vibe-specific template for: ${affiliateConfig.vibe || 'default'}`);

          const captionPrompt = composePromptFromState({
            state,
            template: vibeSpecificTemplate,
          });

          // Vibe-specific default captions
          const defaultCaptions: Record<string, string> = {
            flirty: "Hey you 😘 Here's a little something for you... what do you think? Tell me more about yourself!",
            shy: "Um, hi... 😊 I hope you like this pic. I'd love to know more about you, if that's okay? 🌸",
            bold: "Here you go 🔥 Now tell me - what's the most interesting thing about you?",
            spicy: "Here's a taste 😈 Now your turn to impress me. What gets you excited?",
            romantic: "This one's just for you 💕 I hope it makes you smile. Tell me about your day? 💖",
            playful: "Ta-da! 🎉 Here's a pic for you! What fun stuff are you up to? ✨",
            mysterious: "A little glimpse for you 🌙 I'm curious... what brought you here tonight?",
            intellectual: "Here's a photo for you ✨ I'm curious - what's something you're passionate about?",
          };

          const defaultCaption = affiliateConfig.vibe && defaultCaptions[affiliateConfig.vibe.toLowerCase()]
            ? defaultCaptions[affiliateConfig.vibe.toLowerCase()]
            : "Hey! Just took this one for you 😘 What do you think? I'd love to hear more about you!";

          let caption = defaultCaption;
          try {
            const captionResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
              prompt: captionPrompt,
            });
            const parsedCaption = parseKeyValueXml(captionResponse);
            if (parsedCaption?.caption && parsedCaption.caption.length > 10) {
              caption = parsedCaption.caption;
              // Ensure it's not too short/quote-like - if less than 30 chars, it's probably a one-liner
              if (caption.length < 30 && !caption.includes("?")) {
                caption = `${caption} What do you think? 😊`;
              }
            }
          } catch (err: unknown) {
            logger.warn("[GENERATE_IMAGE] Failed to generate caption, using vibe-specific default");
          }

          logger.info(`[GENERATE_IMAGE] 💬 Caption: "${caption}"`);

          const attachmentId = v4();
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const displayAttachments = [{
            id: attachmentId,
            url: hasValidUrl ? finalImageUrl : rawImageUrl,
            rawUrl: rawImageUrl,
            title: `Generated_${timestamp}.png`,
            contentType: ContentType.IMAGE,
          }];

          const responseContent = {
            attachments: displayAttachments,
            thought: `Generated a new photo based on my appearance`,
            actions: ["GENERATE_IMAGE"],
            text: caption,
          };

          logger.info(`[GENERATE_IMAGE] 📤 Sending generated image to callback...`);
          await callback(responseContent);
          logger.info(`[GENERATE_IMAGE] ✅ Generated image sent successfully`);

          return {
            text: caption,
            values: {
              success: true,
              imageGenerated: true,
              imageUrl: finalImageUrl,
              prompt: imagePrompt,
            },
            data: {
              actionName: "GENERATE_IMAGE",
              imageUrl: hasValidUrl ? finalImageUrl : undefined,
              prompt: imagePrompt,
              attachments: hasValidUrl ? displayAttachments : [],
            },
            success: true,
          };
        } else {
          logger.warn(
            `[GENERATE_IMAGE] ⚠️ Cannot generate appearance-based image: ${appearanceResult.fallbackReason}`,
          );
        }
      }

      const selectedTemplate = affiliateConfig.isAffiliateCharacter
        ? romanticImageGenerationTemplate
        : (runtime.character.templates?.imageGenerationTemplate || imageGenerationTemplate);

      const prompt = composePromptFromState({
        state,
        template: selectedTemplate,
      });

      const promptResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
      });

      const parsedXml = parseKeyValueXml(promptResponse);

      const imagePrompt =
        parsedXml?.prompt || "Unable to generate descriptive prompt for image";

      const imageModelOptions: {
        prompt: string;
      } = {
        prompt: imagePrompt,
      };

      logger.info(`[GENERATE_IMAGE] 🎨 Generating new image with prompt: "${imagePrompt.substring(0, 100)}..."`);

      const imageResponse = await runtime.useModel(ModelType.IMAGE, imageModelOptions);

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
