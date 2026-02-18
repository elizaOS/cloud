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
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface OAuthConnectionData {
  id: string;
  platform: string;
  email?: string;
  displayName?: string;
  username?: string;
  scopes?: string[];
  status: string;
}

interface ConnectionStatus {
  connected: boolean;
  connectionId?: string;
  email?: string;
  displayName?: string;
  username?: string;
  scopes?: string[];
}

export interface GenericOAuthConnectionProps {
  platformId: string;
  platformName: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  accentColor?: string;
}

export function GenericOAuthConnection({
  platformId,
  platformName,
  description,
  icon,
  features,
  accentColor = "blue",
}: GenericOAuthConnectionProps) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/v1/oauth/connections?platform=${platformId}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          const data = await response.json();
          const connections: OAuthConnectionData[] = data.connections || [];
          const active = connections.find((c) => c.status === "active");

          setStatus({
            connected: !!active,
            connectionId: active?.id,
            email: active?.email,
            displayName: active?.displayName,
            username: active?.username,
            scopes: active?.scopes,
          });
          setIsLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadStatus();

    return () => controller.abort();
  }, [platformId]);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/oauth/connections?platform=${platformId}`,
      );
      const data = await response.json();
      const connections: OAuthConnectionData[] = data.connections || [];
      const active = connections.find((c) => c.status === "active");

      setStatus({
        connected: !!active,
        connectionId: active?.id,
        email: active?.email,
        displayName: active?.displayName,
        username: active?.username,
        scopes: active?.scopes,
      });
    } catch {
      toast.error(`Failed to fetch ${platformName} status`);
    }
    setIsLoading(false);
  };

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const response = await fetch(`/api/v1/oauth/${platformId}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirectUrl: "/dashboard/settings?tab=connections",
        }),
      });

      const data = await response.json();

      if (response.ok && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error(
          data.error || `Failed to initiate ${platformName} connection`,
        );
        setIsConnecting(false);
      }
    } catch {
      toast.error("Network error. Please check your connection.");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (isDisconnecting || !status?.connectionId) return;
    setIsDisconnecting(true);

    try {
      const response = await fetch(
        `/api/v1/oauth/connections/${status.connectionId}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        toast.success(`${platformName} disconnected`);
        fetchStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to disconnect");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsDisconnecting(false);
  };

  const displayLabel =
    status?.displayName || status?.username || status?.email || "Connected";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
              {icon}
              {platformName}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {status?.connected && (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div
                className={`h-12 w-12 rounded-full bg-${accentColor}-100 dark:bg-${accentColor}-900/30 flex items-center justify-center`}
              >
                {icon}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{displayLabel}</div>
                <div className="text-sm text-muted-foreground">
                  {platformName} account connected
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                Available for AI-powered automation
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
                    <AlertDialogTitle>
                      Disconnect {platformName}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will revoke access to {platformName}. Any active
                      automations using {platformName} will stop working until
                      you reconnect.
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
                Connect {platformName} to enable:
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {features.map((feature, i) => (
                  <li key={i}>• {feature}</li>
                ))}
              </ul>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  {icon}
                  <span className="ml-2">Connect {platformName}</span>
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
