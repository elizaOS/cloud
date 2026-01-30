"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

// X/Twitter icon SVG
const XIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface TwitterCardProps {
  status: ServiceStatus;
  onConnected: () => void;
  connectPageUrl: string;
}

export function TwitterCard({
  status,
  onConnected,
  connectPageUrl,
}: TwitterCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const response = await fetch("/api/v1/twitter/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirectUrl: connectPageUrl,
        }),
      });

      const data = await response.json();

      if (response.ok && data.authUrl) {
        // Redirect to Twitter OAuth
        window.location.href = data.authUrl;
      } else {
        toast.error(data.error || "Failed to initiate Twitter OAuth");
        setIsConnecting(false);
      }
    } catch {
      toast.error("Network error. Please try again.");
      setIsConnecting(false);
    }
  };

  // Loading state
  if (status.loading) {
    return (
      <Card aria-busy="true" aria-label="Loading Twitter connection status">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading Twitter connection status...</span>
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
            <XIcon className="h-5 w-5" />
            Twitter/X
          </CardTitle>
          <CardDescription>
            Twitter integration is not configured on this platform.
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
              <XIcon className="h-5 w-5" />
              Twitter/X
            </CardTitle>
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </div>
          <CardDescription>Post and engage automatically</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            {status.details?.avatarUrl && (
              <Image
                src={status.details.avatarUrl}
                alt={status.details.username || "Twitter avatar"}
                width={40}
                height={40}
                className="rounded-full"
                unoptimized
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                @{status.details?.username}
              </div>
              <div className="text-xs text-muted-foreground">
                Twitter account connected
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                window.open(
                  `https://twitter.com/${status.details?.username}`,
                  "_blank",
                )
              }
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
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
          <XIcon className="h-5 w-5" />
          Twitter/X
        </CardTitle>
        <CardDescription>
          Connect for AI-powered posting & engagement
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full"
          variant="outline"
          aria-busy={isConnecting}
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <XIcon className="h-4 w-4 mr-2" />
              Connect Twitter
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
