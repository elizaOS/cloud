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

import { useState, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";
import Link from "next/link";

interface PromoteAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: {
    id: string;
    name: string;
    description?: string;
    app_url: string;
  };
  adAccounts?: Array<{
    id: string;
    platform: string;
    accountName: string;
  }>;
}

type PromotionChannel =
  | "social"
  | "seo"
  | "advertising"
  | "twitter_automation"
  | "telegram_automation";

interface TwitterAutomationConfig {
  enabled: boolean;
  autoPost: boolean;
  autoReply: boolean;
  autoEngage: boolean;
  discovery: boolean;
  postIntervalMin: number;
  postIntervalMax: number;
}

interface TelegramAutomationConfig {
  enabled: boolean;
  channelId?: string;
  groupId?: string;
  autoReply: boolean;
  autoAnnounce: boolean;
  announceIntervalMin: number;
  announceIntervalMax: number;
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
}

const SOCIAL_PLATFORMS = [
  { id: "twitter", name: "Twitter/X", icon: "𝕏" },
  { id: "bluesky", name: "Bluesky", icon: "🦋" },
  { id: "linkedin", name: "LinkedIn", icon: "in" },
  { id: "facebook", name: "Facebook", icon: "f" },
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

  // Check Twitter and Telegram connection status
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
  }, []);

  const toggleChannel = (channel: PromotionChannel) => {
    setConfig((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
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

    let data;
    try {
      const response = await fetch(`/api/v1/apps/${app.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      data = await response.json();

      if (response.ok) {
        setResult({
          success: data.errors?.length === 0,
          channels: {
            social: data.channels?.social,
            seo: data.channels?.seo,
            advertising: data.channels?.advertising,
          },
          totalCreditsUsed: data.totalCreditsUsed,
        });
        setStep("result");
        toast.success("Promotion launched!");
        setIsLoading(false);
        return;
      }
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      setIsLoading(false);
      return;
    }

    toast.error(data?.error || "Failed to launch promotion. Please try again.");
    setIsLoading(false);
  }, [app.id, config, isLoading]);

  const handleClose = () => {
    setStep("channels");
    setConfig({ channels: [] });
    setResult(null);
    onOpenChange(false);
  };

  const estimatedCost = () => {
    let cost = 0;
    if (config.channels.includes("social")) {
      cost += (config.social?.platforms?.length || 0) * 0.01 + 0.02; // Posts + content gen
    }
    if (config.channels.includes("seo")) {
      cost += 0.03;
    }
    if (config.channels.includes("advertising") && config.advertising) {
      cost += 0.5 + config.advertising.budget * 1.15; // Setup + budget with markup
    }
    if (config.channels.includes("twitter_automation")) {
      cost += 0.1; // Setup cost for Twitter automation
    }
    if (config.channels.includes("telegram_automation")) {
      cost += 0.08; // Setup cost for Telegram automation
    }
    return cost.toFixed(2);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Promote {app.name}
          </DialogTitle>
          <DialogDescription>
            Launch your app across multiple channels to reach more users
          </DialogDescription>
        </DialogHeader>

        {step === "channels" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {/* Social Channel */}
              <button
                onClick={() => toggleChannel("social")}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  config.channels.includes("social")
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <Share2 className="h-8 w-8 mb-2 text-blue-500" />
                <h3 className="font-semibold">Social Media</h3>
                <p className="text-sm text-muted-foreground">
                  Post to Twitter, LinkedIn, Discord...
                </p>
                <Badge variant="secondary" className="mt-2">
                  ~$0.02/post
                </Badge>
              </button>

              {/* SEO Channel */}
              <button
                onClick={() => toggleChannel("seo")}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  config.channels.includes("seo")
                    ? "border-green-500 bg-green-50 dark:bg-green-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <Search className="h-8 w-8 mb-2 text-green-500" />
                <h3 className="font-semibold">SEO</h3>
                <p className="text-sm text-muted-foreground">
                  Optimize for search engines
                </p>
                <Badge variant="secondary" className="mt-2">
                  ~$0.03
                </Badge>
              </button>

              {/* Advertising Channel */}
              <button
                onClick={() => toggleChannel("advertising")}
                disabled={adAccounts.length === 0}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  config.channels.includes("advertising")
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                } ${adAccounts.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Megaphone className="h-8 w-8 mb-2 text-purple-500" />
                <h3 className="font-semibold">Advertising</h3>
                <p className="text-sm text-muted-foreground">
                  Run paid ad campaigns
                </p>
                {adAccounts.length === 0 ? (
                  <Badge variant="outline" className="mt-2">
                    Connect account first
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="mt-2">
                    Custom budget
                  </Badge>
                )}
              </button>
            </div>

            {/* Twitter Automation - Full width section */}
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => toggleChannel("twitter_automation")}
                disabled={!twitterStatus.connected}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                  config.channels.includes("twitter_automation")
                    ? "border-sky-500 bg-sky-50 dark:bg-sky-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                } ${!twitterStatus.connected ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-sky-500/20 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-sky-500" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Twitter/X Automation</h3>
                      <Badge variant="secondary" className="text-xs">
                        AI Agent
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Deploy an AI agent to autonomously promote your app on
                      Twitter. Posts in your app&apos;s voice, engages with
                      mentions, and grows your audience 24/7.
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Auto-posting
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Reply to mentions
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Engagement
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Discovery
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {!twitterStatus.configured ? (
                      <Badge variant="outline">Not configured</Badge>
                    ) : !twitterStatus.connected ? (
                      <Link
                        href="/dashboard/settings?tab=connections"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex"
                      >
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-sky-500/10 hover:border-sky-500/50 transition-colors"
                        >
                          Connect Twitter
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Badge>
                      </Link>
                    ) : (
                      <div>
                        <Badge variant="default" className="bg-sky-500">
                          @{twitterStatus.username}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enterprise API
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* Telegram Automation */}
              <button
                onClick={() => toggleChannel("telegram_automation")}
                disabled={!telegramStatus.connected}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all mt-4 ${
                  config.channels.includes("telegram_automation")
                    ? "border-[#0088cc] bg-[#0088cc]/10 dark:bg-[#0088cc]/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                } ${!telegramStatus.connected ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-[#0088cc]/20 flex items-center justify-center">
                      <svg
                        className="h-6 w-6 text-[#0088cc]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Telegram Bot Automation</h3>
                      <Badge variant="secondary" className="text-xs">
                        AI Bot
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Deploy a Telegram bot to announce updates, answer
                      questions, and engage with your community in channels and
                      groups.
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Announcements
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Auto-replies
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Commands
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {!telegramStatus.connected ? (
                      <Link
                        href="/dashboard/settings?tab=connections"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex"
                      >
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-[#0088cc]/10 hover:border-[#0088cc]/50 transition-colors"
                        >
                          Connect Telegram
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Badge>
                      </Link>
                    ) : (
                      <div>
                        <Badge variant="default" className="bg-[#0088cc]">
                          @{telegramStatus.botUsername}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Bot Connected
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {config.channels.length === 0
                  ? "Select at least one channel"
                  : `${config.channels.length} channel(s) selected`}
              </div>
              <Button
                onClick={() => setStep("configure")}
                disabled={config.channels.length === 0}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === "configure" && (
          <div className="space-y-6">
            <Tabs defaultValue={config.channels[0]} className="w-full">
              <TabsList className="w-full justify-start">
                {config.channels.includes("social") && (
                  <TabsTrigger value="social">Social Media</TabsTrigger>
                )}
                {config.channels.includes("seo") && (
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                )}
                {config.channels.includes("advertising") && (
                  <TabsTrigger value="advertising">Advertising</TabsTrigger>
                )}
                {config.channels.includes("twitter_automation") && (
                  <TabsTrigger value="twitter_automation">
                    Twitter Automation
                  </TabsTrigger>
                )}
                {config.channels.includes("telegram_automation") && (
                  <TabsTrigger value="telegram_automation">
                    Telegram Bot
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Social Media Config */}
              <TabsContent value="social" className="space-y-4">
                <div>
                  <Label className="mb-2 block">Select Platforms</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <label
                        key={platform.id}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                          config.social?.platforms?.includes(platform.id)
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-gray-200 dark:border-gray-700"
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
                        <span className="text-sm">{platform.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="customMessage">
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
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </TabsContent>

              {/* SEO Config */}
              <TabsContent value="seo" className="space-y-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
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
                      <div className="font-medium">Generate Meta Tags</div>
                      <div className="text-sm text-muted-foreground">
                        AI-generated title, description, and keywords
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2">
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
                      <div className="font-medium">
                        Generate Schema.org Data
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Structured data for rich search results
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2">
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
                      <div className="font-medium">Submit to IndexNow</div>
                      <div className="text-sm text-muted-foreground">
                        Notify search engines of your new content
                      </div>
                    </div>
                  </label>
                </div>
              </TabsContent>

              {/* Advertising Config */}
              <TabsContent value="advertising" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="adAccount">Ad Account</Label>
                    <Select
                      value={config.advertising?.adAccountId}
                      onValueChange={(value) => {
                        const account = adAccounts.find((a) => a.id === value);
                        setConfig((prev) => ({
                          ...prev,
                          advertising: {
                            ...prev.advertising,
                            adAccountId: value,
                            platform: account?.platform || "meta",
                            budget: prev.advertising?.budget || 10,
                            budgetType: prev.advertising?.budgetType || "daily",
                            objective: prev.advertising?.objective || "traffic",
                          },
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {adAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.accountName} ({account.platform})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="objective">Objective</Label>
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
                      <SelectTrigger>
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
                    <Label htmlFor="budget">Budget ($)</Label>
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
                    />
                  </div>

                  <div>
                    <Label htmlFor="budgetType">Budget Type</Label>
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
                      <SelectTrigger>
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
              <TabsContent value="twitter_automation" className="space-y-4">
                <div className="bg-sky-50 dark:bg-sky-950/50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="h-5 w-5 text-sky-500" />
                    <span className="font-medium">
                      Connected as @{twitterStatus.username}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
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
                                prev.twitterAutomation?.postIntervalMax ?? 150,
                            },
                          }))
                        }
                      />
                      <div className="flex-1">
                        <div className="font-medium">Auto-Post</div>
                        <div className="text-sm text-muted-foreground">
                          Generate and post tweets about your app automatically
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
                                prev.twitterAutomation?.postIntervalMax ?? 150,
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
                        checked={config.twitterAutomation?.autoEngage ?? false}
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
                                prev.twitterAutomation?.postIntervalMax ?? 150,
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
                                prev.twitterAutomation?.postIntervalMax ?? 150,
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
                        value={config.twitterAutomation?.postIntervalMin ?? 90}
                        onChange={(e) =>
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
                              postIntervalMin: parseInt(e.target.value) || 90,
                              postIntervalMax:
                                prev.twitterAutomation?.postIntervalMax ?? 150,
                            },
                          }))
                        }
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
                        value={config.twitterAutomation?.postIntervalMax ?? 150}
                        onChange={(e) =>
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
                              postIntervalMax: parseInt(e.target.value) || 150,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Telegram Automation Config */}
              <TabsContent value="telegram_automation" className="space-y-4">
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
                    Your AI bot will post announcements and respond to messages
                    promoting {app.name} in your Telegram channels and groups.
                  </p>
                </div>

                <div className="space-y-4">
                  {telegramChats.length === 0 ? (
                    <div className="space-y-4">
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                          <strong>Step 1:</strong> Add @
                          {telegramStatus.botUsername} to your Telegram group or
                          channel as an admin
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                          <strong>Step 2:</strong> Send any message in that chat
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
                                  prev.telegramAutomation?.autoReply ?? true,
                                autoAnnounce:
                                  prev.telegramAutomation?.autoAnnounce ?? true,
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
                          Get this from @RawDataBot (add it to your group, it
                          will show the chat ID)
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
                              Post periodic AI-generated updates
                            </div>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={
                              config.telegramAutomation?.autoReply ?? true
                            }
                            onCheckedChange={(checked) =>
                              setConfig((prev) => ({
                                ...prev,
                                telegramAutomation: {
                                  enabled: true,
                                  channelId: prev.telegramAutomation?.channelId,
                                  groupId: prev.telegramAutomation?.groupId,
                                  autoReply: !!checked,
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
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              Auto-Reply to Messages
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Automatically respond to messages in your group
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
                          value={config.telegramAutomation?.channelId || "none"}
                          onValueChange={(value) =>
                            setConfig((prev) => ({
                              ...prev,
                              telegramAutomation: {
                                enabled: true,
                                channelId: value === "none" ? undefined : value,
                                groupId: prev.telegramAutomation?.groupId,
                                autoReply:
                                  prev.telegramAutomation?.autoReply ?? true,
                                autoAnnounce:
                                  prev.telegramAutomation?.autoAnnounce ?? true,
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
                              .filter((c) => c.type === "channel" && c.canPost)
                              .map((chat) => (
                                <SelectItem key={chat.id} value={chat.id}>
                                  {chat.title}{" "}
                                  {chat.username && `(@${chat.username})`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI will post periodic announcements to this channel
                        </p>
                      </div>

                      <div>
                        <Label>Group (for interactions)</Label>
                        <Select
                          value={config.telegramAutomation?.groupId || "none"}
                          onValueChange={(value) =>
                            setConfig((prev) => ({
                              ...prev,
                              telegramAutomation: {
                                enabled: true,
                                channelId: prev.telegramAutomation?.channelId,
                                groupId: value === "none" ? undefined : value,
                                autoReply:
                                  prev.telegramAutomation?.autoReply ?? true,
                                autoAnnounce:
                                  prev.telegramAutomation?.autoAnnounce ?? true,
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
                                  c.type === "group" || c.type === "supergroup"
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
                                prev.telegramAutomation?.announceIntervalMin ??
                                120,
                              announceIntervalMax:
                                prev.telegramAutomation?.announceIntervalMax ??
                                240,
                            },
                          }))
                        }
                      />
                      <div className="flex-1">
                        <div className="font-medium">Auto-Announcements</div>
                        <div className="text-sm text-muted-foreground">
                          Post periodic AI-generated updates to your channel
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={config.telegramAutomation?.autoReply ?? true}
                        onCheckedChange={(checked) =>
                          setConfig((prev) => ({
                            ...prev,
                            telegramAutomation: {
                              enabled: true,
                              channelId: prev.telegramAutomation?.channelId,
                              groupId: prev.telegramAutomation?.groupId,
                              autoReply: !!checked,
                              autoAnnounce:
                                prev.telegramAutomation?.autoAnnounce ?? true,
                              announceIntervalMin:
                                prev.telegramAutomation?.announceIntervalMin ??
                                120,
                              announceIntervalMax:
                                prev.telegramAutomation?.announceIntervalMax ??
                                240,
                            },
                          }))
                        }
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          Auto-Reply to Messages
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Automatically respond to messages in your group
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
                          config.telegramAutomation?.announceIntervalMin ?? 120
                        }
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            telegramAutomation: {
                              enabled: true,
                              channelId: prev.telegramAutomation?.channelId,
                              groupId: prev.telegramAutomation?.groupId,
                              autoReply:
                                prev.telegramAutomation?.autoReply ?? true,
                              autoAnnounce:
                                prev.telegramAutomation?.autoAnnounce ?? true,
                              announceIntervalMin:
                                parseInt(e.target.value) || 120,
                              announceIntervalMax:
                                prev.telegramAutomation?.announceIntervalMax ??
                                240,
                            },
                          }))
                        }
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
                          config.telegramAutomation?.announceIntervalMax ?? 240
                        }
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            telegramAutomation: {
                              enabled: true,
                              channelId: prev.telegramAutomation?.channelId,
                              groupId: prev.telegramAutomation?.groupId,
                              autoReply:
                                prev.telegramAutomation?.autoReply ?? true,
                              autoAnnounce:
                                prev.telegramAutomation?.autoAnnounce ?? true,
                              announceIntervalMin:
                                prev.telegramAutomation?.announceIntervalMin ??
                                120,
                              announceIntervalMax:
                                parseInt(e.target.value) || 240,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("channels")}>
                Back
              </Button>
              <Button onClick={() => setStep("review")}>Review & Launch</Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <h3 className="font-semibold">Promotion Summary</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>App:</span>
                  <span className="font-medium">{app.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>URL:</span>
                  <span className="font-medium text-blue-500">
                    {app.app_url}
                  </span>
                </div>
              </div>

              <div className="border-t pt-3 mt-3 space-y-2">
                {config.channels.includes("social") && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Social: {config.social?.platforms?.join(", ")}</span>
                  </div>
                )}
                {config.channels.includes("seo") && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>SEO Optimization</span>
                  </div>
                )}
                {config.channels.includes("advertising") && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>
                      Ad Campaign: ${config.advertising?.budget}{" "}
                      {config.advertising?.budgetType}
                    </span>
                  </div>
                )}
                {config.channels.includes("twitter_automation") && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>
                      Twitter Automation: @{twitterStatus.username}
                      {config.twitterAutomation?.autoPost && " • Auto-post"}
                      {config.twitterAutomation?.autoReply && " • Replies"}
                      {config.twitterAutomation?.autoEngage && " • Engagement"}
                      {config.twitterAutomation?.discovery && " • Discovery"}
                    </span>
                  </div>
                )}
                {config.channels.includes("telegram_automation") && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>
                      Telegram Bot: @{telegramStatus.botUsername}
                      {config.telegramAutomation?.autoAnnounce &&
                        " • Announcements"}
                      {config.telegramAutomation?.autoReply &&
                        " • Auto-replies"}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between font-semibold">
                  <span>Estimated Cost:</span>
                  <span>${estimatedCost()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("configure")}>
                Back
              </Button>
              <Button onClick={handlePromote} disabled={isLoading}>
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
          <div className="space-y-6">
            <div className="text-center py-4">
              {result.success ? (
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              ) : (
                <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              )}
              <h3 className="text-xl font-semibold">
                {result.success ? "Promotion Launched!" : "Partial Success"}
              </h3>
              <p className="text-muted-foreground">
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
                          ? "border-green-200 bg-green-50 dark:bg-green-950"
                          : "border-red-200 bg-red-50 dark:bg-red-950"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">
                          {channel}
                        </span>
                        {status.success ? (
                          <Badge variant="default">Success</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </div>
                      {status.error && (
                        <p className="text-sm text-red-600 mt-1">
                          {status.error}
                        </p>
                      )}
                    </div>
                  )
              )}
            </div>

            <div className="flex justify-center pt-4 border-t">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
