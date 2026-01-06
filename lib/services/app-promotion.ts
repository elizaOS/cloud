import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import { parseAiJson } from "@/lib/utils/ai-json-parse";
import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { appsService } from "./apps";
import { socialMediaService } from "./social-media";
import { advertisingService } from "./advertising";
import { seoService } from "./seo";
import { creditsService } from "./credits";
import {
  twitterAppAutomationService,
  type TwitterAutomationConfig,
} from "./twitter-automation/app-automation";
import type { App } from "@/db/repositories";
import type { SocialPlatform, PostContent } from "@/lib/types/social-media";
import type {
  AdPlatform,
  CreateCampaignInput,
  CreateCreativeInput,
} from "./advertising/types";

export type PromotionChannel = "social" | "seo" | "advertising" | "twitter_automation";

export interface PromotionConfig {
  channels: PromotionChannel[];
  social?: {
    platforms: SocialPlatform[];
    customMessage?: string;
    includeScreenshot?: boolean;
  };
  seo?: {
    generateMeta?: boolean;
    generateSchema?: boolean;
    submitToIndexNow?: boolean;
  };
  advertising?: {
    platform: AdPlatform;
    adAccountId: string;
    budget: number;
    budgetType: "daily" | "lifetime";
    objective: "awareness" | "traffic" | "engagement" | "app_promotion";
    duration?: number;
    targetLocations?: string[];
  };
  twitterAutomation?: {
    enabled: boolean;
    autoPost: boolean;
    autoReply: boolean;
    autoEngage: boolean;
    discovery: boolean;
    postIntervalMin: number;
    postIntervalMax: number;
    vibeStyle?: string;
    topics?: string[];
  };
}

export interface PromotionResult {
  appId: string;
  appName: string;
  appUrl: string;
  channels: {
    social?: {
      success: boolean;
      platforms: Array<{
        platform: SocialPlatform;
        success: boolean;
        postId?: string;
        postUrl?: string;
        error?: string;
      }>;
    };
    seo?: {
      success: boolean;
      requestId?: string;
      artifacts?: Array<{ type: string; data: Record<string, unknown> }>;
      error?: string;
    };
    advertising?: {
      success: boolean;
      campaignId?: string;
      campaignName?: string;
      error?: string;
    };
    twitterAutomation?: {
      success: boolean;
      enabled: boolean;
      initialTweetId?: string;
      initialTweetUrl?: string;
      error?: string;
    };
  };
  totalCreditsUsed: number;
  errors: string[];
}

export interface GeneratedPromotionalContent {
  headline: string;
  shortDescription: string;
  longDescription: string;
  callToAction: string;
  hashtags: string[];
  socialPosts: Partial<Record<SocialPlatform, string>>;
}

const PromotionalContentSchema = z.object({
  headline: z.string(),
  shortDescription: z.string(),
  longDescription: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  socialPosts: z.record(z.string()),
});

const PROMOTION_COSTS = {
  contentGeneration: 0.02,
  socialPostBase: 0.01,
  seoBundle: 0.03,
  adCampaignSetup: 0.5,
  twitterAutomationSetup: 0.1,
  twitterAutomationInitialTweet: 0.02,
} as const;

class AppPromotionService {
  async generatePromotionalContent(
    app: App,
    targetAudience?: string,
  ): Promise<GeneratedPromotionalContent> {
    const appDescription =
      app.description || `${app.name} - An app built on Eliza Cloud`;
    const appUrl = app.app_url;

    const prompt = `Generate promotional content for this app:

App Name: ${app.name}
Description: ${appDescription}
URL: ${appUrl}
${targetAudience ? `Target Audience: ${targetAudience}` : ""}

Generate the following in JSON format:
{
  "headline": "A catchy headline under 60 characters",
  "shortDescription": "A compelling 1-2 sentence description under 160 characters",
  "longDescription": "A detailed 2-3 paragraph description highlighting key features and benefits",
  "callToAction": "A short CTA phrase like 'Try it now' or 'Get started free'",
  "hashtags": ["relevant", "hashtags", "without", "the", "symbol"],
  "socialPosts": {
    "twitter": "A tweet under 280 characters with hashtags",
    "bluesky": "A Bluesky post under 300 characters",
    "linkedin": "A professional LinkedIn post under 700 characters",
    "facebook": "An engaging Facebook post under 500 characters",
    "discord": "A Discord announcement with formatting",
    "telegram": "A Telegram message with emoji"
  }
}

Return ONLY valid JSON, no markdown.`;

    const { text } = await generateText({
      model: gateway.languageModel("anthropic/claude-sonnet-4"),
      temperature: 0.7,
      prompt,
    });

    return parseAiJson(
      text,
      PromotionalContentSchema,
      "promotional content",
    ) as GeneratedPromotionalContent;
  }

  async promoteApp(
    organizationId: string,
    userId: string,
    appId: string,
    config: PromotionConfig,
  ): Promise<PromotionResult> {
    logger.info("[AppPromotion] Starting app promotion", {
      appId,
      channels: config.channels,
    });

    const app = await appsService.getById(appId);
    if (!app) {
      throw new Error("App not found");
    }

    if (app.organization_id !== organizationId) {
      throw new Error("App does not belong to this organization");
    }

    const result: PromotionResult = {
      appId: app.id,
      appName: app.name,
      appUrl: app.app_url,
      channels: {},
      totalCreditsUsed: 0,
      errors: [],
    };

    // Generate promotional content if needed
    let promotionalContent: GeneratedPromotionalContent | undefined;
    if (
      config.channels.includes("social") ||
      config.channels.includes("advertising")
    ) {
      const contentDeduction = await creditsService.deductCredits({
        organizationId,
        amount: PROMOTION_COSTS.contentGeneration,
        description: `Generate promotional content for ${app.name}`,
        metadata: { appId, type: "content_generation" },
      });

      if (contentDeduction.success) {
        result.totalCreditsUsed += PROMOTION_COSTS.contentGeneration;
        promotionalContent = await this.generatePromotionalContent(app);
      }
    }

    // Execute each channel
    if (config.channels.includes("social") && config.social) {
      result.channels.social = await this.executeSocialPromotion(
        organizationId,
        userId,
        app,
        config.social,
        promotionalContent,
      );
      if (!result.channels.social.success) {
        result.errors.push("Social media promotion partially failed");
      }
      result.totalCreditsUsed +=
        config.social.platforms.length * PROMOTION_COSTS.socialPostBase;
    }

    if (config.channels.includes("seo") && config.seo) {
      result.channels.seo = await this.executeSeoOptimization(
        organizationId,
        userId,
        app,
        config.seo,
      );
      if (!result.channels.seo.success) {
        result.errors.push(
          `SEO optimization failed: ${result.channels.seo.error}`,
        );
      }
      result.totalCreditsUsed += PROMOTION_COSTS.seoBundle;
    }

    if (config.channels.includes("advertising") && config.advertising) {
      result.channels.advertising = await this.executeAdCampaign(
        organizationId,
        app,
        config.advertising,
        promotionalContent,
      );
      if (!result.channels.advertising.success) {
        result.errors.push(
          `Ad campaign creation failed: ${result.channels.advertising.error}`,
        );
      }
    }

    if (config.channels.includes("twitter_automation") && config.twitterAutomation) {
      result.channels.twitterAutomation = await this.executeTwitterAutomation(
        organizationId,
        app,
        config.twitterAutomation,
      );
      if (!result.channels.twitterAutomation.success) {
        result.errors.push(
          `Twitter automation failed: ${result.channels.twitterAutomation.error}`,
        );
      }
      result.totalCreditsUsed +=
        PROMOTION_COSTS.twitterAutomationSetup +
        (result.channels.twitterAutomation.initialTweetId
          ? PROMOTION_COSTS.twitterAutomationInitialTweet
          : 0);
    }

    logger.info("[AppPromotion] Promotion complete", {
      appId,
      creditsUsed: result.totalCreditsUsed,
      errorCount: result.errors.length,
    });

    return result;
  }

  private async executeSocialPromotion(
    organizationId: string,
    userId: string,
    app: App,
    config: NonNullable<PromotionConfig["social"]>,
    content?: GeneratedPromotionalContent,
  ): Promise<NonNullable<PromotionResult["channels"]["social"]>> {
    const results: Array<{
      platform: SocialPlatform;
      success: boolean;
      postId?: string;
      postUrl?: string;
      error?: string;
    }> = [];

    for (const platform of config.platforms) {
      const postText =
        config.customMessage ||
        content?.socialPosts[platform] ||
        `Check out ${app.name}! ${app.description || ""} ${app.app_url}`;

      const postContent: PostContent = {
        text: postText,
      };

      const postResult = await socialMediaService.createPost({
        organizationId,
        userId,
        content: postContent,
        platforms: [platform],
      });

      const platformResult = postResult.results.find(
        (r) => r.platform === platform,
      );
      results.push({
        platform,
        success: platformResult?.success ?? false,
        postId: platformResult?.postId,
        postUrl: platformResult?.postUrl,
        error: platformResult?.error,
      });
    }

    return {
      success: results.some((r) => r.success),
      platforms: results,
    };
  }

  private async executeSeoOptimization(
    organizationId: string,
    userId: string,
    app: App,
    config: NonNullable<PromotionConfig["seo"]>,
  ): Promise<NonNullable<PromotionResult["channels"]["seo"]>> {
    if (!app.app_url) {
      return {
        success: false,
        error: "App URL is required for SEO optimization",
      };
    }

    const seoType = this.determineSeoType(config);
    const result = await seoService.createRequest({
      organizationId,
      userId,
      appId: app.id,
      type: seoType,
      pageUrl: app.app_url,
      keywords: [app.name, "ai app", "eliza cloud"],
      promptContext: `App: ${app.name}. ${app.description || ""}`,
    });

    return {
      success: result.request.status === "completed",
      requestId: result.request.id,
      artifacts: result.artifacts.map((a) => ({
        type: a.type,
        data: a.data as Record<string, unknown>,
      })),
      error:
        result.request.status === "failed" ? "SEO request failed" : undefined,
    };
  }

  private determineSeoType(
    config: NonNullable<PromotionConfig["seo"]>,
  ): string {
    if (config.generateMeta && config.generateSchema) return "publish_bundle";
    if (config.generateMeta) return "meta_generate";
    if (config.generateSchema) return "schema_generate";
    if (config.submitToIndexNow) return "index_now";
    return "health_check";
  }

  private async executeAdCampaign(
    organizationId: string,
    app: App,
    config: NonNullable<PromotionConfig["advertising"]>,
    content?: GeneratedPromotionalContent,
  ): Promise<NonNullable<PromotionResult["channels"]["advertising"]>> {
    const startDate = new Date();
    const endDate = config.duration
      ? new Date(startDate.getTime() + config.duration * 24 * 60 * 60 * 1000)
      : undefined;

    const campaign = await advertisingService.createCampaign({
      organizationId,
      adAccountId: config.adAccountId,
      name: `${app.name} - Promotion Campaign`,
      objective: config.objective,
      budgetType: config.budgetType,
      budgetAmount: config.budget,
      startDate,
      endDate,
      appId: app.id,
      targeting: config.targetLocations?.length
        ? { locations: config.targetLocations }
        : undefined,
    });

    if (content) {
      await this.createDefaultCreative(
        organizationId,
        campaign.id,
        app,
        content,
      );
    }

    return {
      success: true,
      campaignId: campaign.id,
      campaignName: campaign.name,
    };
  }

  private async createDefaultCreative(
    organizationId: string,
    campaignId: string,
    app: App,
    content: GeneratedPromotionalContent,
  ): Promise<void> {
    await advertisingService
      .createCreative(organizationId, {
        campaignId,
        name: `${app.name} - Default Creative`,
        type: "image",
        headline: content.headline,
        primaryText: content.longDescription.substring(0, 500),
        description: content.shortDescription,
        callToAction: "LEARN_MORE",
        destinationUrl: app.app_url,
        media: [],
      })
      .catch((err) => {
        logger.warn("[AppPromotion] Failed to create default creative", {
          campaignId,
          error: extractErrorMessage(err),
        });
      });
  }

  /**
   * Execute Twitter/X automation setup for an app
   * This enables the AI agent to autonomously promote the app
   */
  private async executeTwitterAutomation(
    organizationId: string,
    app: App,
    config: NonNullable<PromotionConfig["twitterAutomation"]>,
  ): Promise<NonNullable<PromotionResult["channels"]["twitterAutomation"]>> {
    try {
      // Enable automation with the provided config
      await twitterAppAutomationService.enableAutomation(organizationId, app.id, {
        enabled: config.enabled,
        autoPost: config.autoPost,
        autoReply: config.autoReply,
        autoEngage: config.autoEngage,
        discovery: config.discovery,
        postIntervalMin: config.postIntervalMin,
        postIntervalMax: config.postIntervalMax,
        vibeStyle: config.vibeStyle,
        topics: config.topics,
      });

      // Post an initial announcement tweet if autoPost is enabled
      let initialTweetId: string | undefined;
      let initialTweetUrl: string | undefined;

      if (config.autoPost) {
        const tweetResult = await twitterAppAutomationService.postAppTweet(
          organizationId,
          app.id,
        );

        if (tweetResult.success) {
          initialTweetId = tweetResult.tweetId;
          initialTweetUrl = tweetResult.tweetUrl;
        }
      }

      logger.info("[AppPromotion] Twitter automation enabled", {
        appId: app.id,
        organizationId,
        initialTweetId,
      });

      return {
        success: true,
        enabled: true,
        initialTweetId,
        initialTweetUrl,
      };
    } catch (error) {
      logger.error("[AppPromotion] Twitter automation failed", {
        appId: app.id,
        error: extractErrorMessage(error),
      });

      return {
        success: false,
        enabled: false,
        error: extractErrorMessage(error),
      };
    }
  }

  /**
   * Get promotion suggestions for an app
   */
  async getPromotionSuggestions(
    organizationId: string,
    appId: string,
  ): Promise<{
    recommendedChannels: PromotionChannel[];
    estimatedBudget: { min: number; max: number };
    suggestedPlatforms: SocialPlatform[];
    tips: string[];
    twitterAutomationStatus?: {
      connected: boolean;
      enabled: boolean;
    };
  }> {
    const app = await appsService.getById(appId);
    if (!app || app.organization_id !== organizationId) {
      throw new Error("App not found");
    }

    // Check what's already connected
    const hasAdAccount =
      (await advertisingService.listAccounts(organizationId)).length > 0;

    // Check Twitter automation status
    let twitterAutomationStatus: { connected: boolean; enabled: boolean } | undefined;
    try {
      const status = await twitterAppAutomationService.getAutomationStatus(
        organizationId,
        appId,
      );
      twitterAutomationStatus = {
        connected: status.twitterConnected,
        enabled: status.enabled,
      };
    } catch {
      twitterAutomationStatus = { connected: false, enabled: false };
    }

    const recommendedChannels: PromotionChannel[] = ["social", "seo"];
    if (hasAdAccount) {
      recommendedChannels.push("advertising");
    }
    if (twitterAutomationStatus.connected) {
      recommendedChannels.push("twitter_automation");
    }

    const tips = [
      "Start with social media announcements to build initial awareness",
      "Use SEO optimization to improve organic discoverability",
      hasAdAccount
        ? "Consider a small ad campaign to reach new audiences"
        : "Connect an ad account to run paid promotions",
      "Generate custom images to make your posts stand out",
    ];

    if (twitterAutomationStatus.connected && !twitterAutomationStatus.enabled) {
      tips.unshift(
        "🚀 Enable Twitter Automation for 24/7 AI-powered vibe marketing!",
      );
    }

    return {
      recommendedChannels,
      estimatedBudget: {
        min: 5,
        max: hasAdAccount ? 100 : 5,
      },
      suggestedPlatforms: ["twitter", "bluesky", "linkedin", "discord"],
      tips,
      twitterAutomationStatus,
    };
  }

  async getPromotionHistory(
    organizationId: string,
    appId: string,
  ): Promise<{
    totalCampaigns: number;
    recentActivity: Array<{
      type: "advertising";
      date: Date;
      description: string;
    }>;
  }> {
    const app = await appsService.getById(appId);
    if (!app || app.organization_id !== organizationId) {
      throw new Error("App not found");
    }

    const campaigns = await advertisingService.listCampaigns(organizationId, {
      appId,
    });

    return {
      totalCampaigns: campaigns.length,
      recentActivity: campaigns.slice(0, 10).map((c) => ({
        type: "advertising" as const,
        date: c.created_at,
        description: `Created campaign: ${c.name}`,
      })),
    };
  }
}

export const appPromotionService = new AppPromotionService();
