"use client";

/**
 * Promote App Dialog
 *
 * A comprehensive promotion wizard that allows users to:
 * - Select promotion channels (social, SEO, advertising)
 * - Configure platform-specific settings
 * - Preview and launch promotions
 * - Track promotion status
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Share2,
  Search,
  Megaphone,
  CheckCircle,
  AlertCircle,
  Twitter,
  Bot,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  Send,
  Hash,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PromoteAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: {
    id: string;
    name: string;
    description?: string;
    app_url: string;
    website_url?: string;
  };
  twitterEnabled?: boolean;
  adAccounts?: Array<{
    id: string;
    name: string;
    platform: string;
  }>;
}

interface AgentCharacter {
  id: string;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  bio?: string | string[];
}

type PromotionChannel =
  | "social"
  | "seo"
  | "advertising"
  | "twitter_automation"
  | "telegram_automation"
  | "discord_automation";

interface TwitterAutomationConfig {
  enabled: boolean;
  autoPost: boolean;
  autoReply: boolean;
  autoEngage: boolean;
  discovery: boolean;
  postIntervalMin: number;
  postIntervalMax: number;
  agentCharacterId?: string;
}

interface TelegramAutomationConfig {
  enabled: boolean;
  channelId?: string;
  groupId?: string;
  autoReply: boolean;
  autoAnnounce: boolean;
  announceIntervalMin: number;
  announceIntervalMax: number;
  agentCharacterId?: string;
}

interface DiscordAutomationConfig {
  enabled: boolean;
  guildId?: string;
  channelId?: string;
  autoAnnounce: boolean;
  announceIntervalMin: number;
  announceIntervalMax: number;
  agentCharacterId?: string;
}

interface PromotionConfig {
  channels: PromotionChannel[];
  social?: {
    platforms: string[];
    customMessage?: string;
  };
  seo?: {
    generateMeta: boolean;
    generateSchema: boolean;
    submitToIndexNow: boolean;
  };
  advertising?: {
    platform: string;
    adAccountId: string;
    budget: number;
    budgetType: "daily" | "lifetime";
    objective: string;
    duration?: number;
  };
  twitterAutomation?: TwitterAutomationConfig;
  telegramAutomation?: TelegramAutomationConfig;
  discordAutomation?: DiscordAutomationConfig;
}

interface PostPreview {
  platform: "discord" | "telegram" | "twitter";
  content: string;
  type: string;
  timestamp: string;
}

const SOCIAL_PLATFORMS = [
  { id: "twitter", name: "Twitter/X", icon: "𝕏" },
  { id: "discord", name: "Discord", icon: "🎮" },
  { id: "telegram", name: "Telegram", icon: "✈️" },
];

const AD_OBJECTIVES = [
  {
    id: "awareness",
    name: "Brand Awareness",
    description: "Reach new audiences",
  },
  {
    id: "traffic",
    name: "Website Traffic",
    description: "Drive visits to your app",
  },
  {
    id: "engagement",
    name: "Engagement",
    description: "Get likes, comments, shares",
  },
  {
    id: "app_promotion",
    name: "App Installs",
    description: "Promote app downloads",
  },
];

export function PromoteAppDialog({
  open,
  onOpenChange,
  app,
  adAccounts = [],
}: PromoteAppDialogProps) {
  const [step, setStep] = useState<
    "channels" | "configure" | "review" | "result"
  >("channels");
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<PromotionConfig>({
    channels: [],
  });
  const [result, setResult] = useState<{
    success: boolean;
    channels: Record<string, { success: boolean; error?: string }>;
    totalCreditsUsed: number;
  } | null>(null);
  const [twitterStatus, setTwitterStatus] = useState<{
    configured: boolean;
    connected: boolean;
    username?: string;
  }>({ configured: false, connected: false });
  const [telegramStatus, setTelegramStatus] = useState<{
    configured: boolean;
    connected: boolean;
    botUsername?: string;
  }>({ configured: false, connected: false });
  const [telegramChats, setTelegramChats] = useState<
    Array<{
      id: string;
      type: string;
      title: string;
      username?: string;
      isAdmin: boolean;
      canPost: boolean;
    }>
  >([]);
  const [discordStatus, setDiscordStatus] = useState<{
    configured: boolean;
    connected: boolean;
    guilds: Array<{
      id: string;
      name: string;
      iconUrl: string | null;
      channelCount: number;
    }>;
  }>({ configured: false, connected: false, guilds: [] });
  const [discordChannels, setDiscordChannels] = useState<
    Array<{
      id: string;
      name: string;
      type: number;
      typeName: string;
      canSend: boolean;
    }>
  >([]);
  const [postPreviews, setPostPreviews] = useState<PostPreview[]>([]);
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false);
  const [userCharacters, setUserCharacters] = useState<AgentCharacter[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(true);

  // Track existing automation for each platform
  const [existingAutomation, setExistingAutomation] = useState<{
    discord: {
      exists: boolean;
      guildName?: string;
      channelName?: string;
      isPaused?: boolean;
    };
    telegram: { exists: boolean; chatTitle?: string; isPaused?: boolean };
    twitter: { exists: boolean };
  }>({
    discord: { exists: false },
    telegram: { exists: false },
    twitter: { exists: false },
  });
  // Whether to use existing automation config or set up new
  const [useExistingAutomation, setUseExistingAutomation] = useState<{
    discord: boolean;
    telegram: boolean;
    twitter: boolean;
  }>({
    discord: true,
    telegram: true,
    twitter: true,
  });

  // ========== WIZARD-STYLE TAB NAVIGATION ==========
  // Build ordered list of tabs based on selected channels
  const tabOrder = useMemo(() => {
    const tabs: string[] = [];
    // Add automation channels first (most likely to need config)
    if (config.channels.includes("discord_automation"))
      tabs.push("discord_automation");
    if (config.channels.includes("telegram_automation"))
      tabs.push("telegram_automation");
    if (config.channels.includes("twitter_automation"))
      tabs.push("twitter_automation");
    if (config.channels.includes("social")) tabs.push("social");
    if (config.channels.includes("seo")) tabs.push("seo");
    if (config.channels.includes("advertising")) tabs.push("advertising");
    return tabs;
  }, [config.channels]);

  const currentTabId = tabOrder[activeTabIndex] || tabOrder[0];
  const isLastTab = activeTabIndex >= tabOrder.length - 1;
  const hasAutomation = config.channels.some((c) =>
    [
      "twitter_automation",
      "telegram_automation",
      "discord_automation",
    ].includes(c)
  );

  // Validate current tab before advancing
  const validateCurrentTab = useCallback((): {
    valid: boolean;
    error?: string;
  } => {
    switch (currentTabId) {
      case "discord_automation":
        // Skip validation if using existing automation
        if (
          existingAutomation.discord.exists &&
          useExistingAutomation.discord
        ) {
          return { valid: true };
        }
        if (!config.discordAutomation?.guildId)
          return { valid: false, error: "Please select a Discord server" };
        if (!config.discordAutomation?.channelId)
          return { valid: false, error: "Please select a channel" };
        return { valid: true };
      case "telegram_automation":
        // Skip validation if using existing automation
        if (
          existingAutomation.telegram.exists &&
          useExistingAutomation.telegram
        ) {
          return { valid: true };
        }
        if (
          !config.telegramAutomation?.channelId &&
          !config.telegramAutomation?.groupId
        )
          return { valid: false, error: "Please select a channel or group" };
        return { valid: true };
      case "social":
        if (!config.social?.platforms || config.social.platforms.length === 0)
          return { valid: false, error: "Please select at least one platform" };
        return { valid: true };
      case "advertising":
        if (!config.advertising?.adAccountId)
          return { valid: false, error: "Please select an ad account" };
        if (!config.advertising?.budget || config.advertising.budget <= 0)
          return { valid: false, error: "Please set a budget" };
        return { valid: true };
      default:
        return { valid: true };
    }
  }, [currentTabId, config, existingAutomation, useExistingAutomation]);

  const goToNextTab = useCallback(() => {
    const validation = validateCurrentTab();
    if (!validation.valid) {
      toast.error(validation.error || "Please complete this configuration");
      return;
    }
    if (isLastTab) {
      // All tabs done - will call handleReviewStep below
      return "review";
    }
    setActiveTabIndex((prev) => prev + 1);
    return null;
  }, [validateCurrentTab, isLastTab]);

  const goToPrevTab = useCallback(() => {
    if (activeTabIndex > 0) {
      setActiveTabIndex((prev) => prev - 1);
    } else {
      setStep("channels");
      setActiveTabIndex(0);
    }
  }, [activeTabIndex]);

  // Reset tab index when going back to channel selection
  // This is handled in goToPrevTab when activeTabIndex is 0

  // Check Twitter, Telegram, and Discord connection status
  useEffect(() => {
    fetch("/api/v1/twitter/status")
      .then((res) => res.json())
      .then((data) => setTwitterStatus(data))
      .catch(() => setTwitterStatus({ configured: false, connected: false }));

    fetch("/api/v1/telegram/status")
      .then((res) => res.json())
      .then((data) => {
        setTelegramStatus(data);
        if (data.connected) {
          fetch("/api/v1/telegram/chats")
            .then((res) => res.json())
            .then((chatsData) => setTelegramChats(chatsData.chats || []))
            .catch(() => setTelegramChats([]));
        }
      })
      .catch(() => setTelegramStatus({ configured: false, connected: false }));

    fetch("/api/v1/discord/status")
      .then((res) => res.json())
      .then((data) => {
        setDiscordStatus(data);
      })
      .catch(() =>
        setDiscordStatus({ configured: false, connected: false, guilds: [] })
      );
  }, []);

  // Fetch existing automation status for this app
  useEffect(() => {
    // Discord automation
    fetch(`/api/v1/apps/${app.id}/discord-automation`)
      .then((res) => res.json())
      .then((data) => {
        // Check if automation was ever configured (has channel), not just if enabled
        // This way paused automations are still detected as "existing"
        const exists = Boolean(data.channelId);
        setExistingAutomation((prev) => ({
          ...prev,
          discord: {
            exists,
            guildName: data.guildName,
            channelName: data.channelName,
            isPaused: exists && !data.enabled,
          },
        }));
      })
      .catch(() => {
        setExistingAutomation((prev) => ({
          ...prev,
          discord: { exists: false },
        }));
      });

    // Telegram automation
    fetch(`/api/v1/apps/${app.id}/telegram-automation`)
      .then((res) => res.json())
      .then((data) => {
        // Check if automation was ever configured, not just if enabled
        const exists = Boolean(data.channelId || data.groupId);
        setExistingAutomation((prev) => ({
          ...prev,
          telegram: {
            exists,
            chatTitle: data.channelName || data.groupName,
            isPaused: exists && !data.enabled,
          },
        }));
      })
      .catch(() => {
        setExistingAutomation((prev) => ({
          ...prev,
          telegram: { exists: false },
        }));
      });

    // Twitter automation
    fetch(`/api/v1/apps/${app.id}/twitter-automation`)
      .then((res) => res.json())
      .then((data) => {
        setExistingAutomation((prev) => ({
          ...prev,
          twitter: { exists: Boolean(data.autoPost || data.enabled) },
        }));
      })
      .catch(() => {
        setExistingAutomation((prev) => ({
          ...prev,
          twitter: { exists: false },
        }));
      });
  }, [app.id]);

  // Fetch user characters for agent voice selection
  useEffect(() => {
    fetch("/api/my-agents/characters?limit=50")
      .then((res) => res.json())
      .then((data) => setUserCharacters(data?.data?.characters || []))
      .catch(() => setUserCharacters([]))
      .finally(() => setIsLoadingCharacters(false));
  }, []);

  // Helper to get selected character
  const selectedCharacter = useMemo(
    () => userCharacters.find((c) => c.id === selectedCharacterId),
    [selectedCharacterId, userCharacters]
  );

  // Helper to get bio preview
  const getBioPreview = (bio: string | string[] | undefined): string => {
    if (!bio) return "No description";
    const text = Array.isArray(bio) ? bio[0] : bio;
    return text.length > 80 ? text.slice(0, 77) + "..." : text;
  };

  const toggleChannel = (channel: PromotionChannel) => {
    setConfig((prev) => {
      const isRemoving = prev.channels.includes(channel);
      const newChannels = isRemoving
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel];

      // Initialize automation config with valid defaults when adding channel
      const updates: Partial<PromotionConfig> = { channels: newChannels };

      if (!isRemoving) {
        if (channel === "discord_automation" && !prev.discordAutomation) {
          updates.discordAutomation = {
            enabled: true,
            autoAnnounce: true,
            announceIntervalMin: 60,
            announceIntervalMax: 240,
          };
        }
        if (channel === "telegram_automation" && !prev.telegramAutomation) {
          updates.telegramAutomation = {
            enabled: true,
            autoReply: true,
            autoAnnounce: true,
            announceIntervalMin: 60,
            announceIntervalMax: 240,
          };
        }
        if (channel === "twitter_automation" && !prev.twitterAutomation) {
          updates.twitterAutomation = {
            enabled: true,
            autoPost: true,
            autoReply: true,
            autoEngage: false,
            discovery: false,
            postIntervalMin: 90,
            postIntervalMax: 180,
          };
        }
      }

      return { ...prev, ...updates };
    });
  };

  const toggleSocialPlatform = (platformId: string) => {
    setConfig((prev) => ({
      ...prev,
      social: {
        ...prev.social,
        platforms: prev.social?.platforms?.includes(platformId)
          ? prev.social.platforms.filter((p) => p !== platformId)
          : [...(prev.social?.platforms || []), platformId],
      },
    }));
  };

  const handlePromote = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    // Build config with agentCharacterId and useExisting flags
    // If useExisting is true, we don't send config details (just triggers a post)
    const configWithCharacter = {
      ...config,
      twitterAutomation: config.twitterAutomation
        ? {
            ...config.twitterAutomation,
            agentCharacterId: selectedCharacterId || undefined,
            useExisting:
              existingAutomation.twitter.exists &&
              useExistingAutomation.twitter,
          }
        : undefined,
      telegramAutomation: config.telegramAutomation
        ? existingAutomation.telegram.exists && useExistingAutomation.telegram
          ? {
              useExisting: true,
              agentCharacterId: selectedCharacterId || undefined,
            }
          : {
              ...config.telegramAutomation,
              agentCharacterId: selectedCharacterId || undefined,
              useExisting: false,
            }
        : undefined,
      discordAutomation: config.discordAutomation
        ? existingAutomation.discord.exists && useExistingAutomation.discord
          ? {
              useExisting: true,
              agentCharacterId: selectedCharacterId || undefined,
            }
          : {
              ...config.discordAutomation,
              agentCharacterId: selectedCharacterId || undefined,
              useExisting: false,
            }
        : undefined,
    };

    let data: {
      appId: string;
      appName: string;
      appUrl: string;
      channels: Record<string, { success: boolean; error?: string }>;
      totalCreditsUsed: number;
      errors?: string[];
    };
    try {
      const response = await fetch(`/api/v1/apps/${app.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configWithCharacter),
      });

      data = await response.json();

      // Handle both 200 (full success) and 207 (partial success)
      if (response.ok || response.status === 207) {
        // Build channels object with only the channels that have results
        const channelResults: Record<
          string,
          { success: boolean; error?: string }
        > = {};
        if (data.channels?.social) channelResults.social = data.channels.social;
        if (data.channels?.seo) channelResults.seo = data.channels.seo;
        if (data.channels?.advertising)
          channelResults.advertising = data.channels.advertising;
        if (data.channels?.twitterAutomation)
          channelResults["Twitter Automation"] =
            data.channels.twitterAutomation;
        if (data.channels?.telegramAutomation)
          channelResults["Telegram Automation"] =
            data.channels.telegramAutomation;
        if (data.channels?.discordAutomation)
          channelResults["Discord Automation"] =
            data.channels.discordAutomation;

        setResult({
          success: data.errors?.length === 0,
          channels: channelResults,
          totalCreditsUsed: data.totalCreditsUsed,
        });
        setStep("result");

        // Show appropriate message based on status
        if (response.status === 207 && data.errors && data.errors.length > 0) {
          toast.warning(
            `Promotion partially successful. ${data.errors.length} channel(s) had issues.`
          );
          // Show specific errors
          for (const error of data.errors) {
            toast.error(error, { duration: 5000 });
          }
        } else {
          toast.success("Promotion launched successfully!");
        }

        setIsLoading(false);
        return;
      }
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      setIsLoading(false);
      return;
    }

    toast.error("Failed to launch promotion. Please try again.");
    setIsLoading(false);
  }, [
    app.id,
    config,
    isLoading,
    selectedCharacterId,
    existingAutomation,
    useExistingAutomation,
  ]);

  const handleClose = () => {
    setStep("channels");
    setActiveTabIndex(0);
    setConfig({ channels: [] });
    setResult(null);
    setPostPreviews([]);
    setSelectedCharacterId(null);
    // Reset "use existing" flags to default (true = prefer existing)
    setUseExistingAutomation({
      discord: true,
      telegram: true,
      twitter: true,
    });
    onOpenChange(false);
  };

  const fetchPreviews = useCallback(async () => {
    if (isLoadingPreviews) return;

    const platforms: ("discord" | "telegram" | "twitter")[] = [];
    if (config.channels.includes("discord_automation"))
      platforms.push("discord");
    if (config.channels.includes("telegram_automation"))
      platforms.push("telegram");
    if (config.channels.includes("twitter_automation"))
      platforms.push("twitter");

    if (platforms.length === 0) return;

    setIsLoadingPreviews(true);
    setPostPreviews([]);

    fetch(`/api/v1/apps/${app.id}/promote/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platforms,
        count: 3,
        agentCharacterId: selectedCharacterId || undefined,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.previews) {
          setPostPreviews(data.previews);
          // Show warning if some platforms failed
          if (data.errors && data.errors.length > 0) {
            toast.warning(
              `Preview generated for ${data.previews.length} post(s). ${data.errors.length} platform(s) failed.`,
              { duration: 5000 }
            );
          }
        }
      })
      .catch(() => {
        toast.error("Failed to generate previews");
      })
      .finally(() => {
        setIsLoadingPreviews(false);
      });
  }, [app.id, config.channels, isLoadingPreviews, selectedCharacterId]);

  // Validate configuration before proceeding to review
  const validateConfiguration = useCallback((): {
    valid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];

    // Validate Telegram automation (skip if using existing)
    if (config.channels.includes("telegram_automation")) {
      if (
        !(existingAutomation.telegram.exists && useExistingAutomation.telegram)
      ) {
        const telegramConfig = config.telegramAutomation;
        if (!telegramConfig?.channelId && !telegramConfig?.groupId) {
          errors.push(
            "📱 Telegram Bot: Click the 'Telegram Bot' tab and select a channel or group to post in"
          );
        }
      }
    }

    // Validate Discord automation (skip if using existing)
    if (config.channels.includes("discord_automation")) {
      if (
        !(existingAutomation.discord.exists && useExistingAutomation.discord)
      ) {
        const discordConfig = config.discordAutomation;
        if (!discordConfig?.guildId) {
          errors.push(
            "🎮 Discord Bot: Click the 'Discord Bot' tab and select a server"
          );
        } else if (!discordConfig?.channelId) {
          errors.push(
            "🎮 Discord Bot: Click the 'Discord Bot' tab and select a channel"
          );
        }
      }
    }

    // Validate Social media
    if (config.channels.includes("social")) {
      if (!config.social?.platforms || config.social.platforms.length === 0) {
        errors.push(
          "📢 Social Media: Click the 'Social Media' tab and select at least one platform"
        );
      }
    }

    // Validate Advertising
    if (config.channels.includes("advertising")) {
      if (!config.advertising?.adAccountId) {
        errors.push(
          "📊 Advertising: Click the 'Advertising' tab and select an ad account"
        );
      } else if (
        !config.advertising?.budget ||
        config.advertising.budget <= 0
      ) {
        errors.push(
          "📊 Advertising: Click the 'Advertising' tab and set a budget"
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }, [config, existingAutomation, useExistingAutomation]);

  const handleReviewStep = useCallback(() => {
    // Validate configuration first
    const validation = validateConfiguration();

    if (!validation.valid) {
      // Show validation errors with clear guidance
      const errorMessage = validation.errors.join("\n• ");
      toast.error(`Please complete configuration:\n• ${errorMessage}`, {
        duration: 6000,
      });
      return;
    }

    setStep("review");
    fetchPreviews();
  }, [validateConfiguration, fetchPreviews]);

  // Automation setup is FREE - no cost to display
  // Post generation costs are hidden to encourage engagement
  const getCostDisplay = () => "Free";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl bg-black/90 backdrop-blur-xl border-white/10 rounded-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-white/10">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Megaphone className="h-5 w-5 text-[#FF5800]" />
            Promote {app.name}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Launch your app across multiple channels to reach more users
          </DialogDescription>
        </DialogHeader>

        {step === "channels" && (
          <div className="flex flex-col max-h-[calc(80vh-120px)]">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {/* Social Channel */}
                <button
                  type="button"
                  onClick={() => toggleChannel("social")}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    config.channels.includes("social")
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <Share2 className="h-6 w-6 mb-2 text-blue-400" />
                  <h3 className="font-semibold text-white text-sm">
                    Social Media
                  </h3>
                  <p className="text-xs text-white/60 mt-1">
                    Post to Twitter, LinkedIn, Discord...
                  </p>
                  <Badge
                    variant="secondary"
                    className="mt-2 bg-white/10 text-white/70 text-xs"
                  >
                    ~$0.02/post
                  </Badge>
                </button>

                {/* SEO Channel */}
                <button
                  type="button"
                  onClick={() => toggleChannel("seo")}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    config.channels.includes("seo")
                      ? "border-green-500 bg-green-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <Search className="h-6 w-6 mb-2 text-green-400" />
                  <h3 className="font-semibold text-white text-sm">SEO</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Optimize for search engines
                  </p>
                  <Badge
                    variant="secondary"
                    className="mt-2 bg-white/10 text-white/70 text-xs"
                  >
                    ~$0.03
                  </Badge>
                </button>

                {/* Advertising Channel */}
                <button
                  type="button"
                  onClick={() => toggleChannel("advertising")}
                  disabled={adAccounts.length === 0}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    config.channels.includes("advertising")
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  } ${adAccounts.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Megaphone className="h-6 w-6 mb-2 text-purple-400" />
                  <h3 className="font-semibold text-white text-sm">
                    Advertising
                  </h3>
                  <p className="text-xs text-white/60 mt-1">
                    Run paid ad campaigns
                  </p>
                  {adAccounts.length === 0 ? (
                    <Badge
                      variant="outline"
                      className="mt-2 border-white/20 text-white/50 text-xs"
                    >
                      Connect account first
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-white/10 text-white/70 text-xs"
                    >
                      Custom budget
                    </Badge>
                  )}
                </button>
              </div>

              {/* Twitter Automation - Full width section */}
              <div className="pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => toggleChannel("twitter_automation")}
                  disabled={!twitterStatus.connected}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    config.channels.includes("twitter_automation")
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  } ${!twitterStatus.connected ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-sky-400" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">
                          Twitter/X Automation
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-xs bg-white/10 text-white/70"
                        >
                          AI Agent
                        </Badge>
                      </div>
                      <p className="text-xs text-white/60 mt-1 line-clamp-2">
                        Deploy an AI agent to autonomously promote your app on
                        Twitter. Posts in your app&apos;s voice, engages with
                        mentions, and grows your audience 24/7.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Auto-posting
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Reply to mentions
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Engagement
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Discovery
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {!twitterStatus.configured ? (
                        <Badge
                          variant="outline"
                          className="border-white/20 text-white/50 text-xs"
                        >
                          Not configured
                        </Badge>
                      ) : !twitterStatus.connected ? (
                        <Link
                          href="/dashboard/settings?tab=connections"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex"
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer border-white/20 text-white/60 hover:bg-sky-500/10 hover:border-sky-500/50 transition-colors text-xs"
                          >
                            Connect Twitter
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Badge>
                        </Link>
                      ) : (
                        <div>
                          <Badge
                            variant="default"
                            className="bg-sky-500 text-xs"
                          >
                            @{twitterStatus.username}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* Telegram Automation */}
                <button
                  type="button"
                  onClick={() => toggleChannel("telegram_automation")}
                  disabled={!telegramStatus.connected}
                  className={`w-full p-4 rounded-lg border text-left transition-all mt-3 ${
                    config.channels.includes("telegram_automation")
                      ? "border-[#0088cc] bg-[#0088cc]/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  } ${!telegramStatus.connected ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-[#0088cc]/20 flex items-center justify-center">
                        <svg
                          className="h-5 w-5 text-[#0088cc]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">
                          Telegram Bot Automation
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-xs bg-white/10 text-white/70"
                        >
                          AI Bot
                        </Badge>
                      </div>
                      <p className="text-xs text-white/60 mt-1 line-clamp-2">
                        Deploy a Telegram bot to announce updates, answer
                        questions, and engage with your community in channels
                        and groups.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Announcements
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Commands
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {!telegramStatus.connected ? (
                        <Link
                          href="/dashboard/settings?tab=connections"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex"
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer border-white/20 text-white/60 hover:bg-[#0088cc]/10 hover:border-[#0088cc]/50 transition-colors text-xs"
                          >
                            Connect Telegram
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Badge>
                        </Link>
                      ) : (
                        <div>
                          <Badge
                            variant="default"
                            className="bg-[#0088cc] text-xs"
                          >
                            @{telegramStatus.botUsername}
                          </Badge>
                          <p className="text-xs text-white/50 mt-1">
                            Bot Connected
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* Discord Automation */}
                <button
                  type="button"
                  onClick={() => toggleChannel("discord_automation")}
                  disabled={!discordStatus.connected}
                  className={`w-full p-4 rounded-lg border text-left transition-all mt-3 ${
                    config.channels.includes("discord_automation")
                      ? "border-[#5865F2] bg-[#5865F2]/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  } ${!discordStatus.connected ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-[#5865F2]/20 flex items-center justify-center">
                        <svg
                          className="h-5 w-5 text-[#5865F2]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">
                          Discord Bot Automation
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-xs bg-white/10 text-white/70"
                        >
                          AI Bot
                        </Badge>
                      </div>
                      <p className="text-xs text-white/60 mt-1 line-clamp-2">
                        Deploy a Discord bot to post announcements and share app
                        updates with your Discord community.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Announcements
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Rich Embeds
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          Action Buttons
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {!discordStatus.connected ? (
                        <Link
                          href="/dashboard/settings?tab=connections"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex"
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer border-white/20 text-white/60 hover:bg-[#5865F2]/10 hover:border-[#5865F2]/50 transition-colors text-xs"
                          >
                            Add to Discord
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Badge>
                        </Link>
                      ) : (
                        <div>
                          <Badge
                            variant="default"
                            className="bg-[#5865F2] text-xs"
                          >
                            {discordStatus.guilds.length} Server
                            {discordStatus.guilds.length !== 1 ? "s" : ""}
                          </Badge>
                          <p className="text-xs text-white/50 mt-1">
                            Bot Connected
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center p-6 pt-4 border-t border-white/10 bg-black/50">
              <div className="text-sm text-white/60">
                {config.channels.length === 0
                  ? "Select at least one channel"
                  : `${config.channels.length} channel(s) selected`}
              </div>
              <Button
                onClick={() => {
                  setActiveTabIndex(0);
                  setStep("configure");
                }}
                disabled={config.channels.length === 0}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                Continue →
              </Button>
            </div>
          </div>
        )}

        {step === "configure" && (
          <div className="flex flex-col max-h-[calc(80vh-120px)]">
            {/* Progress Indicator */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/60">
                  Step {activeTabIndex + 1} of {tabOrder.length}
                </span>
                <span className="text-sm text-white/80 font-medium">
                  {currentTabId === "discord_automation" && "Discord Bot"}
                  {currentTabId === "telegram_automation" && "Telegram Bot"}
                  {currentTabId === "twitter_automation" &&
                    "Twitter Automation"}
                  {currentTabId === "social" && "Social Media"}
                  {currentTabId === "seo" && "SEO Settings"}
                  {currentTabId === "advertising" && "Advertising"}
                </span>
              </div>
              <div className="flex gap-1">
                {tabOrder.map((tabId, i) => (
                  <div
                    key={tabId}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i < activeTabIndex
                        ? "bg-green-500"
                        : i === activeTabIndex
                          ? "bg-[#FF5800]"
                          : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>

            <Tabs
              value={currentTabId}
              onValueChange={(val) => {
                const newIndex = tabOrder.indexOf(val);
                if (newIndex !== -1 && newIndex <= activeTabIndex) {
                  setActiveTabIndex(newIndex);
                }
              }}
              className="w-full flex flex-col flex-1 overflow-hidden"
            >
              <TabsList className="w-full justify-start mx-6 mt-2 bg-white/5 border border-white/10 shrink-0">
                {config.channels.includes("social") && (
                  <TabsTrigger value="social" className="relative">
                    Social Media
                    {(!config.social?.platforms ||
                      config.social.platforms.length === 0) && (
                      <span className="ml-2 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                    )}
                  </TabsTrigger>
                )}
                {config.channels.includes("seo") && (
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                )}
                {config.channels.includes("advertising") && (
                  <TabsTrigger value="advertising" className="relative">
                    Advertising
                    {(!config.advertising?.adAccountId ||
                      !config.advertising?.budget) && (
                      <span className="ml-2 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                    )}
                  </TabsTrigger>
                )}
                {config.channels.includes("twitter_automation") && (
                  <TabsTrigger value="twitter_automation">
                    Twitter Automation
                  </TabsTrigger>
                )}
                {config.channels.includes("telegram_automation") && (
                  <TabsTrigger value="telegram_automation" className="relative">
                    Telegram Bot
                    {!config.telegramAutomation?.channelId &&
                      !config.telegramAutomation?.groupId && (
                        <span className="ml-2 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                      )}
                  </TabsTrigger>
                )}
                {config.channels.includes("discord_automation") && (
                  <TabsTrigger value="discord_automation" className="relative">
                    Discord Bot
                    {(!config.discordAutomation?.guildId ||
                      !config.discordAutomation?.channelId) && (
                      <span className="ml-2 h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                    )}
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="flex-1 overflow-y-auto p-6 pt-4">
                {/* Agent Voice Selector - Shows when any automation channel is selected */}
                {(config.channels.includes("twitter_automation") ||
                  config.channels.includes("telegram_automation") ||
                  config.channels.includes("discord_automation")) && (
                  <div className="mb-6 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-5 w-5 text-purple-400" />
                      <h3 className="text-base font-semibold text-white">
                        Agent Voice (Optional)
                      </h3>
                    </div>
                    <p className="text-sm text-white/60 mb-4">
                      Choose a character to give your automated posts a unique
                      personality and style. This applies to all automation
                      channels.
                    </p>

                    {isLoadingCharacters ? (
                      <div className="flex items-center justify-center p-8 bg-white/5 rounded-lg">
                        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                      </div>
                    ) : (
                      <ScrollArea className="h-[180px] rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="space-y-2">
                          {/* Default Voice Option */}
                          <button
                            type="button"
                            onClick={() => setSelectedCharacterId(null)}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                              selectedCharacterId === null
                                ? "border-purple-500 bg-purple-500/10"
                                : "border-white/10 bg-white/5 hover:border-white/20"
                            }`}
                          >
                            <div className="flex-shrink-0">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-white" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white">
                                Default Voice
                              </div>
                              <div className="text-xs text-white/60">
                                Professional and engaging tone
                              </div>
                            </div>
                            {selectedCharacterId === null && (
                              <CheckCircle className="h-5 w-5 text-purple-400 flex-shrink-0" />
                            )}
                          </button>

                          {/* User Characters */}
                          {userCharacters.map((character) => (
                            <button
                              key={character.id}
                              type="button"
                              onClick={() =>
                                setSelectedCharacterId(character.id)
                              }
                              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                                selectedCharacterId === character.id
                                  ? "border-purple-500 bg-purple-500/10"
                                  : "border-white/10 bg-white/5 hover:border-white/20"
                              }`}
                            >
                              <div className="flex-shrink-0">
                                {character.avatar_url || character.avatarUrl ? (
                                  <Image
                                    src={
                                      character.avatar_url ||
                                      character.avatarUrl ||
                                      ""
                                    }
                                    alt={character.name}
                                    width={40}
                                    height={40}
                                    className="rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center">
                                    <Users className="h-5 w-5 text-white" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white truncate">
                                  {character.name}
                                </div>
                                <div className="text-xs text-white/60 truncate">
                                  {getBioPreview(character.bio)}
                                </div>
                              </div>
                              {selectedCharacterId === character.id && (
                                <CheckCircle className="h-5 w-5 text-purple-400 flex-shrink-0" />
                              )}
                            </button>
                          ))}

                          {userCharacters.length === 0 && (
                            <div className="text-center py-6 text-white/60">
                              <p className="text-sm">No characters available</p>
                              <p className="text-xs mt-1">
                                Create characters in{" "}
                                <Link
                                  href="/my-agents"
                                  className="text-purple-400 hover:text-purple-300 underline"
                                >
                                  My Agents
                                </Link>
                              </p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                )}

                {/* Social Media Config */}
                <TabsContent value="social" className="space-y-4 mt-0">
                  <div>
                    <Label className="mb-2 block text-white/80">
                      Select Platforms
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <label
                          key={platform.id}
                          className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                            config.social?.platforms?.includes(platform.id)
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-white/10 bg-white/5 hover:border-white/20"
                          }`}
                        >
                          <Checkbox
                            checked={config.social?.platforms?.includes(
                              platform.id
                            )}
                            onCheckedChange={() =>
                              toggleSocialPlatform(platform.id)
                            }
                          />
                          <span className="text-lg">{platform.icon}</span>
                          <span className="text-sm text-white">
                            {platform.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="customMessage" className="text-white/80">
                      Custom Message (optional)
                    </Label>
                    <Textarea
                      id="customMessage"
                      placeholder="Leave blank to auto-generate..."
                      value={config.social?.customMessage || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          social: {
                            ...prev.social,
                            platforms: prev.social?.platforms || [],
                            customMessage: e.target.value,
                          },
                        }))
                      }
                      className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                      rows={3}
                    />
                  </div>
                </TabsContent>

                {/* SEO Config */}
                <TabsContent value="seo" className="space-y-4 mt-0">
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10">
                      <Checkbox
                        checked={config.seo?.generateMeta ?? true}
                        onCheckedChange={(checked) =>
                          setConfig((prev) => ({
                            ...prev,
                            seo: {
                              ...prev.seo,
                              generateMeta: !!checked,
                              generateSchema: prev.seo?.generateSchema ?? true,
                              submitToIndexNow:
                                prev.seo?.submitToIndexNow ?? true,
                            },
                          }))
                        }
                      />
                      <div>
                        <div className="font-medium text-white">
                          Generate Meta Tags
                        </div>
                        <div className="text-sm text-white/60">
                          AI-generated title, description, and keywords
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10">
                      <Checkbox
                        checked={config.seo?.generateSchema ?? true}
                        onCheckedChange={(checked) =>
                          setConfig((prev) => ({
                            ...prev,
                            seo: {
                              ...prev.seo,
                              generateSchema: !!checked,
                              generateMeta: prev.seo?.generateMeta ?? true,
                              submitToIndexNow:
                                prev.seo?.submitToIndexNow ?? true,
                            },
                          }))
                        }
                      />
                      <div>
                        <div className="font-medium text-white">
                          Generate Schema.org Data
                        </div>
                        <div className="text-sm text-white/60">
                          Structured data for rich search results
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10">
                      <Checkbox
                        checked={config.seo?.submitToIndexNow ?? true}
                        onCheckedChange={(checked) =>
                          setConfig((prev) => ({
                            ...prev,
                            seo: {
                              ...prev.seo,
                              submitToIndexNow: !!checked,
                              generateMeta: prev.seo?.generateMeta ?? true,
                              generateSchema: prev.seo?.generateSchema ?? true,
                            },
                          }))
                        }
                      />
                      <div>
                        <div className="font-medium text-white">
                          Submit to IndexNow
                        </div>
                        <div className="text-sm text-white/60">
                          Notify search engines of your new content
                        </div>
                      </div>
                    </label>
                  </div>
                </TabsContent>

                {/* Advertising Config */}
                <TabsContent value="advertising" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="adAccount" className="text-white/80">
                        Ad Account
                      </Label>
                      <Select
                        value={config.advertising?.adAccountId}
                        onValueChange={(value) => {
                          const account = adAccounts.find(
                            (a) => a.id === value
                          );
                          setConfig((prev) => ({
                            ...prev,
                            advertising: {
                              ...prev.advertising,
                              adAccountId: value,
                              platform: account?.platform || "meta",
                              budget: prev.advertising?.budget || 10,
                              budgetType:
                                prev.advertising?.budgetType || "daily",
                              objective:
                                prev.advertising?.objective || "traffic",
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {adAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.platform})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="objective" className="text-white/80">
                        Objective
                      </Label>
                      <Select
                        value={config.advertising?.objective}
                        onValueChange={(value) =>
                          setConfig((prev) => ({
                            ...prev,
                            advertising: {
                              ...prev.advertising!,
                              objective: value,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Select objective" />
                        </SelectTrigger>
                        <SelectContent>
                          {AD_OBJECTIVES.map((obj) => (
                            <SelectItem key={obj.id} value={obj.id}>
                              {obj.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="budget" className="text-white/80">
                        Budget ($)
                      </Label>
                      <Input
                        id="budget"
                        type="number"
                        min={1}
                        max={10000}
                        value={config.advertising?.budget || 10}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            advertising: {
                              ...prev.advertising!,
                              budget: parseFloat(e.target.value) || 10,
                            },
                          }))
                        }
                        className="bg-white/5 border-white/10 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="budgetType" className="text-white/80">
                        Budget Type
                      </Label>
                      <Select
                        value={config.advertising?.budgetType || "daily"}
                        onValueChange={(value: "daily" | "lifetime") =>
                          setConfig((prev) => ({
                            ...prev,
                            advertising: {
                              ...prev.advertising!,
                              budgetType: value,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily Budget</SelectItem>
                          <SelectItem value="lifetime">Total Budget</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                {/* Twitter Automation Config */}
                <TabsContent
                  value="twitter_automation"
                  className="space-y-4 mt-0"
                >
                  <div className="bg-sky-500/10 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-5 w-5 text-sky-400" />
                      <span className="font-medium text-white">
                        Connected as @{twitterStatus.username}
                      </span>
                    </div>
                    <p className="text-sm text-white/60">
                      Your AI agent will post and engage using this Twitter
                      account, promoting {app.name} autonomously.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-base font-medium">
                        Automation Features
                      </Label>

                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={config.twitterAutomation?.autoPost ?? true}
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({
                              ...prev,
                              twitterAutomation: {
                                enabled: true,
                                autoPost: !!checked,
                                autoReply:
                                  prev.twitterAutomation?.autoReply ?? true,
                                autoEngage:
                                  prev.twitterAutomation?.autoEngage ?? false,
                                discovery:
                                  prev.twitterAutomation?.discovery ?? false,
                                postIntervalMin:
                                  prev.twitterAutomation?.postIntervalMin ?? 90,
                                postIntervalMax:
                                  prev.twitterAutomation?.postIntervalMax ??
                                  150,
                              },
                            }))
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">Auto-Post</div>
                          <div className="text-sm text-muted-foreground">
                            Generate and post tweets about your app
                            automatically
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={config.twitterAutomation?.autoReply ?? true}
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({
                              ...prev,
                              twitterAutomation: {
                                enabled: true,
                                autoPost:
                                  prev.twitterAutomation?.autoPost ?? true,
                                autoReply: !!checked,
                                autoEngage:
                                  prev.twitterAutomation?.autoEngage ?? false,
                                discovery:
                                  prev.twitterAutomation?.discovery ?? false,
                                postIntervalMin:
                                  prev.twitterAutomation?.postIntervalMin ?? 90,
                                postIntervalMax:
                                  prev.twitterAutomation?.postIntervalMax ??
                                  150,
                              },
                            }))
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">Reply to Mentions</div>
                          <div className="text-sm text-muted-foreground">
                            Automatically respond to users who mention you
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={
                            config.twitterAutomation?.autoEngage ?? false
                          }
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({
                              ...prev,
                              twitterAutomation: {
                                enabled: true,
                                autoPost:
                                  prev.twitterAutomation?.autoPost ?? true,
                                autoReply:
                                  prev.twitterAutomation?.autoReply ?? true,
                                autoEngage: !!checked,
                                discovery:
                                  prev.twitterAutomation?.discovery ?? false,
                                postIntervalMin:
                                  prev.twitterAutomation?.postIntervalMin ?? 90,
                                postIntervalMax:
                                  prev.twitterAutomation?.postIntervalMax ??
                                  150,
                              },
                            }))
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">Timeline Engagement</div>
                          <div className="text-sm text-muted-foreground">
                            Like, retweet, and quote relevant tweets
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                        <Checkbox
                          checked={config.twitterAutomation?.discovery ?? false}
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({
                              ...prev,
                              twitterAutomation: {
                                enabled: true,
                                autoPost:
                                  prev.twitterAutomation?.autoPost ?? true,
                                autoReply:
                                  prev.twitterAutomation?.autoReply ?? true,
                                autoEngage:
                                  prev.twitterAutomation?.autoEngage ?? false,
                                discovery: !!checked,
                                postIntervalMin:
                                  prev.twitterAutomation?.postIntervalMin ?? 90,
                                postIntervalMax:
                                  prev.twitterAutomation?.postIntervalMax ??
                                  150,
                              },
                            }))
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">Discovery Mode</div>
                          <div className="text-sm text-muted-foreground">
                            Find and follow relevant accounts to grow audience
                          </div>
                        </div>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <Label htmlFor="postIntervalMin">
                          Min Post Interval (minutes)
                        </Label>
                        <Input
                          id="postIntervalMin"
                          type="number"
                          min={30}
                          max={1440}
                          value={
                            config.twitterAutomation?.postIntervalMin ?? 90
                          }
                          onChange={(e) => {
                            const value = Math.max(
                              30,
                              Math.min(1440, parseInt(e.target.value) || 90)
                            );
                            setConfig((prev) => ({
                              ...prev,
                              twitterAutomation: {
                                ...prev.twitterAutomation!,
                                enabled: true,
                                autoPost:
                                  prev.twitterAutomation?.autoPost ?? true,
                                autoReply:
                                  prev.twitterAutomation?.autoReply ?? true,
                                autoEngage:
                                  prev.twitterAutomation?.autoEngage ?? false,
                                discovery:
                                  prev.twitterAutomation?.discovery ?? false,
                                postIntervalMin: value,
                                postIntervalMax:
                                  prev.twitterAutomation?.postIntervalMax ??
                                  180,
                              },
                            }));
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor="postIntervalMax">
                          Max Post Interval (minutes)
                        </Label>
                        <Input
                          id="postIntervalMax"
                          type="number"
                          min={60}
                          max={1440}
                          value={
                            config.twitterAutomation?.postIntervalMax ?? 180
                          }
                          onChange={(e) => {
                            const value = Math.max(
                              60,
                              Math.min(1440, parseInt(e.target.value) || 180)
                            );
                            setConfig((prev) => ({
                              ...prev,
                              twitterAutomation: {
                                ...prev.twitterAutomation!,
                                enabled: true,
                                autoPost:
                                  prev.twitterAutomation?.autoPost ?? true,
                                autoReply:
                                  prev.twitterAutomation?.autoReply ?? true,
                                autoEngage:
                                  prev.twitterAutomation?.autoEngage ?? false,
                                discovery:
                                  prev.twitterAutomation?.discovery ?? false,
                                postIntervalMin:
                                  prev.twitterAutomation?.postIntervalMin ?? 90,
                                postIntervalMax: value,
                              },
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Telegram Automation Config */}
                <TabsContent value="telegram_automation" className="space-y-4">
                  {/* Show existing automation card if it exists */}
                  {existingAutomation.telegram.exists ? (
                    <div className="space-y-4">
                      <div
                        className={`${existingAutomation.telegram.isPaused ? "bg-yellow-500/10 border-yellow-500/30" : "bg-green-500/10 border-green-500/30"} border rounded-lg p-4`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle
                            className={`h-5 w-5 ${existingAutomation.telegram.isPaused ? "text-yellow-400" : "text-green-400"}`}
                          />
                          <span className="font-medium text-white">
                            Telegram Automation{" "}
                            {existingAutomation.telegram.isPaused
                              ? "(Paused)"
                              : "Active"}
                          </span>
                        </div>
                        <p className="text-sm text-white/60">
                          {existingAutomation.telegram.isPaused
                            ? "Was"
                            : "Currently"}{" "}
                          posting to{" "}
                          <span className="text-white font-medium">
                            {existingAutomation.telegram.chatTitle ||
                              "channel/group"}
                          </span>
                        </p>
                      </div>

                      {/* Toggle between using existing or reconfiguring */}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={
                            useExistingAutomation.telegram
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setUseExistingAutomation((prev) => ({
                              ...prev,
                              telegram: true,
                            }))
                          }
                          className={
                            useExistingAutomation.telegram
                              ? "bg-[#FF5800] hover:bg-[#FF5800]/90 flex-1"
                              : "flex-1"
                          }
                        >
                          Post using existing
                        </Button>
                        <Button
                          type="button"
                          variant={
                            !useExistingAutomation.telegram
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setUseExistingAutomation((prev) => ({
                              ...prev,
                              telegram: false,
                            }))
                          }
                          className={
                            !useExistingAutomation.telegram
                              ? "bg-[#FF5800] hover:bg-[#FF5800]/90 flex-1"
                              : "flex-1"
                          }
                        >
                          Update settings
                        </Button>
                      </div>

                      {/* Show config form only if they want to update */}
                      {!useExistingAutomation.telegram && (
                        <div className="border-t border-white/10 pt-4">
                          <p className="text-sm text-yellow-400 mb-3">
                            ⚠️ This will update your existing Telegram
                            automation settings
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-[#0088cc]/10 dark:bg-[#0088cc]/20 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="h-5 w-5 text-[#0088cc]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                        </svg>
                        <span className="font-medium">
                          Bot: @{telegramStatus.botUsername}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your AI bot will post announcements and respond to
                        messages promoting {app.name} in your Telegram channels
                        and groups.
                      </p>
                    </div>
                  )}

                  {/* Only show config form if no existing automation OR user wants to update */}
                  {(!existingAutomation.telegram.exists ||
                    !useExistingAutomation.telegram) && (
                    <div className="space-y-4">
                      {telegramChats.length === 0 ? (
                        <div className="space-y-4">
                          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                            <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                              <strong>Step 1:</strong> Add @
                              {telegramStatus.botUsername} to your Telegram
                              group or channel as an admin
                            </p>
                            <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                              <strong>Step 2:</strong> Send any message in that
                              chat
                            </p>
                            <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
                              <strong>Step 3:</strong> Click the button below to
                              scan for chats
                            </p>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={async () => {
                                const btn =
                                  document.activeElement as HTMLButtonElement;
                                if (btn) btn.disabled = true;
                                try {
                                  const res = await fetch(
                                    "/api/v1/telegram/scan-chats",
                                    {
                                      method: "POST",
                                    }
                                  );
                                  const data = await res.json();
                                  if (data.chats) {
                                    setTelegramChats(data.chats);
                                    if (data.chats.length > 0) {
                                      toast.success(
                                        `Found ${data.chats.length} chat(s)!`
                                      );
                                    } else {
                                      toast.info(
                                        "No chats found. Make sure you added the bot and sent a message."
                                      );
                                    }
                                  } else if (data.error) {
                                    toast.error(data.error);
                                  }
                                } catch {
                                  toast.error("Failed to scan for chats");
                                }
                                if (btn) btn.disabled = false;
                              }}
                            >
                              🔍 Scan for Chats
                            </Button>
                          </div>

                          <div>
                            <Label>Group/Channel ID (manual entry)</Label>
                            <Input
                              placeholder="-1001234567890"
                              value={
                                config.telegramAutomation?.groupId ||
                                config.telegramAutomation?.channelId ||
                                ""
                              }
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                setConfig((prev) => ({
                                  ...prev,
                                  telegramAutomation: {
                                    enabled: true,
                                    channelId: undefined,
                                    groupId: val || undefined,
                                    autoReply:
                                      prev.telegramAutomation?.autoReply ??
                                      true,
                                    autoAnnounce:
                                      prev.telegramAutomation?.autoAnnounce ??
                                      true,
                                    announceIntervalMin:
                                      prev.telegramAutomation
                                        ?.announceIntervalMin ?? 120,
                                    announceIntervalMax:
                                      prev.telegramAutomation
                                        ?.announceIntervalMax ?? 240,
                                  },
                                }));
                              }}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Get this from @RawDataBot (add it to your group,
                              it will show the chat ID)
                            </p>
                          </div>

                          {/* Automation Settings for Manual Entry */}
                          <div className="space-y-3 pt-4 border-t">
                            <Label className="text-base font-medium">
                              Automation Features
                            </Label>

                            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                              <Checkbox
                                checked={
                                  config.telegramAutomation?.autoAnnounce ??
                                  true
                                }
                                onCheckedChange={(checked) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    telegramAutomation: {
                                      enabled: true,
                                      channelId:
                                        prev.telegramAutomation?.channelId,
                                      groupId: prev.telegramAutomation?.groupId,
                                      autoReply:
                                        prev.telegramAutomation?.autoReply ??
                                        true,
                                      autoAnnounce: !!checked,
                                      announceIntervalMin:
                                        prev.telegramAutomation
                                          ?.announceIntervalMin ?? 120,
                                      announceIntervalMax:
                                        prev.telegramAutomation
                                          ?.announceIntervalMax ?? 240,
                                    },
                                  }))
                                }
                              />
                              <div className="flex-1">
                                <div className="font-medium">
                                  Auto-Announcements
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Post periodic AI-generated updates
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <Label>Channel (for announcements)</Label>
                            <Select
                              value={
                                config.telegramAutomation?.channelId || "none"
                              }
                              onValueChange={(value) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  telegramAutomation: {
                                    enabled: true,
                                    channelId:
                                      value === "none" ? undefined : value,
                                    groupId: prev.telegramAutomation?.groupId,
                                    autoReply:
                                      prev.telegramAutomation?.autoReply ??
                                      true,
                                    autoAnnounce:
                                      prev.telegramAutomation?.autoAnnounce ??
                                      true,
                                    announceIntervalMin:
                                      prev.telegramAutomation
                                        ?.announceIntervalMin ?? 120,
                                    announceIntervalMax:
                                      prev.telegramAutomation
                                        ?.announceIntervalMax ?? 240,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a channel" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No channel</SelectItem>
                                {telegramChats
                                  .filter(
                                    (c) => c.type === "channel" && c.canPost
                                  )
                                  .map((chat) => (
                                    <SelectItem key={chat.id} value={chat.id}>
                                      {chat.title}{" "}
                                      {chat.username && `(@${chat.username})`}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              AI will post periodic announcements to this
                              channel
                            </p>
                          </div>

                          <div>
                            <Label>Group (for interactions)</Label>
                            <Select
                              value={
                                config.telegramAutomation?.groupId || "none"
                              }
                              onValueChange={(value) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  telegramAutomation: {
                                    enabled: true,
                                    channelId:
                                      prev.telegramAutomation?.channelId,
                                    groupId:
                                      value === "none" ? undefined : value,
                                    autoReply:
                                      prev.telegramAutomation?.autoReply ??
                                      true,
                                    autoAnnounce:
                                      prev.telegramAutomation?.autoAnnounce ??
                                      true,
                                    announceIntervalMin:
                                      prev.telegramAutomation
                                        ?.announceIntervalMin ?? 120,
                                    announceIntervalMax:
                                      prev.telegramAutomation
                                        ?.announceIntervalMax ?? 240,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a group" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No group</SelectItem>
                                {telegramChats
                                  .filter(
                                    (c) =>
                                      c.type === "group" ||
                                      c.type === "supergroup"
                                  )
                                  .map((chat) => (
                                    <SelectItem key={chat.id} value={chat.id}>
                                      {chat.title}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              AI will respond to messages in this group
                            </p>
                          </div>
                        </>
                      )}

                      <div className="space-y-3 pt-4 border-t">
                        <Label className="text-base font-medium">
                          Automation Features
                        </Label>

                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={
                              config.telegramAutomation?.autoAnnounce ?? true
                            }
                            onCheckedChange={(checked) =>
                              setConfig((prev) => ({
                                ...prev,
                                telegramAutomation: {
                                  enabled: true,
                                  channelId: prev.telegramAutomation?.channelId,
                                  groupId: prev.telegramAutomation?.groupId,
                                  autoReply:
                                    prev.telegramAutomation?.autoReply ?? true,
                                  autoAnnounce: !!checked,
                                  announceIntervalMin:
                                    prev.telegramAutomation
                                      ?.announceIntervalMin ?? 120,
                                  announceIntervalMax:
                                    prev.telegramAutomation
                                      ?.announceIntervalMax ?? 240,
                                },
                              }))
                            }
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              Auto-Announcements
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Post periodic AI-generated updates to your channel
                            </div>
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <Label htmlFor="announceIntervalMin">
                            Min Announce Interval (minutes)
                          </Label>
                          <Input
                            id="announceIntervalMin"
                            type="number"
                            min={30}
                            max={1440}
                            value={
                              config.telegramAutomation?.announceIntervalMin ??
                              60
                            }
                            onChange={(e) => {
                              const value = Math.max(
                                30,
                                Math.min(1440, parseInt(e.target.value) || 60)
                              );
                              setConfig((prev) => ({
                                ...prev,
                                telegramAutomation: {
                                  enabled: true,
                                  channelId: prev.telegramAutomation?.channelId,
                                  groupId: prev.telegramAutomation?.groupId,
                                  autoReply:
                                    prev.telegramAutomation?.autoReply ?? true,
                                  autoAnnounce:
                                    prev.telegramAutomation?.autoAnnounce ??
                                    true,
                                  announceIntervalMin: value,
                                  announceIntervalMax:
                                    prev.telegramAutomation
                                      ?.announceIntervalMax ?? 240,
                                },
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor="announceIntervalMax">
                            Max Announce Interval (minutes)
                          </Label>
                          <Input
                            id="announceIntervalMax"
                            type="number"
                            min={60}
                            max={1440}
                            value={
                              config.telegramAutomation?.announceIntervalMax ??
                              240
                            }
                            onChange={(e) => {
                              const value = Math.max(
                                60,
                                Math.min(1440, parseInt(e.target.value) || 240)
                              );
                              setConfig((prev) => ({
                                ...prev,
                                telegramAutomation: {
                                  enabled: true,
                                  channelId: prev.telegramAutomation?.channelId,
                                  groupId: prev.telegramAutomation?.groupId,
                                  autoReply:
                                    prev.telegramAutomation?.autoReply ?? true,
                                  autoAnnounce:
                                    prev.telegramAutomation?.autoAnnounce ??
                                    true,
                                  announceIntervalMin:
                                    prev.telegramAutomation
                                      ?.announceIntervalMin ?? 60,
                                  announceIntervalMax: value,
                                },
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Discord Automation Config */}
                <TabsContent value="discord_automation" className="space-y-4">
                  {/* Show existing automation card if it exists */}
                  {existingAutomation.discord.exists ? (
                    <div className="space-y-4">
                      <div
                        className={`${existingAutomation.discord.isPaused ? "bg-yellow-500/10 border-yellow-500/30" : "bg-green-500/10 border-green-500/30"} border rounded-lg p-4`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle
                            className={`h-5 w-5 ${existingAutomation.discord.isPaused ? "text-yellow-400" : "text-green-400"}`}
                          />
                          <span className="font-medium text-white">
                            Discord Automation{" "}
                            {existingAutomation.discord.isPaused
                              ? "(Paused)"
                              : "Active"}
                          </span>
                        </div>
                        <p className="text-sm text-white/60">
                          {existingAutomation.discord.isPaused
                            ? "Was"
                            : "Currently"}{" "}
                          posting to{" "}
                          <span className="text-white font-medium">
                            #
                            {existingAutomation.discord.channelName ||
                              "channel"}
                          </span>{" "}
                          in{" "}
                          <span className="text-white font-medium">
                            {existingAutomation.discord.guildName || "server"}
                          </span>
                        </p>
                      </div>

                      {/* Toggle between using existing or reconfiguring */}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={
                            useExistingAutomation.discord
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setUseExistingAutomation((prev) => ({
                              ...prev,
                              discord: true,
                            }))
                          }
                          className={
                            useExistingAutomation.discord
                              ? "bg-[#FF5800] hover:bg-[#FF5800]/90 flex-1"
                              : "flex-1"
                          }
                        >
                          Post using existing
                        </Button>
                        <Button
                          type="button"
                          variant={
                            !useExistingAutomation.discord
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setUseExistingAutomation((prev) => ({
                              ...prev,
                              discord: false,
                            }))
                          }
                          className={
                            !useExistingAutomation.discord
                              ? "bg-[#FF5800] hover:bg-[#FF5800]/90 flex-1"
                              : "flex-1"
                          }
                        >
                          Update settings
                        </Button>
                      </div>

                      {/* Show config form only if they want to update */}
                      {!useExistingAutomation.discord && (
                        <div className="border-t border-white/10 pt-4">
                          <p className="text-sm text-yellow-400 mb-3">
                            ⚠️ This will update your existing Discord automation
                            settings
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-[#5865F2]/10 dark:bg-[#5865F2]/20 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="h-5 w-5 text-[#5865F2]"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                        <span className="font-medium">
                          {discordStatus.guilds.length} Server
                          {discordStatus.guilds.length !== 1 ? "s" : ""}{" "}
                          Connected
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your AI bot will post announcements promoting {app.name}{" "}
                        in your selected Discord channel.
                      </p>
                    </div>
                  )}

                  {/* Only show config form if no existing automation OR user wants to update */}
                  {(!existingAutomation.discord.exists ||
                    !useExistingAutomation.discord) && (
                    <div className="space-y-4">
                      <div>
                        <Label>Select Server</Label>
                        <Select
                          value={config.discordAutomation?.guildId || ""}
                          onValueChange={async (value) => {
                            setConfig((prev) => ({
                              ...prev,
                              discordAutomation: {
                                enabled: true,
                                guildId: value,
                                channelId: undefined,
                                autoAnnounce:
                                  prev.discordAutomation?.autoAnnounce ?? true,
                                announceIntervalMin:
                                  prev.discordAutomation?.announceIntervalMin ??
                                  120,
                                announceIntervalMax:
                                  prev.discordAutomation?.announceIntervalMax ??
                                  240,
                              },
                            }));
                            // Fetch channels for selected guild
                            if (value) {
                              try {
                                const res = await fetch(
                                  `/api/v1/discord/channels?guildId=${value}`
                                );
                                const data = await res.json();
                                setDiscordChannels(data.channels || []);
                              } catch {
                                setDiscordChannels([]);
                              }
                            } else {
                              setDiscordChannels([]);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a server" />
                          </SelectTrigger>
                          <SelectContent>
                            {discordStatus.guilds.map((guild) => (
                              <SelectItem key={guild.id} value={guild.id}>
                                <div className="flex items-center gap-2">
                                  {guild.iconUrl ? (
                                    <img
                                      src={guild.iconUrl}
                                      alt=""
                                      className="h-5 w-5 rounded-full"
                                    />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full bg-[#5865F2] flex items-center justify-center text-xs text-white">
                                      {guild.name.charAt(0)}
                                    </div>
                                  )}
                                  {guild.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {config.discordAutomation?.guildId && (
                        <div>
                          <Label>Select Channel</Label>
                          <Select
                            value={config.discordAutomation?.channelId || ""}
                            onValueChange={(value) =>
                              setConfig((prev) => ({
                                ...prev,
                                discordAutomation: {
                                  enabled: true,
                                  guildId: prev.discordAutomation?.guildId,
                                  channelId: value,
                                  autoAnnounce:
                                    prev.discordAutomation?.autoAnnounce ??
                                    true,
                                  announceIntervalMin:
                                    prev.discordAutomation
                                      ?.announceIntervalMin ?? 120,
                                  announceIntervalMax:
                                    prev.discordAutomation
                                      ?.announceIntervalMax ?? 240,
                                },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a channel" />
                            </SelectTrigger>
                            <SelectContent>
                              {discordChannels
                                .filter((c) => c.canSend)
                                .map((channel) => (
                                  <SelectItem
                                    key={channel.id}
                                    value={channel.id}
                                  >
                                    # {channel.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                            AI will post announcements to this channel
                          </p>
                        </div>
                      )}

                      <div className="space-y-3 pt-4 border-t">
                        <Label className="text-base font-medium">
                          Automation Features
                        </Label>

                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={
                              config.discordAutomation?.autoAnnounce ?? true
                            }
                            onCheckedChange={(checked) =>
                              setConfig((prev) => ({
                                ...prev,
                                discordAutomation: {
                                  enabled: true,
                                  guildId: prev.discordAutomation?.guildId,
                                  channelId: prev.discordAutomation?.channelId,
                                  autoAnnounce: !!checked,
                                  announceIntervalMin:
                                    prev.discordAutomation
                                      ?.announceIntervalMin ?? 120,
                                  announceIntervalMax:
                                    prev.discordAutomation
                                      ?.announceIntervalMax ?? 240,
                                },
                              }))
                            }
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              Auto-Announcements
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Post periodic AI-generated updates with embeds and
                              buttons
                            </div>
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <Label htmlFor="discordAnnounceIntervalMin">
                            Min Announce Interval (minutes)
                          </Label>
                          <Input
                            id="discordAnnounceIntervalMin"
                            type="number"
                            min={30}
                            max={1440}
                            value={
                              config.discordAutomation?.announceIntervalMin ??
                              60
                            }
                            onChange={(e) => {
                              const value = Math.max(
                                30,
                                Math.min(1440, parseInt(e.target.value) || 60)
                              );
                              setConfig((prev) => ({
                                ...prev,
                                discordAutomation: {
                                  enabled: true,
                                  guildId: prev.discordAutomation?.guildId,
                                  channelId: prev.discordAutomation?.channelId,
                                  autoAnnounce:
                                    prev.discordAutomation?.autoAnnounce ??
                                    true,
                                  announceIntervalMin: value,
                                  announceIntervalMax:
                                    prev.discordAutomation
                                      ?.announceIntervalMax ?? 240,
                                },
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor="discordAnnounceIntervalMax">
                            Max Announce Interval (minutes)
                          </Label>
                          <Input
                            id="discordAnnounceIntervalMax"
                            type="number"
                            min={60}
                            max={1440}
                            value={
                              config.discordAutomation?.announceIntervalMax ??
                              240
                            }
                            onChange={(e) => {
                              const value = Math.max(
                                60,
                                Math.min(1440, parseInt(e.target.value) || 240)
                              );
                              setConfig((prev) => ({
                                ...prev,
                                discordAutomation: {
                                  enabled: true,
                                  guildId: prev.discordAutomation?.guildId,
                                  channelId: prev.discordAutomation?.channelId,
                                  autoAnnounce:
                                    prev.discordAutomation?.autoAnnounce ??
                                    true,
                                  announceIntervalMin:
                                    prev.discordAutomation
                                      ?.announceIntervalMin ?? 60,
                                  announceIntervalMax: value,
                                },
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex justify-between items-center p-6 pt-4 border-t border-white/10 bg-black/50 shrink-0">
              <Button
                variant="outline"
                onClick={goToPrevTab}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                ← Back
              </Button>
              <Button
                onClick={() => {
                  const result = goToNextTab();
                  if (result === "review") {
                    handleReviewStep();
                  }
                }}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                {isLastTab ? "Review & Launch →" : "Continue →"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col max-h-[calc(80vh-120px)]">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-white/5 border border-white/10 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-white">Promotion Summary</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">App:</span>
                    <span className="font-medium text-white">{app.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">URL:</span>
                    {(app.website_url || app.app_url)?.includes(
                      "placeholder"
                    ) ? (
                      <span className="text-white/40 italic">
                        Not configured
                      </span>
                    ) : (
                      <a
                        href={app.website_url || app.app_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#FF5800] hover:underline flex items-center gap-1"
                      >
                        {app.website_url || app.app_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Show selected character if any automation is enabled */}
                {(config.channels.includes("twitter_automation") ||
                  config.channels.includes("telegram_automation") ||
                  config.channels.includes("discord_automation")) && (
                  <div className="border-t border-white/10 pt-3 mt-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-white/60">Agent Voice:</span>
                      {selectedCharacter ? (
                        <div className="flex items-center gap-2">
                          {(selectedCharacter.avatar_url ||
                            selectedCharacter.avatarUrl) && (
                            <Image
                              src={
                                selectedCharacter.avatar_url ||
                                selectedCharacter.avatarUrl ||
                                ""
                              }
                              alt={selectedCharacter.name}
                              width={20}
                              height={20}
                              className="rounded-full object-cover"
                            />
                          )}
                          <span className="font-medium text-white">
                            {selectedCharacter.name}
                          </span>
                        </div>
                      ) : (
                        <span className="font-medium text-white/80">
                          Default Voice
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t border-white/10 pt-3 mt-3 space-y-2">
                  {config.channels.includes("social") && (
                    <div className="flex items-center gap-2 text-white/80">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>
                        Social: {config.social?.platforms?.join(", ")}
                      </span>
                    </div>
                  )}
                  {config.channels.includes("seo") && (
                    <div className="flex items-center gap-2 text-white/80">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>SEO Optimization</span>
                    </div>
                  )}
                  {config.channels.includes("advertising") && (
                    <div className="flex items-center gap-2 text-white/80">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>
                        Ad Campaign: ${config.advertising?.budget}{" "}
                        {config.advertising?.budgetType}
                      </span>
                    </div>
                  )}
                  {config.channels.includes("twitter_automation") && (
                    <div className="flex items-center gap-2 text-white/80">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>
                        Twitter/X: @{twitterStatus.username}
                        {config.twitterAutomation?.autoPost && " • Auto-post"}
                        {config.twitterAutomation?.autoReply && " • Replies"}
                        {config.twitterAutomation?.autoEngage &&
                          " • Engagement"}
                        {config.twitterAutomation?.discovery && " • Discovery"}
                        {config.twitterAutomation?.postIntervalMin &&
                          config.twitterAutomation?.postIntervalMax && (
                            <>
                              {" "}
                              ({config.twitterAutomation.postIntervalMin}-
                              {config.twitterAutomation.postIntervalMax} min)
                            </>
                          )}
                      </span>
                    </div>
                  )}
                  {config.channels.includes("telegram_automation") && (
                    <div className="flex items-center gap-2 text-white/80">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>
                        Telegram Bot: @{telegramStatus.botUsername}
                        {config.telegramAutomation?.autoAnnounce &&
                          " • Auto-announcements"}
                        {config.telegramAutomation?.announceIntervalMin &&
                          config.telegramAutomation?.announceIntervalMax && (
                            <>
                              {" "}
                              ({config.telegramAutomation.announceIntervalMin}-
                              {config.telegramAutomation.announceIntervalMax}{" "}
                              min)
                            </>
                          )}
                      </span>
                    </div>
                  )}
                  {config.channels.includes("discord_automation") && (
                    <div className="flex items-center gap-2 text-white/80">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>
                        Discord Bot:{" "}
                        {discordStatus.guilds.find(
                          (g) => g.id === config.discordAutomation?.guildId
                        )?.name || "Server"}
                        {config.discordAutomation?.channelId &&
                          discordChannels.length > 0 && (
                            <>
                              {" "}
                              → #
                              {discordChannels.find(
                                (c) =>
                                  c.id === config.discordAutomation?.channelId
                              )?.name || "channel"}
                            </>
                          )}
                        {config.discordAutomation?.autoAnnounce &&
                          " • Auto-announcements"}
                        {config.discordAutomation?.announceIntervalMin &&
                          config.discordAutomation?.announceIntervalMax && (
                            <>
                              {" "}
                              ({config.discordAutomation.announceIntervalMin}-
                              {config.discordAutomation.announceIntervalMax}{" "}
                              min)
                            </>
                          )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 pt-3 mt-3">
                  <div className="flex justify-between font-semibold text-white">
                    <span>Estimated Cost:</span>
                    <span>{getCostDisplay()}</span>
                  </div>
                </div>
              </div>

              {/* Post Previews Section */}
              {(config.channels.includes("discord_automation") ||
                config.channels.includes("telegram_automation") ||
                config.channels.includes("twitter_automation")) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-white/60" />
                      Upcoming Posts Preview
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchPreviews}
                      disabled={isLoadingPreviews}
                      className="text-white/60 hover:text-white hover:bg-white/10"
                    >
                      {isLoadingPreviews ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Regenerate
                        </>
                      )}
                    </Button>
                  </div>

                  {isLoadingPreviews ? (
                    <div className="flex items-center justify-center p-8 text-white/50">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Generating sample posts...
                    </div>
                  ) : postPreviews.length === 0 ? (
                    <div className="text-center p-4 text-white/50 text-sm">
                      Click &quot;Regenerate&quot; to preview sample posts
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {postPreviews.map((preview, index) => (
                        <div
                          key={`${preview.platform}-${index}`}
                          className={`p-3 rounded-lg border ${
                            preview.platform === "discord"
                              ? "border-[#5865F2]/30 bg-[#5865F2]/10"
                              : preview.platform === "telegram"
                                ? "border-[#0088cc]/30 bg-[#0088cc]/10"
                                : "border-sky-500/30 bg-sky-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {preview.platform === "discord" && (
                              <>
                                <Hash className="h-4 w-4 text-[#5865F2]" />
                                <span className="text-xs font-medium text-[#5865F2]">
                                  Discord
                                </span>
                              </>
                            )}
                            {preview.platform === "telegram" && (
                              <>
                                <Send className="h-4 w-4 text-[#0088cc]" />
                                <span className="text-xs font-medium text-[#0088cc]">
                                  Telegram
                                </span>
                              </>
                            )}
                            {preview.platform === "twitter" && (
                              <>
                                <Twitter className="h-4 w-4 text-sky-500" />
                                <span className="text-xs font-medium text-sky-500">
                                  Twitter/X
                                </span>
                              </>
                            )}
                            <Badge
                              variant="outline"
                              className="text-xs ml-auto border-white/20 text-white/60"
                            >
                              {preview.type}
                            </Badge>
                          </div>
                          <p className="text-sm whitespace-pre-wrap text-white/80">
                            {preview.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-between items-center p-6 pt-4 border-t border-white/10 bg-black/50 shrink-0">
              <Button
                variant="outline"
                onClick={() => setStep("configure")}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                Back
              </Button>
              <Button
                onClick={handlePromote}
                disabled={isLoading}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Launching...
                  </>
                ) : (
                  "Launch Promotion"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="p-6 space-y-6">
            <div className="text-center py-4">
              {result.success ? (
                <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
              ) : (
                <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
              )}
              <h3 className="text-xl font-semibold text-white">
                {result.success ? "Promotion Launched!" : "Partial Success"}
              </h3>
              <p className="text-white/60">
                Used ${result.totalCreditsUsed.toFixed(2)} in credits
              </p>
            </div>

            <div className="space-y-3">
              {Object.entries(result.channels).map(
                ([channel, status]) =>
                  status && (
                    <div
                      key={channel}
                      className={`p-3 rounded-lg border ${
                        status.success
                          ? "border-green-500/30 bg-green-500/10"
                          : "border-red-500/30 bg-red-500/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize text-white">
                          {channel}
                        </span>
                        {status.success ? (
                          <Badge variant="default" className="bg-green-500">
                            Success
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </div>
                      {status.error && (
                        <p className="text-sm text-red-400 mt-1">
                          {status.error}
                        </p>
                      )}
                    </div>
                  )
              )}
            </div>

            <div className="flex justify-center pt-4 border-t border-white/10">
              <Button
                onClick={handleClose}
                className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
