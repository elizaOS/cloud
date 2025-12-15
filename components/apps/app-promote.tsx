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
import { Badge } from "@/components/ui/badge";
import {
  Megaphone,
  Share2,
  Search,
  TrendingUp,
  Image as ImageIcon,
  Video,
  Plus,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { PromoteAppDialog } from "@/components/promotion/promote-app-dialog";
import type { App } from "@/db/schemas";

interface AppPromoteProps {
  app: App;
}

interface PromotionSuggestions {
  recommendedChannels: string[];
  estimatedBudget: { min: number; max: number };
  suggestedPlatforms: string[];
  tips: string[];
}

interface AdAccount {
  id: string;
  platform: string;
  accountName: string;
}

export function AppPromote({ app }: AppPromoteProps) {
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [suggestions, setSuggestions] = useState<PromotionSuggestions | null>(
    null,
  );
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Fetch promotion suggestions
      const suggestionsRes = await fetch(`/api/v1/apps/${app.id}/promote`);
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json();
        setSuggestions(data);
      }

      // Fetch ad accounts
      const accountsRes = await fetch("/api/v1/advertising/accounts");
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAdAccounts(data.accounts || []);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [app.id]);

  const handleGenerateAssets = async () => {
    setIsGeneratingAssets(true);

    const response = await fetch(`/api/v1/apps/${app.id}/promote/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        includeCopy: true,
        includeAdBanners: true,
      }),
    });

    if (response.ok) {
      // Refresh the page to show new assets
      window.location.reload();
    }

    setIsGeneratingAssets(false);
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BrandCard className="p-4">
          <CornerBrackets size="sm" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Share2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <div className="text-white/60 text-xs">Social Posts</div>
              <div className="text-xl font-semibold text-white">0</div>
            </div>
          </div>
        </BrandCard>

        <BrandCard className="p-4">
          <CornerBrackets size="sm" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Search className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <div className="text-white/60 text-xs">SEO Score</div>
              <div className="text-xl font-semibold text-white">--</div>
            </div>
          </div>
        </BrandCard>

        <BrandCard className="p-4">
          <CornerBrackets size="sm" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <div className="text-white/60 text-xs">Ad Campaigns</div>
              <div className="text-xl font-semibold text-white">0</div>
            </div>
          </div>
        </BrandCard>
      </div>

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

      {/* Connected Ad Accounts */}
      <BrandCard className="p-6">
        <CornerBrackets />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Connected Ad Accounts
          </h3>
          <Button variant="outline" size="sm" asChild>
            <a href="/dashboard/settings?tab=connections">
              <Plus className="h-4 w-4 mr-2" />
              Connect Account
            </a>
          </Button>
        </div>

        {adAccounts.length === 0 ? (
          <div className="text-center py-8 text-white/60">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No ad accounts connected</p>
            <p className="text-sm">
              Connect a Meta, Google, or TikTok ads account to run paid
              campaigns
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {adAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="capitalize">
                    {account.platform}
                  </Badge>
                  <span className="text-white">{account.accountName}</span>
                </div>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </BrandCard>

      {/* Promote Dialog */}
      <PromoteAppDialog
        open={showPromoteDialog}
        onOpenChange={setShowPromoteDialog}
        app={{
          id: app.id,
          name: app.name,
          description: app.description ?? undefined,
          app_url: app.app_url,
        }}
        adAccounts={adAccounts}
      />
    </div>
  );
}
