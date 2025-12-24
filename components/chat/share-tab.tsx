/**
 * Share tab component for managing character public sharing settings.
 * Allows toggling public visibility and provides share links.
 *
 * Privacy notes:
 * - Character secrets are NEVER exposed publicly
 * - Only knowledge items marked as "shared" are accessible publicly
 * - Billing is charged to the user who chats (not the character owner)
 *
 * @param props - Share tab configuration
 * @param props.characterId - Character ID to manage sharing for
 * @param props.characterName - Character name for display
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Share2,
  Copy,
  Check,
  Globe,
  Lock,
  ExternalLink,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { BrandCard } from "@/components/brand";

interface ShareTabProps {
  characterId: string | null;
  characterName?: string;
}

interface ShareInfo {
  chatUrl: string;
  dashboardChatUrl: string;
  a2aEndpoint?: string;
  mcpEndpoint?: string;
}

interface ShareStatus {
  isPublic: boolean;
  shareUrl: string | null;
  shareInfo: ShareInfo | null;
}

export function ShareTab({ characterId, characterName }: ShareTabProps) {
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch current share status
  const fetchShareStatus = useCallback(async () => {
    if (!characterId) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/my-agents/characters/${characterId}/share`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setShareStatus(data.data);
        } else {
          toast.error("Failed to load sharing settings");
        }
      } else if (response.status === 404) {
        // Character not found or user doesn't own it - this is expected for shared characters
        // Don't show error, just leave status as null
        console.debug("[ShareTab] Character not owned by user, share controls hidden");
      } else {
        toast.error("Failed to load sharing settings");
      }
    } catch (error) {
      console.error("[ShareTab] Failed to fetch share status:", error);
      toast.error("An error occurred while loading sharing settings");
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    fetchShareStatus();
  }, [fetchShareStatus]);

  // Toggle public sharing
  const handleToggleShare = async () => {
    if (!characterId || !shareStatus) return;

    setIsToggling(true);
    try {
      const response = await fetch(
        `/api/my-agents/characters/${characterId}/share`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isPublic: !shareStatus.isPublic,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setShareStatus(data.data);
        toast.success(data.data.message);
      } else {
        toast.error(data.error || "Failed to update sharing status");
      }
    } catch (error) {
      console.error("[ShareTab] Failed to toggle share status:", error);
      toast.error("Failed to update sharing status");
    } finally {
      setIsToggling(false);
    }
  };

  // Copy URL to clipboard
  const handleCopy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(label);
      toast.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  // Open URL in new tab
  const handleOpenLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!characterId) {
    return (
      <BrandCard className="p-6" corners={false}>
        <div className="flex items-center gap-3 text-white/60">
          <AlertCircle className="h-5 w-5" />
          <p>Save your character first to enable sharing options.</p>
        </div>
      </BrandCard>
    );
  }

  if (isLoading) {
    return (
      <BrandCard className="p-6" corners={false}>
        <div className="flex items-center justify-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#FF5800]" />
          <span className="text-white/60">Loading sharing settings...</span>
        </div>
      </BrandCard>
    );
  }

  return (
    <BrandCard className="relative h-full overflow-auto p-6" corners={false}>
      <div className="relative z-10 space-y-8">
        {/* Header */}
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[#FF5800]" />
            Sharing Settings
          </h3>
          <p className="text-sm text-white/60 mt-1">
            Control who can chat with {characterName || "your agent"}.
          </p>
        </div>

        {/* Public Toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-black/20">
            <div className="flex items-center gap-4">
              {shareStatus?.isPublic ? (
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Globe className="h-5 w-5 text-green-500" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-white/5">
                  <Lock className="h-5 w-5 text-white/60" />
                </div>
              )}
              <div>
                <h4 className="font-semibold text-white">
                  {shareStatus?.isPublic ? "Public" : "Private"}
                </h4>
                <p className="text-sm text-white/60">
                  {shareStatus?.isPublic
                    ? "Anyone with the link can chat with this agent"
                    : "Only you can chat with this agent"}
                </p>
              </div>
            </div>
            <Switch
              checked={shareStatus?.isPublic || false}
              onCheckedChange={handleToggleShare}
              disabled={isToggling}
              className="data-[state=checked]:bg-[#FF5800]"
            />
          </div>

          {/* Privacy Info */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-white/10 bg-black/20">
            <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-white/70 space-y-1">
              <p className="font-medium text-white">Privacy Protection</p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>Your API keys and secrets are never exposed</li>
                <li>Only knowledge marked as &quot;shared&quot; is accessible publicly</li>
                <li>Users who chat pay with their own credits, not yours</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Share Links (only shown when public) */}
        {shareStatus?.isPublic && shareStatus.shareInfo && (
          <div className="space-y-4">
            <h4 className="font-semibold text-white">Share Links</h4>

            {/* Direct Chat Link */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Direct Chat Link
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareStatus.shareInfo.chatUrl}
                  className="flex-1 rounded-none border-white/10 bg-black/40 text-white font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    handleCopy(shareStatus.shareInfo!.chatUrl, "Chat link")
                  }
                  className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
                >
                  {copied === "Chat link" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleOpenLink(shareStatus.shareInfo!.chatUrl)}
                  className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-white/50">
                Share this link for a dedicated chat experience
              </p>
            </div>

            {/* Dashboard Chat Link */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Dashboard Chat Link
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareStatus.shareInfo.dashboardChatUrl}
                  className="flex-1 rounded-none border-white/10 bg-black/40 text-white font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    handleCopy(
                      shareStatus.shareInfo!.dashboardChatUrl,
                      "Dashboard link"
                    )
                  }
                  className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
                >
                  {copied === "Dashboard link" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    handleOpenLink(shareStatus.shareInfo!.dashboardChatUrl)
                  }
                  className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-white/50">
                For users who have Eliza Cloud accounts
              </p>
            </div>

            {/* Protocol Endpoints (if registered on ERC8004) */}
            {(shareStatus.shareInfo.a2aEndpoint ||
              shareStatus.shareInfo.mcpEndpoint) && (
              <div className="pt-4 border-t border-white/10">
                <h4 className="font-semibold text-white mb-4">
                  Protocol Endpoints
                </h4>
                <p className="text-xs text-white/50 mb-4">
                  These endpoints allow other AI agents to interact with your
                  agent programmatically.
                </p>

                {shareStatus.shareInfo.a2aEndpoint && (
                  <div className="space-y-2 mb-4">
                    <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                      A2A (Agent-to-Agent) Endpoint
                    </label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={shareStatus.shareInfo.a2aEndpoint}
                        className="flex-1 rounded-none border-white/10 bg-black/40 text-white font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          handleCopy(
                            shareStatus.shareInfo!.a2aEndpoint!,
                            "A2A endpoint"
                          )
                        }
                        className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
                      >
                        {copied === "A2A endpoint" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {shareStatus.shareInfo.mcpEndpoint && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                      MCP (Model Context Protocol) Endpoint
                    </label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={shareStatus.shareInfo.mcpEndpoint}
                        className="flex-1 rounded-none border-white/10 bg-black/40 text-white font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          handleCopy(
                            shareStatus.shareInfo!.mcpEndpoint!,
                            "MCP endpoint"
                          )
                        }
                        className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
                      >
                        {copied === "MCP endpoint" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Publish Callout (when not ERC8004 registered) */}
        {shareStatus?.isPublic &&
          shareStatus.shareInfo &&
          !shareStatus.shareInfo.a2aEndpoint && (
            <div className="p-4 rounded-lg border border-[#FF5800]/30 bg-[#FF5800]/10">
              <h4 className="font-semibold text-white mb-2">
                Want more visibility?
              </h4>
              <p className="text-sm text-white/70 mb-3">
                Publish your agent to the marketplace to enable A2A/MCP
                protocols, earn from usage, and get discovered by other users.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/dashboard/my-agents?publish=${characterId}`,
                    "_self"
                  )
                }
                className="rounded-none border-[#FF5800] text-[#FF5800] hover:bg-[#FF5800]/10"
              >
                Learn about Publishing
              </Button>
            </div>
          )}
      </div>
    </BrandCard>
  );
}

