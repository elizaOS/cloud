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

// Notion icon SVG
const NotionIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.187 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.763 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM2.877 1.114l13.396-.933c1.634-.14 2.055-.047 3.08.7l4.25 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.127-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.36-1.553z" />
  </svg>
);

interface NotionCardProps {
  status: ServiceStatus;
  onConnected: () => void;
  connectPageUrl: string;
}

export function NotionCard({
  status,
  onConnected,
  connectPageUrl,
}: NotionCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    const returnUrl = encodeURIComponent(connectPageUrl);
    window.location.href = `/api/v1/notion/oauth?returnUrl=${returnUrl}`;
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
            <NotionIcon className="h-5 w-5" />
            Notion
          </CardTitle>
          <CardDescription>
            Notion integration is not configured on this platform.
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
              <NotionIcon className="h-5 w-5" />
              Notion
            </CardTitle>
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </div>
          <CardDescription>Pages & databases</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="h-8 w-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border flex-shrink-0">
              {status.details?.workspaceIcon ? (
                <span className="text-lg">{status.details.workspaceIcon}</span>
              ) : (
                <NotionIcon className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {status.details?.workspaceName || "Notion Workspace"}
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
          <NotionIcon className="h-5 w-5" />
          Notion
        </CardTitle>
        <CardDescription>
          Connect for pages & database automation
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full"
          variant="outline"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <NotionIcon className="h-4 w-4 mr-2" />
              Connect Notion
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
