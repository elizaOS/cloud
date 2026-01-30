"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle, XCircle, Hash, MessageSquare } from "lucide-react";
import { toast } from "sonner";

// Slack icon SVG
const SlackIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
);

interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamId?: string;
  teamName?: string;
  teamIcon?: string;
  botUserId?: string;
  error?: string;
}

export function SlackConnection() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/slack/status");
      const data: SlackStatus = await response.json();
      setStatus(data);
    } catch {
      toast.error("Failed to fetch Slack status");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/slack/status", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const data: SlackStatus = await response.json();
          setStatus(data);
          setIsLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadStatus();

    // Check for redirect params (after OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const slackStatus = params.get("slack");
    if (slackStatus === "connected") {
      const teamName = params.get("teamName");
      toast.success(
        teamName
          ? `Slack workspace "${decodeURIComponent(teamName)}" connected!`
          : "Slack workspace connected!"
      );
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("slack");
      url.searchParams.delete("teamName");
      window.history.replaceState({}, "", url.toString());
    } else if (slackStatus === "error") {
      const message = params.get("message");
      toast.error(
        message
          ? `Slack error: ${decodeURIComponent(message)}`
          : "Slack connection failed"
      );
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("slack");
      url.searchParams.delete("message");
      window.history.replaceState({}, "", url.toString());
    }

    return () => controller.abort();
  }, []);

  const handleConnect = () => {
    // Redirect to OAuth flow
    window.location.href = "/api/v1/slack/oauth?returnUrl=/dashboard/settings?tab=connections";
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      const response = await fetch("/api/v1/slack/disconnect", {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Slack disconnected");
        fetchStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to disconnect Slack");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsDisconnecting(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SlackIcon className="h-5 w-5" />
                Slack
              </CardTitle>
              <CardDescription>
                Slack integration is not configured
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Slack integration requires environment variables to be configured.
              Please contact your administrator.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SlackIcon className="h-5 w-5" />
              Slack
            </CardTitle>
            <CardDescription>
              Connect Slack for AI-powered messaging automation
            </CardDescription>
          </div>
          {status.connected && (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {status.connected ? (
          <div className="space-y-4">
            {/* Connected workspace */}
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div className="h-12 w-12 rounded-lg bg-[#4A154B] flex items-center justify-center overflow-hidden">
                {status.teamIcon ? (
                  <img
                    src={status.teamIcon}
                    alt={status.teamName || "Slack workspace"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <SlackIcon className="h-6 w-6 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{status.teamName}</div>
                <div className="text-sm text-muted-foreground">
                  Workspace connected
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                Your AI agent can now:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <Hash className="h-3 w-3" />
                  Send messages to channels
                </li>
                <li className="flex items-center gap-2">
                  <MessageSquare className="h-3 w-3" />
                  Send direct messages
                </li>
              </ul>
            </div>

            {/* Disconnect button */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                Enable Slack automation in your workflows.
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Slack?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove your Slack workspace connection. Any
                      active Slack automation will stop working until you
                      reconnect.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDisconnect}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">
                What you can do with Slack automation:
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Send AI-generated messages to channels</li>
                <li>• Post notifications and alerts</li>
                <li>• Respond to messages automatically</li>
                <li>• Share workflow updates with your team</li>
              </ul>
            </div>

            <Button
              onClick={handleConnect}
              className="w-full bg-[#4A154B] hover:bg-[#3e1240]"
            >
              <SlackIcon className="h-4 w-4 mr-2" />
              Add to Slack
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              You&apos;ll be redirected to Slack to authorize the app
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
