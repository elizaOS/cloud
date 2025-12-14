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
import { Loader2, Share2, Search, Megaphone, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

type PromotionChannel = "social" | "seo" | "advertising";

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
  { id: "awareness", name: "Brand Awareness", description: "Reach new audiences" },
  { id: "traffic", name: "Website Traffic", description: "Drive visits to your app" },
  { id: "engagement", name: "Engagement", description: "Get likes, comments, shares" },
  { id: "app_promotion", name: "App Installs", description: "Promote app downloads" },
];

export function PromoteAppDialog({
  open,
  onOpenChange,
  app,
  adAccounts = [],
}: PromoteAppDialogProps) {
  const [step, setStep] = useState<"channels" | "configure" | "review" | "result">("channels");
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<PromotionConfig>({
    channels: [],
  });
  const [result, setResult] = useState<{
    success: boolean;
    channels: Record<string, { success: boolean; error?: string }>;
    totalCreditsUsed: number;
  } | null>(null);

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
    setIsLoading(true);

    const response = await fetch(`/api/v1/apps/${app.id}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    const data = await response.json();
    setIsLoading(false);

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
    } else {
      toast.error(data.error || "Failed to launch promotion");
    }
  }, [app.id, config]);

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
      cost += 0.5 + (config.advertising.budget * 1.15); // Setup + budget with markup
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
                <Badge variant="secondary" className="mt-2">~$0.02/post</Badge>
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
                <Badge variant="secondary" className="mt-2">~$0.03</Badge>
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
                  <Badge variant="outline" className="mt-2">Connect account first</Badge>
                ) : (
                  <Badge variant="secondary" className="mt-2">Custom budget</Badge>
                )}
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
                          checked={config.social?.platforms?.includes(platform.id)}
                          onCheckedChange={() => toggleSocialPlatform(platform.id)}
                        />
                        <span className="text-lg">{platform.icon}</span>
                        <span className="text-sm">{platform.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="customMessage">Custom Message (optional)</Label>
                  <Textarea
                    id="customMessage"
                    placeholder="Leave blank to auto-generate..."
                    value={config.social?.customMessage || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        social: { ...prev.social, platforms: prev.social?.platforms || [], customMessage: e.target.value },
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
                          seo: { ...prev.seo, generateMeta: !!checked, generateSchema: prev.seo?.generateSchema ?? true, submitToIndexNow: prev.seo?.submitToIndexNow ?? true },
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
                          seo: { ...prev.seo, generateSchema: !!checked, generateMeta: prev.seo?.generateMeta ?? true, submitToIndexNow: prev.seo?.submitToIndexNow ?? true },
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium">Generate Schema.org Data</div>
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
                          seo: { ...prev.seo, submitToIndexNow: !!checked, generateMeta: prev.seo?.generateMeta ?? true, generateSchema: prev.seo?.generateSchema ?? true },
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
                          advertising: { ...prev.advertising!, objective: value },
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
                          advertising: { ...prev.advertising!, budgetType: value },
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
            </Tabs>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("channels")}>
                Back
              </Button>
              <Button onClick={() => setStep("review")}>
                Review & Launch
              </Button>
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
                  <span className="font-medium text-blue-500">{app.app_url}</span>
                </div>
              </div>

              <div className="border-t pt-3 mt-3 space-y-2">
                {config.channels.includes("social") && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>
                      Social: {config.social?.platforms?.join(", ")}
                    </span>
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
              {Object.entries(result.channels).map(([channel, status]) => (
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
                      <span className="font-medium capitalize">{channel}</span>
                      {status.success ? (
                        <Badge variant="default">Success</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </div>
                    {status.error && (
                      <p className="text-sm text-red-600 mt-1">{status.error}</p>
                    )}
                  </div>
                )
              ))}
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

