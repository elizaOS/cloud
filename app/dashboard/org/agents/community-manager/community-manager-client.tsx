/**
 * Community Manager Settings Client Component
 *
 * Client-side component for the community manager settings page.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CommunityManagerSettings } from "@/components/org-agents/community-manager";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Shield, Server, Bot, AlertCircle } from "lucide-react";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface Platform {
  connectionId: string;
  platform: string;
  botName: string | null;
  servers: Array<{
    id: string;
    serverId: string;
    name: string;
    memberCount: string | null;
    enabled: boolean;
  }>;
}

interface CommunityManagerSettingsClientProps {
  organizationId: string;
  instanceId?: string;
  settings: CommunityModerationSettings;
  platforms: Platform[];
}

export function CommunityManagerSettingsClient({
  organizationId,
  instanceId,
  settings,
  platforms,
}: CommunityManagerSettingsClientProps) {
  const router = useRouter();
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>(
    platforms[0]?.servers[0]?.id,
  );
  const [currentSettings, setCurrentSettings] = useState(settings);

  const handleSettingsChange = async (
    newSettings: CommunityModerationSettings,
  ) => {
    const res = await fetch(`/api/v1/org/agents/community-manager/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverId: selectedServerId,
        settings: newSettings,
      }),
    });

    if (!res.ok) {
      toast.error("Failed to save settings");
      return;
    }

    setCurrentSettings(newSettings);
    toast.success("Settings saved");
    router.refresh();
  };

  const hasConnections = platforms.length > 0;
  const hasServers = platforms.some((p) => p.servers.length > 0);

  if (!hasConnections) {
    return (
      <div className="space-y-6">
        <Header />
        <NoConnectionsCard />
      </div>
    );
  }

  if (!hasServers) {
    return (
      <div className="space-y-6">
        <Header />
        <NoServersCard platforms={platforms} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      {/* Server Selector */}
      <BrandCard className="p-4">
        <CornerBrackets />
        <div className="flex items-center gap-3 mb-4">
          <Server className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Select Server</h3>
        </div>
        <div className="grid gap-3">
          {platforms.map((platform) => (
            <div key={platform.connectionId} className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                <span className="capitalize">{platform.platform}</span>
                {platform.botName && (
                  <span className="text-xs">({platform.botName})</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {platform.servers.map((server) => (
                  <button
                    key={server.id}
                    onClick={() => setSelectedServerId(server.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selectedServerId === server.id
                        ? "border-orange-500 bg-orange-500/10"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-medium truncate">{server.name}</div>
                    {server.memberCount && (
                      <div className="text-xs text-muted-foreground">
                        {server.memberCount} members
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* Settings */}
      {selectedServerId && (
        <CommunityManagerSettings
          organizationId={organizationId}
          serverId={selectedServerId}
          settings={currentSettings}
          onSettingsChange={handleSettingsChange}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-4">
      <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30">
        <Shield className="h-8 w-8 text-orange-500" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Community Manager</h1>
        <p className="text-muted-foreground">
          Configure moderation, token gating, and community protection
        </p>
      </div>
    </div>
  );
}

function NoConnectionsCard() {
  return (
    <BrandCard className="p-8 text-center">
      <CornerBrackets />
      <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium mb-2">No Platform Connections</h3>
      <p className="text-muted-foreground mb-4">
        Connect a Discord or Telegram bot to get started with community
        management.
      </p>
      <a
        href="/dashboard/settings?tab=apis"
        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium"
      >
        Connect Bot
      </a>
    </BrandCard>
  );
}

function NoServersCard({ platforms }: { platforms: Platform[] }) {
  return (
    <BrandCard className="p-8 text-center">
      <CornerBrackets />
      <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium mb-2">No Servers Connected</h3>
      <p className="text-muted-foreground mb-4">
        Your bot{platforms.length > 1 ? "s are" : " is"} connected but not added
        to any servers. Add the bot to a server to configure moderation.
      </p>
      <div className="text-sm text-muted-foreground">
        {platforms.map((p) => (
          <div key={p.connectionId}>
            {p.platform}: {p.botName ?? "Connected"}
          </div>
        ))}
      </div>
    </BrandCard>
  );
}
