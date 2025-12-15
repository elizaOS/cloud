"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PlusIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  BarChartIcon,
} from "@radix-ui/react-icons";
import {
  Megaphone,
  MoreVertical,
  DollarSign,
  Eye,
  MousePointer,
  Target,
  Zap,
  RefreshCw,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { BrandCard, BrandButton } from "@/components/brand";

interface AdAccount {
  id: string;
  platform: "meta" | "google" | "tiktok";
  accountName: string;
  externalAccountId: string;
  status: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  budgetType: string;
  budgetAmount: string;
  budgetCurrency: string;
  creditsAllocated: string;
  creditsSpent: string;
  totalSpend: string;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

interface AdStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
}

export function AdvertisingPageClient() {
  useSetPageHeader({
    title: "Advertising",
    description: "Manage your advertising campaigns across multiple platforms",
  });

  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Connect account dialog state
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectPlatform, setConnectPlatform] = useState<
    "meta" | "google" | "tiktok"
  >("meta");
  const [connectAccessToken, setConnectAccessToken] = useState("");
  const [connectAccountId, setConnectAccountId] = useState("");
  const [connectAccountName, setConnectAccountName] = useState("");

  const refreshData = async () => {
    const [accountsRes, campaignsRes, statsRes] = await Promise.all([
      fetch("/api/v1/advertising/accounts"),
      fetch("/api/v1/advertising/campaigns"),
      fetch("/api/v1/advertising/campaigns?stats=true"),
    ]);

    if (accountsRes.ok) {
      const data = await accountsRes.json();
      setAccounts(data.accounts || []);
    }
    if (campaignsRes.ok) {
      const data = await campaignsRes.json();
      setCampaigns(data.campaigns || []);
    }
    if (statsRes.ok) {
      const data = await statsRes.json();
      setStats(data.stats || null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshData();
      if (!cancelled) {
        setIsLoading(false);
        setIsLoadingStats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartCampaign = async (campaignId: string) => {
    setActionLoading(campaignId);
    const response = await fetch(
      `/api/v1/advertising/campaigns/${campaignId}/start`,
      { method: "POST" },
    );
    if (response.ok) {
      toast.success("Campaign started");
      void refreshData();
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to start campaign");
    }
    setActionLoading(null);
  };

  const handlePauseCampaign = async (campaignId: string) => {
    setActionLoading(campaignId);
    const response = await fetch(
      `/api/v1/advertising/campaigns/${campaignId}/pause`,
      { method: "POST" },
    );
    if (response.ok) {
      toast.success("Campaign paused");
      void refreshData();
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to pause campaign");
    }
    setActionLoading(null);
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    setIsDeleting(true);
    const response = await fetch(
      `/api/v1/advertising/campaigns/${campaignId}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      toast.success("Campaign deleted");
      setDeleteConfirmId(null);
      void refreshData();
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to delete campaign");
    }
    setIsDeleting(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 border-green-500/40 text-green-400";
      case "paused":
        return "bg-yellow-500/20 border-yellow-500/40 text-yellow-400";
      case "pending":
        return "bg-blue-500/20 border-blue-500/40 text-blue-400";
      case "completed":
        return "bg-gray-500/20 border-gray-500/40 text-gray-400";
      case "error":
        return "bg-rose-500/20 border-rose-500/40 text-rose-400";
      default:
        return "bg-white/10 border-white/20 text-white/60";
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "meta":
        return "📘";
      case "google":
        return "🔍";
      case "tiktok":
        return "🎵";
      default:
        return "📢";
    }
  };

  const handleRefresh = () => {
    void refreshData();
  };

  const handleConnectAccount = async () => {
    if (!connectAccessToken.trim()) {
      toast.error("Access token is required");
      return;
    }

    setIsConnecting(true);
    const response = await fetch("/api/v1/advertising/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: connectPlatform,
        accessToken: connectAccessToken,
        externalAccountId: connectAccountId || undefined,
        accountName:
          connectAccountName ||
          `${connectPlatform.charAt(0).toUpperCase() + connectPlatform.slice(1)} Account`,
      }),
    });

    if (response.ok) {
      toast.success("Account connected successfully");
      setShowConnectDialog(false);
      setConnectAccessToken("");
      setConnectAccountId("");
      setConnectAccountName("");
      void refreshData();
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to connect account");
    }
    setIsConnecting(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {isLoadingStats ? (
          Array.from({ length: 6 }).map((_, i) => (
            <BrandCard key={i} corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </BrandCard>
          ))
        ) : stats ? (
          <>
            <BrandCard corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#FF5800]/20 border border-[#FF5800]/40 p-2">
                  <Megaphone className="w-4 h-4 text-[#FF5800]" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {stats.totalCampaigns}
                  </p>
                  <p className="text-xs text-white/50">Campaigns</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500/20 border border-green-500/40 p-2">
                  <Zap className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {stats.activeCampaigns}
                  </p>
                  <p className="text-xs text-white/50">Active</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-500/20 border border-blue-500/40 p-2">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    ${stats.totalSpend.toFixed(2)}
                  </p>
                  <p className="text-xs text-white/50">Total Spend</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-500/20 border border-purple-500/40 p-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {stats.totalImpressions.toLocaleString()}
                  </p>
                  <p className="text-xs text-white/50">Impressions</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-cyan-500/20 border border-cyan-500/40 p-2">
                  <MousePointer className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {stats.totalClicks.toLocaleString()}
                  </p>
                  <p className="text-xs text-white/50">Clicks</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-500/20 border border-amber-500/40 p-2">
                  <Target className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {stats.totalConversions.toLocaleString()}
                  </p>
                  <p className="text-xs text-white/50">Conversions</p>
                </div>
              </div>
            </BrandCard>
          </>
        ) : null}
      </div>

      {/* Actions Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white/60">
            {accounts.length} connected account
            {accounts.length !== 1 ? "s" : ""}
          </span>
          {accounts.length === 0 && (
            <span className="text-xs text-amber-400">
              Connect an ad account to create campaigns
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <BrandButton variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </BrandButton>
          <BrandButton
            variant="outline"
            size="sm"
            onClick={() => setShowConnectDialog(true)}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Connect Account
          </BrandButton>
          <Link href="/dashboard/advertising/new">
            <BrandButton variant="primary" disabled={accounts.length === 0}>
              <PlusIcon className="w-4 h-4 mr-2" />
              New Campaign
            </BrandButton>
          </Link>
        </div>
      </div>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <BrandCard key={i} corners={false} className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded bg-white/10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/3 bg-white/10" />
                  <Skeleton className="h-4 w-1/4 bg-white/10" />
                </div>
                <Skeleton className="h-8 w-20 bg-white/10" />
              </div>
            </BrandCard>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4">
            <Megaphone className="w-12 h-12 text-[#FF5800]" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-white">
            No campaigns yet
          </h3>
          <p className="text-white/60 max-w-md mb-4">
            {accounts.length === 0
              ? "Connect an advertising account to start creating campaigns"
              : "Create your first advertising campaign to promote your apps"}
          </p>
          {accounts.length === 0 ? (
            <BrandButton
              variant="primary"
              onClick={() => setShowConnectDialog(true)}
            >
              <Link2 className="w-4 h-4 mr-2" />
              Connect Account
            </BrandButton>
          ) : (
            <Link href="/dashboard/advertising/new">
              <BrandButton variant="primary">
                <PlusIcon className="w-4 h-4 mr-2" />
                Create Campaign
              </BrandButton>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <BrandCard key={campaign.id} corners={false} className="p-4">
              <div className="flex items-center gap-4">
                {/* Platform Icon */}
                <div className="w-10 h-10 flex items-center justify-center text-2xl bg-white/5 border border-white/10">
                  {getPlatformIcon(campaign.platform)}
                </div>

                {/* Campaign Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white truncate">
                      {campaign.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium border ${getStatusColor(
                        campaign.status,
                      )}`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-white/60">
                    <span className="capitalize">{campaign.platform}</span>
                    <span>•</span>
                    <span className="capitalize">{campaign.objective}</span>
                    <span>•</span>
                    <span>
                      {campaign.budgetType === "daily" ? "Daily" : "Lifetime"} $
                      {parseFloat(campaign.budgetAmount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="hidden md:flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-semibold text-white">
                      {campaign.totalImpressions.toLocaleString()}
                    </p>
                    <p className="text-xs text-white/50">Impressions</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-white">
                      {campaign.totalClicks.toLocaleString()}
                    </p>
                    <p className="text-xs text-white/50">Clicks</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-white">
                      ${parseFloat(campaign.totalSpend).toFixed(2)}
                    </p>
                    <p className="text-xs text-white/50">Spent</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {campaign.status === "active" ? (
                    <BrandButton
                      variant="outline"
                      size="sm"
                      onClick={() => handlePauseCampaign(campaign.id)}
                      disabled={actionLoading === campaign.id}
                    >
                      <PauseIcon className="w-4 h-4" />
                    </BrandButton>
                  ) : campaign.status === "paused" ||
                    campaign.status === "pending" ? (
                    <BrandButton
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartCampaign(campaign.id)}
                      disabled={actionLoading === campaign.id}
                    >
                      <PlayIcon className="w-4 h-4" />
                    </BrandButton>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 hover:bg-white/10 transition-colors">
                        <MoreVertical className="w-4 h-4 text-white/60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/dashboard/advertising/${campaign.id}/analytics`}
                        >
                          <BarChartIcon className="w-4 h-4 mr-2" />
                          View Analytics
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteConfirmId(campaign.id)}
                        className="text-rose-400 focus:text-rose-400"
                      >
                        <TrashIcon className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </BrandCard>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Campaign</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this campaign? Unused budget
              credits will be refunded.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              disabled={isDeleting}
            >
              Cancel
            </BrandButton>
            <BrandButton
              variant="primary"
              onClick={() =>
                deleteConfirmId && handleDeleteCampaign(deleteConfirmId)
              }
              disabled={isDeleting}
              className="bg-rose-500 hover:bg-rose-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect Account Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Ad Account</DialogTitle>
            <DialogDescription>
              Connect an advertising platform account to create and manage
              campaigns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Platform</label>
              <Select
                value={connectPlatform}
                onValueChange={(v) =>
                  setConnectPlatform(v as "meta" | "google" | "tiktok")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">
                    📘 Meta (Facebook/Instagram)
                  </SelectItem>
                  <SelectItem value="google" disabled>
                    🔍 Google Ads (Coming Soon)
                  </SelectItem>
                  <SelectItem value="tiktok" disabled>
                    🎵 TikTok Ads (Coming Soon)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white">
                Access Token
              </label>
              <Input
                type="password"
                placeholder="Your platform access token"
                value={connectAccessToken}
                onChange={(e) => setConnectAccessToken(e.target.value)}
              />
              <p className="text-xs text-white/50">
                Get your access token from the Meta Business Suite or Marketing
                API.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white">
                Account ID (optional)
              </label>
              <Input
                placeholder="act_123456789"
                value={connectAccountId}
                onChange={(e) => setConnectAccountId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white">
                Account Name (optional)
              </label>
              <Input
                placeholder="My Business Account"
                value={connectAccountName}
                onChange={(e) => setConnectAccountName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setShowConnectDialog(false)}
              disabled={isConnecting}
            >
              Cancel
            </BrandButton>
            <BrandButton
              variant="primary"
              onClick={handleConnectAccount}
              disabled={isConnecting || !connectAccessToken.trim()}
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
