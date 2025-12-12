/**
 * Social Connections settings tab for managing platform OAuth connections.
 * Supports OAuth flow for most platforms and manual credentials for Bluesky/Telegram.
 */

"use client";

import { BrandCard, CornerBrackets } from "@/components/brand";
import type { UserWithOrganization } from "@/lib/types";
import { 
  Loader2, 
  X, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Link2,
  Unlink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConnectionsTabProps {
  user: UserWithOrganization;
}

interface PlatformConnection {
  platform: string;
  authType: "oauth" | "manual";
  configured: boolean;
  connected: boolean;
  connection?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    status: string;
    linkedAt: string | null;
  };
}

interface ModalState {
  showManualModal: boolean;
  selectedPlatform: string | null;
}

interface FormState {
  handle: string;
  appPassword: string;
  botToken: string;
  instanceUrl: string;
}

const PLATFORM_INFO: Record<string, { 
  name: string; 
  icon: string; 
  color: string;
  description: string;
}> = {
  twitter: { name: "Twitter / X", icon: "𝕏", color: "#000000", description: "Post tweets and threads" },
  bluesky: { name: "Bluesky", icon: "🦋", color: "#0085FF", description: "Post to your Bluesky account" },
  discord: { name: "Discord", icon: "🎮", color: "#5865F2", description: "Send messages to Discord servers" },
  telegram: { name: "Telegram", icon: "✈️", color: "#0088CC", description: "Post via Telegram bot" },
  slack: { name: "Slack", icon: "💬", color: "#4A154B", description: "Post to Slack channels" },
  reddit: { name: "Reddit", icon: "🤖", color: "#FF4500", description: "Submit posts and comments" },
  facebook: { name: "Facebook", icon: "📘", color: "#1877F2", description: "Post to Facebook pages" },
  instagram: { name: "Instagram", icon: "📸", color: "#E4405F", description: "Share photos and reels" },
  tiktok: { name: "TikTok", icon: "🎵", color: "#000000", description: "Upload videos to TikTok" },
  linkedin: { name: "LinkedIn", icon: "💼", color: "#0A66C2", description: "Share professional updates" },
  mastodon: { name: "Mastodon", icon: "🐘", color: "#6364FF", description: "Post to your Mastodon instance" },
};

export function ConnectionsTab({ user }: ConnectionsTabProps) {
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const [modalState, setModalState] = useState<ModalState>({
    showManualModal: false,
    selectedPlatform: null,
  });

  const [formState, setFormState] = useState<FormState>({
    handle: "",
    appPassword: "",
    botToken: "",
    instanceUrl: "",
  });

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v1/social-connections");
    if (!response.ok) throw new Error("Failed to fetch connections");
    const data = await response.json();
    setPlatforms(data.platforms || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => { fetchConnections(); });
  }, [fetchConnections]);

  const handleConnect = async (platform: string, authType: "oauth" | "manual") => {
    if (authType === "manual") {
      setModalState({ showManualModal: true, selectedPlatform: platform });
      setFormState({ handle: "", appPassword: "", botToken: "", instanceUrl: "" });
      return;
    }

    // Special handling for Mastodon - need instance URL first
    if (platform === "mastodon") {
      setModalState({ showManualModal: true, selectedPlatform: "mastodon" });
      setFormState({ handle: "", appPassword: "", botToken: "", instanceUrl: "mastodon.social" });
      return;
    }

    setActionLoading(platform);

    const response = await fetch(`/api/v1/social-connections/connect/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to start connection");
      setActionLoading(null);
      return;
    }

    const data = await response.json();
    
    // Redirect to OAuth URL
    window.location.href = data.authUrl;
  };

  const handleManualConnect = async () => {
    const platform = modalState.selectedPlatform;
    if (!platform) return;

    setActionLoading(platform);

    // Handle Mastodon OAuth with instance URL
    if (platform === "mastodon") {
      const response = await fetch(`/api/v1/social-connections/connect/mastodon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceUrl: formState.instanceUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Failed to start connection");
        setActionLoading(null);
        return;
      }

      const data = await response.json();
      window.location.href = data.authUrl;
      return;
    }

    // Handle Bluesky/Telegram manual credentials
    const credentials = platform === "bluesky"
      ? { handle: formState.handle, appPassword: formState.appPassword }
      : { botToken: formState.botToken };

    const response = await fetch("/api/v1/social-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, credentials }),
    });

    setActionLoading(null);

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to connect");
      return;
    }

    toast.success(`${PLATFORM_INFO[platform]?.name || platform} connected successfully`);
    setModalState({ showManualModal: false, selectedPlatform: null });
    fetchConnections();
  };

  const handleDisconnect = async (platform: string, connectionId: string) => {
    if (!window.confirm(`Disconnect ${PLATFORM_INFO[platform]?.name || platform}? You'll need to reconnect to use it again.`)) {
      return;
    }

    setActionLoading(platform);

    const response = await fetch(`/api/v1/social-connections/${connectionId}`, {
      method: "DELETE",
    });

    setActionLoading(null);

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to disconnect");
      return;
    }

    toast.success("Disconnected successfully");
    fetchConnections();
  };

  const handleRefresh = async (platform: string, connectionId: string) => {
    setActionLoading(platform);

    const response = await fetch(`/api/v1/social-connections/${connectionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });

    setActionLoading(null);

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to refresh token");
      return;
    }

    toast.success("Token refreshed");
    fetchConnections();
  };

  const connectedPlatforms = platforms.filter(p => p.connected);
  const availablePlatforms = platforms.filter(p => !p.connected);

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-6 md:pb-8">
      {/* Connected Platforms */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-2 max-w-[850px]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                Connected Platforms
              </h3>
            </div>
            <p className="text-xs md:text-sm font-mono text-[#858585] tracking-tight">
              Platforms you&apos;ve authorized ElizaCloud to post on your behalf.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-8 border border-brand-surface">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
            </div>
          ) : connectedPlatforms.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border border-brand-surface gap-2">
              <p className="text-sm text-white/60 font-mono">
                No platforms connected yet. Connect one below to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectedPlatforms.map((p) => {
                const info = PLATFORM_INFO[p.platform];
                return (
                  <div
                    key={p.platform}
                    className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-green-500/30 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{info?.icon}</span>
                        <div>
                          <h4 className="text-sm font-mono font-semibold text-white">
                            {info?.name || p.platform}
                          </h4>
                          <p className="text-xs font-mono text-white/60">
                            @{p.connection?.username}
                          </p>
                        </div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>

                    {p.connection?.linkedAt && (
                      <p className="text-xs font-mono text-white/40">
                        Connected {new Date(p.connection.linkedAt).toLocaleDateString()}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                      {p.authType === "oauth" && (
                        <button
                          type="button"
                          onClick={() => handleRefresh(p.platform, p.connection!.id)}
                          disabled={actionLoading === p.platform}
                          className="flex-1 px-3 py-2 border border-white/20 hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-xs font-mono text-white/80"
                        >
                          {actionLoading === p.platform ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Refresh
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDisconnect(p.platform, p.connection!.id)}
                        disabled={actionLoading === p.platform}
                        className="flex-1 px-3 py-2 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 text-xs font-mono text-red-400"
                      >
                        <Unlink className="h-3 w-3" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BrandCard>

      {/* Available Platforms */}
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-50" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-2 max-w-[850px]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
              <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
                Available Platforms
              </h3>
            </div>
            <p className="text-xs md:text-sm font-mono text-[#858585] tracking-tight">
              Connect additional platforms to enable cross-posting from ElizaCloud.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-8 border border-brand-surface">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePlatforms.map((p) => {
                const info = PLATFORM_INFO[p.platform];
                const isConfigured = p.configured;
                return (
                  <div
                    key={p.platform}
                    className={`backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border p-4 space-y-3 ${
                      isConfigured ? "border-brand-surface" : "border-white/10 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{info?.icon}</span>
                        <div>
                          <h4 className="text-sm font-mono font-semibold text-white">
                            {info?.name || p.platform}
                          </h4>
                          <p className="text-xs font-mono text-white/40">
                            {info?.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-mono uppercase ${
                        p.authType === "oauth" 
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      }`}>
                        {p.authType === "oauth" ? "OAuth" : "App Password"}
                      </span>
                      {!isConfigured && (
                        <span className="px-2 py-0.5 text-xs font-mono uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          Not Configured
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConnect(p.platform, p.authType)}
                      disabled={!isConfigured || actionLoading === p.platform}
                      className="w-full relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <div
                        className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                        style={{
                          backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                          backgroundSize: "2.915576934814453px 2.915576934814453px",
                        }}
                      />
                      {actionLoading === p.platform ? (
                        <Loader2 className="relative z-10 h-4 w-4 animate-spin text-black" />
                      ) : (
                        <Link2 className="relative z-10 h-4 w-4 text-black" />
                      )}
                      <span className="relative z-10 text-black font-mono font-medium text-sm">
                        {isConfigured ? "Connect" : "Not Available"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BrandCard>

      {/* Manual Credentials Modal */}
      {modalState.showManualModal && modalState.selectedPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative bg-[#0a0a0a] border border-brand-surface p-4 sm:p-6 w-full max-w-md">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono text-white uppercase">
                  Connect {PLATFORM_INFO[modalState.selectedPlatform]?.name || modalState.selectedPlatform}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalState({ showManualModal: false, selectedPlatform: null })}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {modalState.selectedPlatform === "bluesky" && (
                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 p-3">
                    <p className="text-xs text-blue-400 font-mono">
                      Bluesky uses app passwords for third-party access.{" "}
                      <a 
                        href="https://bsky.app/settings/app-passwords" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-300 inline-flex items-center gap-1"
                      >
                        Create one here <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white font-mono text-sm">Handle</Label>
                    <Input
                      value={formState.handle}
                      onChange={(e) => setFormState(s => ({ ...s, handle: e.target.value }))}
                      placeholder="@yourname.bsky.social"
                      className="bg-transparent border-[#303030] text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white font-mono text-sm">App Password</Label>
                    <Input
                      type="password"
                      value={formState.appPassword}
                      onChange={(e) => setFormState(s => ({ ...s, appPassword: e.target.value }))}
                      placeholder="xxxx-xxxx-xxxx-xxxx"
                      className="bg-transparent border-[#303030] text-white"
                    />
                  </div>
                </div>
              )}

              {modalState.selectedPlatform === "telegram" && (
                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 p-3">
                    <p className="text-xs text-blue-400 font-mono">
                      Create a bot via @BotFather on Telegram and paste the token below.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white font-mono text-sm">Bot Token</Label>
                    <Input
                      type="password"
                      value={formState.botToken}
                      onChange={(e) => setFormState(s => ({ ...s, botToken: e.target.value }))}
                      placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxyz"
                      className="bg-transparent border-[#303030] text-white"
                    />
                  </div>
                </div>
              )}

              {modalState.selectedPlatform === "mastodon" && (
                <div className="space-y-4">
                  <div className="bg-purple-500/10 border border-purple-500/30 p-3">
                    <p className="text-xs text-purple-400 font-mono">
                      Enter your Mastodon instance URL. You&apos;ll be redirected to authorize.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white font-mono text-sm">Instance URL</Label>
                    <Input
                      value={formState.instanceUrl}
                      onChange={(e) => setFormState(s => ({ ...s, instanceUrl: e.target.value }))}
                      placeholder="mastodon.social"
                      className="bg-transparent border-[#303030] text-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setModalState({ showManualModal: false, selectedPlatform: null })}
                  className="px-4 py-2.5 border border-[#303030] text-white hover:bg-white/5 transition-colors order-2 sm:order-1 w-full sm:w-auto"
                  disabled={!!actionLoading}
                >
                  <span className="font-mono text-sm">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleManualConnect}
                  disabled={!!actionLoading}
                  className="relative bg-[#e1e1e1] px-4 py-2.5 overflow-hidden hover:bg-white transition-colors disabled:opacity-50 order-1 sm:order-2 w-full sm:w-auto"
                >
                  <div
                    className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                    style={{
                      backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                      backgroundSize: "2.915576934814453px 2.915576934814453px",
                    }}
                  />
                  <span className="relative z-10 text-black font-mono font-medium text-sm flex items-center justify-center gap-2">
                    {actionLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect"
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
