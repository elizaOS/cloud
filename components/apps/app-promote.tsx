"use client";

/**
 * App Promote Tab
 *
 * Displays promotion options, history, and promotional asset management
 * for an app.
 */

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Megaphone,
  Share2,
  Image as ImageIcon,
  Video,
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
} from "lucide-react";
import { PromoteAppDialog } from "@/components/promotion/promote-app-dialog";
import Link from "next/link";
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
    guildName?: string;
    channelName?: string;
  };
  telegram: {
    enabled: boolean;
    botUsername?: string;
  };
  twitter: {
    enabled: boolean;
    username?: string;
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
    discord: { enabled: false },
    telegram: { enabled: false },
    twitter: { enabled: false },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isPostingTo, setIsPostingTo] = useState<string | null>(null);

  // Calculate total social posts from automation configs
  const discordConfig = app.discord_automation as {
    totalMessages?: number;
  } | null;
  const telegramConfig = app.telegram_automation as {
    totalMessages?: number;
    enabled?: boolean;
    botUsername?: string;
  } | null;
  const totalSocialPosts =
    (discordConfig?.totalMessages ?? 0) + (telegramConfig?.totalMessages ?? 0);

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

      // Check automation status from app data
      const discordAutomation = app.discord_automation as {
        enabled?: boolean;
        guildId?: string;
        channelId?: string;
      } | null;
      const telegramAutomation = app.telegram_automation as {
        enabled?: boolean;
        botUsername?: string;
      } | null;
      const twitterAutomation = app.twitter_automation as {
        enabled?: boolean;
      } | null;

      setAutomationStatus({
        discord: {
          enabled: discordAutomation?.enabled ?? false,
        },
        telegram: {
          enabled: telegramAutomation?.enabled ?? false,
          botUsername: telegramAutomation?.botUsername,
        },
        twitter: {
          enabled: TWITTER_ENABLED && (twitterAutomation?.enabled ?? false),
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
        }),
      });

      if (response.ok) {
        window.location.reload();
        return;
      }

      const data = await response.json().catch(() => ({}));
      toast.error(data.error || "Failed to generate assets. Please try again.");
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    }

    setIsGeneratingAssets(false);
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
      } else {
        toast.error(data.error || `Failed to post to ${platform}`);
      }
    } catch {
      toast.error("Network error. Please try again.");
    }

    setIsPostingTo(null);
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
            Reach more users through social media, SEO, and advertising
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
                onClick={() => handlePostNow("discord")}
                disabled={isPostingTo !== null}
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
                      Send announcement now
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
                onClick={() => handlePostNow("telegram")}
                disabled={isPostingTo !== null}
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
                      {automationStatus.telegram.botUsername
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
                onClick={() => handlePostNow("twitter")}
                disabled={isPostingTo !== null}
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
                      {twitterStatus.username
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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Promotional Assets
            </h3>
            <p className="text-white/60 text-sm">
              AI-generated images and copy for your campaigns
            </p>
          </div>
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

        <div className="grid grid-cols-4 gap-4">
          {/* Placeholder for generated assets */}
          <div className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-white/40 transition-colors cursor-pointer">
            <ImageIcon className="h-8 w-8 mb-2" />
            <span className="text-xs">Social Card</span>
          </div>
          <div className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-white/40 transition-colors cursor-pointer">
            <ImageIcon className="h-8 w-8 mb-2" />
            <span className="text-xs">Banner</span>
          </div>
          <div className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-white/40 transition-colors cursor-pointer">
            <Video className="h-8 w-8 mb-2" />
            <span className="text-xs">Video</span>
          </div>
          <div className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/40 hover:border-white/40 transition-colors cursor-pointer">
            <Plus className="h-8 w-8 mb-2" />
            <span className="text-xs">Upload</span>
          </div>
        </div>
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
              <div key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#FF5800]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[#FF5800] text-xs font-semibold">
                    {index + 1}
                  </span>
                </div>
                <p className="text-white/80 text-sm">{tip}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Estimated budget range:</span>
              <span className="text-white font-semibold">
                ${suggestions.estimatedBudget.min} - $
                {suggestions.estimatedBudget.max}
              </span>
            </div>
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
