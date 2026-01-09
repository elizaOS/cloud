"use client";

/**
 * App Promote Tab
 *
 * Displays promotion options, history, and promotional asset management
 * for an app.
 */

import { useState, useEffect, useRef } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Megaphone,
  Share2,
  Image as ImageIcon,
  Plus,
  Loader2,
  Sparkles,
  Link2,
  Bot,
  ArrowRight,
  Send,
  Hash,
  Twitter,
  Play,
  X,
  Upload,
} from "lucide-react";
import { PromoteAppDialog } from "@/components/promotion/promote-app-dialog";
import { SocialConnectionHint } from "@/components/promotion/social-connection-hint";
import {
  uploadPromotionalAsset,
  deletePromotionalAsset,
} from "@/app/actions/apps";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import type { App } from "@/db/schemas";

// Feature flag: Enable when Twitter API keys are available
const TWITTER_ENABLED = false;

interface AppPromoteProps {
  app: App;
}

interface PromotionSuggestions {
  recommendedChannels: string[];
  estimatedBudget: { min: number; max: number };
  suggestedPlatforms: string[];
  tips: string[];
}

interface TwitterStatus {
  configured: boolean;
  connected: boolean;
  username?: string;
}

interface AutomationStatus {
  discord: {
    enabled: boolean;
    ready: boolean; // Has channel configured
    guildName?: string;
    channelName?: string;
  };
  telegram: {
    enabled: boolean;
    ready: boolean; // Has channel/group configured
    botUsername?: string;
  };
  twitter: {
    enabled: boolean;
    ready: boolean;
    username?: string;
  };
}

interface SocialConnectionStatus {
  discord: {
    configured: boolean;
    connected: boolean;
    guildCount?: number;
  };
  telegram: {
    configured: boolean;
    connected: boolean;
    botUsername?: string;
  };
}

export function AppPromote({ app }: AppPromoteProps) {
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [suggestions, setSuggestions] = useState<PromotionSuggestions | null>(
    null
  );
  const [twitterStatus, setTwitterStatus] = useState<TwitterStatus>({
    configured: false,
    connected: false,
  });
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus>({
    discord: { enabled: false, ready: false },
    telegram: { enabled: false, ready: false },
    twitter: { enabled: false, ready: false },
  });
  const [socialConnectionStatus, setSocialConnectionStatus] =
    useState<SocialConnectionStatus>({
      discord: { configured: false, connected: false },
      telegram: { configured: false, connected: false },
    });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isPostingTo, setIsPostingTo] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [deletingAssetUrl, setDeletingAssetUrl] = useState<string | null>(null);
  const [localAssets, setLocalAssets] = useState(app.promotional_assets || []);
  const assetInputRef = useRef<HTMLInputElement>(null);

  // Calculate total social posts from automation configs
  const discordConfig = app.discord_automation as {
    totalMessages?: number;
  } | null;
  const telegramConfig = app.telegram_automation as {
    totalMessages?: number;
    enabled?: boolean;
    botUsername?: string;
  } | null;
  const initialPostCount =
    (discordConfig?.totalMessages ?? 0) + (telegramConfig?.totalMessages ?? 0);
  const [totalSocialPosts, setTotalSocialPosts] = useState(initialPostCount);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Fetch promotion suggestions
      const suggestionsRes = await fetch(`/api/v1/apps/${app.id}/promote`);
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json();
        setSuggestions(data);
      }

      // Fetch Twitter connection status (only if enabled)
      if (TWITTER_ENABLED) {
        const twitterRes = await fetch("/api/v1/twitter/status");
        if (twitterRes.ok) {
          const data = await twitterRes.json();
          setTwitterStatus(data);
        }
      }

      // Fetch Discord connection status
      try {
        const discordRes = await fetch("/api/v1/discord/status");
        if (discordRes.ok) {
          const data = await discordRes.json();
          setSocialConnectionStatus((prev) => ({
            ...prev,
            discord: {
              configured: data.configured ?? false,
              connected: data.connected ?? false,
              guildCount: data.guilds?.length ?? 0,
            },
          }));
        }
      } catch {
        // Silently fail - hint will show as not connected
      }

      // Fetch Telegram connection status
      try {
        const telegramRes = await fetch("/api/v1/telegram/status");
        if (telegramRes.ok) {
          const data = await telegramRes.json();
          setSocialConnectionStatus((prev) => ({
            ...prev,
            telegram: {
              configured: data.configured ?? false,
              connected: data.connected ?? false,
              botUsername: data.botUsername,
            },
          }));
        }
      } catch {
        // Silently fail - hint will show as not connected
      }

      // Check automation status from app data
      const discordAutomation = app.discord_automation as {
        enabled?: boolean;
        guildId?: string;
        channelId?: string;
      } | null;
      const telegramAutomation = app.telegram_automation as {
        enabled?: boolean;
        botUsername?: string;
        channelId?: string;
        groupId?: string;
      } | null;
      const twitterAutomation = app.twitter_automation as {
        enabled?: boolean;
        autoPost?: boolean;
      } | null;

      setAutomationStatus({
        discord: {
          enabled: discordAutomation?.enabled ?? false,
          ready: !!(discordAutomation?.enabled && discordAutomation?.channelId),
        },
        telegram: {
          enabled: telegramAutomation?.enabled ?? false,
          ready: !!(
            telegramAutomation?.enabled &&
            (telegramAutomation?.channelId || telegramAutomation?.groupId)
          ),
          botUsername: telegramAutomation?.botUsername,
        },
        twitter: {
          enabled: TWITTER_ENABLED && (twitterAutomation?.enabled ?? false),
          ready:
            TWITTER_ENABLED &&
            !!(twitterAutomation?.enabled && twitterAutomation?.autoPost),
        },
      });

      setIsLoading(false);
    };

    fetchData();
  }, [
    app.id,
    app.discord_automation,
    app.telegram_automation,
    app.twitter_automation,
  ]);

  const handleGenerateAssets = async () => {
    if (isGeneratingAssets) return;
    setIsGeneratingAssets(true);

    try {
      const response = await fetch(`/api/v1/apps/${app.id}/promote/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeCopy: true,
          includeAdBanners: true,
          customPrompt: customPrompt.trim() || undefined, // Only send if provided
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(
          data.error || "Failed to generate assets. Please try again."
        );
        setIsGeneratingAssets(false);
        return;
      }

      // Check if any assets were actually generated
      const assetCount = data.assets?.length ?? 0;
      const hasCopy = !!data.copy;

      if (assetCount === 0 && !hasCopy) {
        const errorMsg = data.errors?.join(", ") || "No assets generated";
        toast.error(`Generation failed: ${errorMsg}`);
        setIsGeneratingAssets(false);
        return;
      }

      // Show success with details
      if (data.errors?.length > 0) {
        toast.warning(
          `Generated ${assetCount} assets with some errors: ${data.errors.join(", ")}`
        );
      } else {
        toast.success(
          `Generated ${assetCount} promotional assets${hasCopy ? " and ad copy" : ""}`
        );
      }

      // Reload to show new assets
      window.location.reload();
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      setIsGeneratingAssets(false);
    }
  };

  const handlePostNow = async (
    platform: "discord" | "telegram" | "twitter"
  ) => {
    if (isPostingTo) return;
    setIsPostingTo(platform);

    const endpoints: Record<string, string> = {
      discord: `/api/v1/apps/${app.id}/discord-automation/post`,
      telegram: `/api/v1/apps/${app.id}/telegram-automation/post`,
      twitter: `/api/v1/apps/${app.id}/twitter/automation/post`,
    };

    try {
      const response = await fetch(endpoints[platform], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        toast.success(
          `Posted to ${platform.charAt(0).toUpperCase() + platform.slice(1)} successfully!`
        );
        // Update local post count
        setTotalSocialPosts((prev) => prev + 1);
      } else {
        toast.error(data.error || `Failed to post to ${platform}`);
      }
    } catch {
      toast.error("Network error. Please try again.");
    }

    setIsPostingTo(null);
  };

  const handleAssetUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file type. Please upload an image.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10MB.");
      return;
    }

    setIsUploadingAsset(true);

    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadPromotionalAsset(app.id, formData);

    if (result.success && result.asset) {
      setLocalAssets((prev) => [...prev, result.asset]);
      toast.success("Asset uploaded successfully!");
    } else {
      toast.error(result.error || "Failed to upload asset");
    }

    setIsUploadingAsset(false);
    if (assetInputRef.current) {
      assetInputRef.current.value = "";
    }
  };

  const handleAssetDelete = async (assetUrl: string) => {
    setDeletingAssetUrl(assetUrl);

    const result = await deletePromotionalAsset(app.id, assetUrl);

    if (result.success) {
      setLocalAssets((prev) => prev.filter((a) => a.url !== assetUrl));
      toast.success("Asset deleted successfully!");
    } else {
      toast.error(result.error || "Failed to delete asset");
    }

    setDeletingAssetUrl(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-[#FF5800]" />
            Promote {app.name}
          </h2>
          <p className="text-white/60 text-sm mt-1">
            Reach more users through social media automation
          </p>
        </div>
        <Button
          onClick={() => setShowPromoteDialog(true)}
          className="bg-[#FF5800] hover:bg-[#FF5800]/90"
        >
          <Megaphone className="h-4 w-4 mr-2" />
          Launch Promotion
        </Button>
      </div>

      {/* Social Connection Hints - Show when Discord/Telegram not connected AND automation not enabled */}
      <SocialConnectionHint
        connectionStatus={socialConnectionStatus}
        automationStatus={{
          discord: automationStatus.discord,
          telegram: automationStatus.telegram,
        }}
      />

      {/* Twitter Connection Banner - Only show when Twitter is enabled */}
      {TWITTER_ENABLED && !twitterStatus.connected && (
        <BrandCard className="p-4 border-sky-500/30 bg-sky-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-sky-500/20">
                <Bot className="h-6 w-6 text-sky-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Connect Your Social Accounts
                </h3>
                <p className="text-white/60 text-sm mt-0.5">
                  Enable AI-powered Twitter automation to promote your app 24/7
                  with vibe marketing
                </p>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              className="border-sky-500/50 hover:bg-sky-500/10"
            >
              <Link href="/dashboard/settings?tab=connections">
                Go to Connections
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </BrandCard>
      )}

      {/* Quick Stats */}
      <BrandCard className="p-4">
        <CornerBrackets size="sm" />
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Share2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <div className="text-white/60 text-xs">Social Posts</div>
            <div className="text-xl font-semibold text-white">
              {totalSocialPosts}
            </div>
          </div>
        </div>
      </BrandCard>

      {/* Quick Actions - Post Now */}
      {(automationStatus.discord.enabled ||
        automationStatus.telegram.enabled ||
        automationStatus.twitter.enabled) && (
        <BrandCard className="p-6">
          <CornerBrackets />
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Play className="h-5 w-5 text-[#FF5800]" />
                Quick Actions
              </h3>
              <p className="text-white/60 text-sm">
                Post an AI-generated announcement right now
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {automationStatus.discord.enabled && (
              <button
                type="button"
                onClick={() =>
                  automationStatus.discord.ready && handlePostNow("discord")
                }
                disabled={
                  isPostingTo !== null || !automationStatus.discord.ready
                }
                className="p-4 rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/5 hover:bg-[#5865F2]/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-[#5865F2]/20">
                    <Hash className="h-5 w-5 text-[#5865F2]" />
                  </div>
                  <div>
                    <div className="text-white font-medium">
                      Post to Discord
                    </div>
                    <div className="text-white/60 text-xs">
                      {automationStatus.discord.ready
                        ? "Send announcement now"
                        : "No channel configured"}
                    </div>
                  </div>
                </div>
                {isPostingTo === "discord" ? (
                  <div className="flex items-center justify-center mt-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#5865F2]" />
                    <span className="text-[#5865F2] text-sm ml-2">
                      Posting...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-end mt-2">
                    <Send className="h-4 w-4 text-[#5865F2]" />
                  </div>
                )}
              </button>
            )}

            {automationStatus.telegram.enabled && (
              <button
                type="button"
                onClick={() =>
                  automationStatus.telegram.ready && handlePostNow("telegram")
                }
                disabled={
                  isPostingTo !== null || !automationStatus.telegram.ready
                }
                className="p-4 rounded-lg border border-[#0088cc]/30 bg-[#0088cc]/5 hover:bg-[#0088cc]/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-[#0088cc]/20">
                    <Send className="h-5 w-5 text-[#0088cc]" />
                  </div>
                  <div>
                    <div className="text-white font-medium">
                      Post to Telegram
                    </div>
                    <div className="text-white/60 text-xs">
                      {!automationStatus.telegram.ready
                        ? "No channel/group configured"
                        : automationStatus.telegram.botUsername
                          ? `@${automationStatus.telegram.botUsername}`
                          : "Send announcement now"}
                    </div>
                  </div>
                </div>
                {isPostingTo === "telegram" ? (
                  <div className="flex items-center justify-center mt-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#0088cc]" />
                    <span className="text-[#0088cc] text-sm ml-2">
                      Posting...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-end mt-2">
                    <Send className="h-4 w-4 text-[#0088cc]" />
                  </div>
                )}
              </button>
            )}

            {TWITTER_ENABLED && automationStatus.twitter.enabled && (
              <button
                type="button"
                onClick={() =>
                  automationStatus.twitter.ready && handlePostNow("twitter")
                }
                disabled={
                  isPostingTo !== null || !automationStatus.twitter.ready
                }
                className="p-4 rounded-lg border border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-sky-500/20">
                    <Twitter className="h-5 w-5 text-sky-500" />
                  </div>
                  <div>
                    <div className="text-white font-medium">
                      Post to Twitter/X
                    </div>
                    <div className="text-white/60 text-xs">
                      {!automationStatus.twitter.ready
                        ? "Auto-post not enabled"
                        : twitterStatus.username
                          ? `@${twitterStatus.username}`
                          : "Send tweet now"}
                    </div>
                  </div>
                </div>
                {isPostingTo === "twitter" ? (
                  <div className="flex items-center justify-center mt-2">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                    <span className="text-sky-500 text-sm ml-2">
                      Posting...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-end mt-2">
                    <Send className="h-4 w-4 text-sky-500" />
                  </div>
                )}
              </button>
            )}
          </div>
        </BrandCard>
      )}

      {/* Promotional Assets */}
      <BrandCard className="p-6">
        <CornerBrackets />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Promotional Assets
            </h3>
            <p className="text-white/60 text-sm">
              AI-generated images and copy for your campaigns
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPromptInput(!showPromptInput)}
              className="text-white/60 hover:text-white"
            >
              {showPromptInput ? "Hide" : "Custom"} Prompt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAssets}
              disabled={isGeneratingAssets}
            >
              {isGeneratingAssets ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Assets
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Optional custom prompt input */}
        {showPromptInput && (
          <div className="space-y-2 mt-4">
            <label htmlFor="custom-prompt" className="text-sm text-white/70">
              Custom Instructions{" "}
              <span className="text-white/40">(optional)</span>
            </label>
            <textarea
              id="custom-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="E.g., 'Use dark blue and gold colors, show a futuristic dashboard, emphasize AI capabilities...'"
              className="w-full h-20 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 text-sm resize-none focus:outline-none focus:border-white/30"
              maxLength={1000}
            />
            <p className="text-xs text-white/40">
              Add specific instructions to guide the AI image generation.
              {customPrompt.length > 0 && (
                <span className="ml-2">
                  {customPrompt.length}/1000 characters
                </span>
              )}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mt-4">
          {/* Display generated assets or placeholders */}
          {localAssets && localAssets.length > 0 ? (
            <>
              {localAssets.map((asset, index) => (
                <div
                  key={`asset-${index}-${asset.type}`}
                  className="aspect-square rounded-lg border border-white/20 overflow-hidden hover:border-white/40 transition-colors relative group"
                >
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full w-full"
                  >
                    <Image
                      src={asset.url}
                      alt={`${asset.type} - ${asset.size.width}x${asset.size.height}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                      <span className="text-white text-xs font-medium capitalize">
                        {asset.type.replace("_", " ")}
                      </span>
                      <span className="text-white/60 text-xs">
                        {asset.size.width}x{asset.size.height}
                      </span>
                    </div>
                  </a>
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAssetDelete(asset.url);
                    }}
                    disabled={deletingAssetUrl === asset.url}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
                    title="Delete asset"
                  >
                    {deletingAssetUrl === asset.url ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ))}
              {/* Upload placeholder for adding more */}
              <button
                type="button"
                onClick={() => assetInputRef.current?.click()}
                disabled={isUploadingAsset}
                className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-[#FF5800]/50 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUploadingAsset ? (
                  <Loader2 className="h-8 w-8 mb-2 animate-spin" />
                ) : (
                  <Plus className="h-8 w-8 mb-2" />
                )}
                <span className="text-xs">
                  {isUploadingAsset ? "Uploading..." : "Add More"}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGenerateAssets}
                disabled={isGeneratingAssets}
                className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-[#FF5800]/50 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGeneratingAssets ? (
                  <Loader2 className="h-8 w-8 mb-2 animate-spin" />
                ) : (
                  <Sparkles className="h-8 w-8 mb-2" />
                )}
                <span className="text-xs">
                  {isGeneratingAssets ? "Generating..." : "Generate AI"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => assetInputRef.current?.click()}
                disabled={isUploadingAsset}
                className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-[#FF5800]/50 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUploadingAsset ? (
                  <Loader2 className="h-8 w-8 mb-2 animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 mb-2" />
                )}
                <span className="text-xs">
                  {isUploadingAsset ? "Uploading..." : "Upload Image"}
                </span>
              </button>
              <div className="aspect-square rounded-lg border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-white/20">
                <ImageIcon className="h-8 w-8 mb-2" />
                <span className="text-xs">More coming</span>
              </div>
            </>
          )}
        </div>

        {/* Hidden file input for asset uploads */}
        <input
          ref={assetInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleAssetUpload(e.target.files)}
          className="hidden"
        />
      </BrandCard>

      {/* Suggestions */}
      {suggestions && (
        <BrandCard className="p-6">
          <CornerBrackets />
          <h3 className="text-lg font-semibold text-white mb-4">
            Promotion Tips
          </h3>
          <div className="space-y-3">
            {suggestions.tips.map((tip, index) => (
              <div
                key={`tip-${index}-${tip.slice(0, 20)}`}
                className="flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-[#FF5800]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[#FF5800] text-xs font-semibold">
                    {index + 1}
                  </span>
                </div>
                <p className="text-white/80 text-sm">{tip}</p>
              </div>
            ))}
          </div>
        </BrandCard>
      )}

      {/* Promote Dialog */}
      <PromoteAppDialog
        open={showPromoteDialog}
        onOpenChange={setShowPromoteDialog}
        app={{
          id: app.id,
          name: app.name,
          description: app.description ?? undefined,
          app_url: app.app_url,
          website_url: app.website_url ?? undefined,
        }}
        twitterEnabled={TWITTER_ENABLED}
      />
    </div>
  );
}
