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
import { Loader2, CheckCircle } from "lucide-react";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

// Slack icon SVG
const SlackIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
);

interface SlackCardProps {
  status: ServiceStatus;
  onConnected: () => void;
  connectPageUrl: string;
}

export function SlackCard({
  status,
  onConnected,
  connectPageUrl,
}: SlackCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    // Build return URL that comes back to the connect page
    const returnUrl = encodeURIComponent(connectPageUrl);
    window.location.href = `/api/v1/slack/oauth?returnUrl=${returnUrl}`;
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
            <SlackIcon className="h-5 w-5" />
            Slack
          </CardTitle>
          <CardDescription>
            Slack integration is not configured on this platform.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Connected state
  if (status.connected) {
    return (
      <Card className="border-green-500/50 bg-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <SlackIcon className="h-5 w-5" />
              Slack
            </CardTitle>
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </div>
          <CardDescription>Send messages to channels & DMs</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="h-8 w-8 rounded-lg bg-[#4A154B] flex items-center justify-center overflow-hidden flex-shrink-0">
              {status.details?.teamIcon ? (
                <img
                  src={status.details.teamIcon}
                  alt={status.details.teamName || "Slack"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <SlackIcon className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {status.details?.teamName || "Slack Workspace"}
              </div>
              <div className="text-xs text-muted-foreground">
                Workspace connected
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Disconnected state
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlackIcon className="h-5 w-5" />
          Slack
        </CardTitle>
        <CardDescription>
          Connect for team messaging & notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full bg-[#4A154B] hover:bg-[#3e1240]"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <SlackIcon className="h-4 w-4 mr-2" />
              Add to Slack
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
