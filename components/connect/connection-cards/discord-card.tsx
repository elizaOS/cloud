"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle, Plus, Server } from "lucide-react";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

// Discord icon SVG
const DiscordIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

interface DiscordGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  channelCount: number;
}

interface DiscordCardProps {
  status: ServiceStatus;
  onConnected: () => void;
  connectPageUrl: string;
}

export function DiscordCard({
  status,
  onConnected,
  connectPageUrl,
}: DiscordCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleAddServer = () => {
    setIsConnecting(true);
    // Build return URL that comes back to the connect page
    const returnUrl = encodeURIComponent(connectPageUrl);
    window.location.href = `/api/v1/discord/oauth?returnUrl=${returnUrl}`;
  };

  // Loading state
  if (status.loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Not configured state
  if (!status.configured) {
    return (
      <Card className="opacity-60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DiscordIcon className="h-5 w-5 text-[#5865F2]" />
            Discord
          </CardTitle>
          <CardDescription>
            Discord integration is not configured on this platform.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Get guilds from details
  const guilds: DiscordGuild[] = status.details?.guilds || [];
  const guildCount = guilds.length;

  // Connected state (has at least one server)
  if (status.connected && guildCount > 0) {
    return (
      <Card className="border-green-500/50 bg-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <DiscordIcon className="h-5 w-5 text-[#5865F2]" />
              Discord
            </CardTitle>
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              {guildCount} Server{guildCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <CardDescription>Post to Discord channels</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Show connected servers (max 3) */}
          <div className="space-y-2">
            {guilds.slice(0, 3).map((guild) => (
              <div
                key={guild.id}
                className="flex items-center gap-3 p-2 bg-muted rounded-lg"
              >
                <div className="h-8 w-8 rounded-full bg-[#5865F2] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {guild.iconUrl ? (
                    <img
                      src={guild.iconUrl}
                      alt={guild.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-semibold text-sm">
                      {guild.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {guild.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {guild.channelCount} channel
                    {guild.channelCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
            {guildCount > 3 && (
              <div className="text-xs text-muted-foreground text-center">
                +{guildCount - 3} more server{guildCount - 3 !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Add another server button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleAddServer}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Another Server
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Disconnected state
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DiscordIcon className="h-5 w-5 text-[#5865F2]" />
          Discord
        </CardTitle>
        <CardDescription>
          Connect Discord servers for AI automation
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          onClick={handleAddServer}
          disabled={isConnecting}
          className="w-full bg-[#5865F2] hover:bg-[#4752C4]"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <Server className="h-4 w-4 mr-2" />
              Add to Discord
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
