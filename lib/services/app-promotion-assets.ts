import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import { parseAiJson } from "@/lib/utils/ai-json-parse";
import { generateText, streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { put } from "@/lib/services/dws/storage";
import { z } from "zod";
import type { App } from "@/db/repositories";

export const AD_SIZES = {
  facebook_feed: { width: 1200, height: 628 },
  facebook_story: { width: 1080, height: 1920 },
  instagram_square: { width: 1080, height: 1080 },
  instagram_story: { width: 1080, height: 1920 },
  twitter_card: { width: 1200, height: 675 },
  linkedin_post: { width: 1200, height: 627 },
  google_display_leaderboard: { width: 728, height: 90 },
  google_display_medium: { width: 300, height: 250 },
  google_display_large: { width: 336, height: 280 },
} as const;

export type AdSize = keyof typeof AD_SIZES;

export interface GeneratedAsset {
  type: "screenshot" | "social_card" | "banner" | "video_thumbnail";
  size: { width: number; height: number };
  url: string;
  format: "png" | "jpg" | "webp";
  generatedAt: Date;
}

export interface AdCopyVariants {
  headlines: string[];
  descriptions: string[];
  callToActions: string[];
  hashtags: string[];
}

const AdCopyVariantsSchema = z.object({
  headlines: z.array(z.string()),
  descriptions: z.array(z.string()),
  callToActions: z.array(z.string()),
  hashtags: z.array(z.string()),
});

class AppPromotionAssetsService {
  async generateSocialCard(
    app: App,
    size: AdSize = "twitter_card",
  ): Promise<GeneratedAsset | null> {
    const dimensions = AD_SIZES[size];
    const prompt = this.buildImagePrompt(app, size);

    logger.info("[PromotionAssets] Generating social card", {
      appId: app.id,
      size,
    });

    const result = streamText({
      model: gateway.languageModel("google/gemini-2.5-flash-image-preview"),
      providerOptions: {
        google: { responseModalities: ["TEXT", "IMAGE"] },
      },
      prompt: `Generate a promotional banner image: ${prompt}`,
    });

    let imageBase64: string | null = null;

    for await (const delta of result.fullStream) {
      if (delta.type === "file" && delta.file.mediaType.startsWith("image/")) {
        const uint8Array = delta.file.uint8Array;
        const base64 = Buffer.from(uint8Array).toString("base64");
        imageBase64 = `data:${delta.file.mediaType};base64,${base64}`;
        break;
      }
    }

    if (!imageBase64) {
      logger.warn("[PromotionAssets] Failed to generate image");
      return null;
    }

    // Upload to blob storage
    const buffer = Buffer.from(imageBase64.split(",")[1], "base64");
    const blob = await put(
      `promotion-assets/${app.id}/${size}-${Date.now()}.png`,
      buffer,
      {
        access: "public",
        contentType: "image/png",
      },
    );

    return {
      type: "social_card",
      size: dimensions,
      url: blob.url,
      format: "png",
      generatedAt: new Date(),
    };
  }

  async generateAdBanners(
    app: App,
    sizes: AdSize[],
  ): Promise<GeneratedAsset[]> {
    const results = await Promise.all(
      sizes.map(async (size) => {
        const asset = await this.generateSocialCard(app, size);
        return asset ? { ...asset, type: "banner" as const } : null;
      }),
    );
    return results.filter((a): a is GeneratedAsset => a !== null);
  }

  async generateAdCopy(
    app: App,
    targetAudience?: string,
    tone:
      | "professional"
      | "casual"
      | "exciting"
      | "informative" = "professional",
  ): Promise<AdCopyVariants> {
    const prompt = `Generate advertising copy for this app:

App Name: ${app.name}
Description: ${app.description || "An app built on Eliza Cloud"}
URL: ${app.app_url}
${targetAudience ? `Target Audience: ${targetAudience}` : ""}
Tone: ${tone}

Generate the following variations in JSON format:
{
  "headlines": [
    "5 different headlines, each under 30 characters",
    "Focus on benefits and action",
    "Include power words",
    "Create urgency where appropriate",
    "Be specific and compelling"
  ],
  "descriptions": [
    "5 different descriptions, each under 90 characters",
    "Expand on the headlines",
    "Include key features",
    "Address pain points",
    "Include social proof language"
  ],
  "callToActions": [
    "Try Now",
    "Get Started",
    "Learn More",
    "See Demo",
    "Start Free"
  ],
  "hashtags": ["relevant", "trending", "niche", "branded", "industry"]
}

Return ONLY valid JSON, no markdown.`;

    const { text } = await generateText({
      model: gateway.languageModel("anthropic/claude-sonnet-4"),
      temperature: 0.8,
      prompt,
    });

    return parseAiJson(text, AdCopyVariantsSchema, "ad copy variants");
  }

  async generateAssetBundle(
    app: App,
    options: {
      includeSocialCards?: boolean;
      includeAdBanners?: boolean;
      includeCopy?: boolean;
      targetAudience?: string;
    } = {},
  ): Promise<{
    assets: GeneratedAsset[];
    copy?: AdCopyVariants;
    errors: string[];
  }> {
    const assets: GeneratedAsset[] = [];
    const errors: string[] = [];
    let copy: AdCopyVariants | undefined;

    // Generate social cards
    if (options.includeSocialCards !== false) {
      const socialSizes: AdSize[] = [
        "twitter_card",
        "facebook_feed",
        "linkedin_post",
      ];
      for (const size of socialSizes) {
        const asset = await this.generateSocialCard(app, size).catch((err) => {
          errors.push(
            `Failed to generate ${size}: ${extractErrorMessage(err)}`,
          );
          return null;
        });
        if (asset) assets.push(asset);
      }
    }

    // Generate ad banners
    if (options.includeAdBanners) {
      const adSizes: AdSize[] = [
        "instagram_square",
        "instagram_story",
        "google_display_medium",
      ];
      const banners = await this.generateAdBanners(app, adSizes).catch(
        (err) => {
          errors.push(
            `Failed to generate ad banners: ${extractErrorMessage(err)}`,
          );
          return [];
        },
      );
      assets.push(...banners);
    }

    // Generate copy
    if (options.includeCopy !== false) {
      copy = await this.generateAdCopy(app, options.targetAudience).catch(
        (err) => {
          errors.push(`Failed to generate copy: ${extractErrorMessage(err)}`);
          return undefined;
        },
      );
    }

    logger.info("[PromotionAssets] Asset bundle generated", {
      appId: app.id,
      assetCount: assets.length,
      hasCopy: !!copy,
      errorCount: errors.length,
    });

    return { assets, copy, errors };
  }

  private buildImagePrompt(app: App, size: AdSize): string {
    const dimensions = AD_SIZES[size];
    const aspectRatio = dimensions.width / dimensions.height;

    let style = "modern, professional, clean design";
    if (size.includes("story")) {
      style = "vertical, mobile-first, bold colors, minimal text";
    } else if (size.includes("square")) {
      style = "centered, balanced, eye-catching";
    }

    return `Create a ${dimensions.width}x${dimensions.height} promotional banner for "${app.name}".

App description: ${app.description || "A powerful app built on Eliza Cloud"}

Style: ${style}
Aspect ratio: ${aspectRatio.toFixed(2)}:1

Requirements:
- Clean, modern design
- Professional appearance
- Include subtle tech/AI visual elements
- Use a gradient background
- Leave space for overlay text
- High contrast for readability
- No explicit text in the image (text will be added separately)`;
  }

  getRecommendedSizes(
    platform: "meta" | "google" | "twitter" | "linkedin",
  ): AdSize[] {
    const recommendations: Record<string, AdSize[]> = {
      meta: [
        "facebook_feed",
        "facebook_story",
        "instagram_square",
        "instagram_story",
      ],
      google: [
        "google_display_leaderboard",
        "google_display_medium",
        "google_display_large",
      ],
      twitter: ["twitter_card"],
      linkedin: ["linkedin_post"],
    };

    return recommendations[platform] || ["twitter_card"];
  }
}

export const appPromotionAssetsService = new AppPromotionAssetsService();
