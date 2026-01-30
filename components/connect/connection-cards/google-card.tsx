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
import { Loader2, CheckCircle, Mail, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

interface GoogleCardProps {
  status: ServiceStatus;
  onConnected: () => void;
  connectPageUrl: string; // Full URL of current connect page for OAuth return
}

export function GoogleCard({
  status,
  onConnected,
  connectPageUrl,
}: GoogleCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const response = await fetch("/api/v1/google/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirectUrl: connectPageUrl,
        }),
      });

      const data = await response.json();

      if (response.ok && data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        toast.error(data.error || "Failed to initiate Google OAuth");
        setIsConnecting(false);
      }
    } catch {
      toast.error("Network error. Please check your connection.");
      setIsConnecting(false);
    }
  };

  if (status.loading) {
    return (
      <Card aria-busy="true" aria-label="Loading Google connection status">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading Google connection status...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={status.connected ? "border-green-500/50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm border">
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-label="Google">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
            <div>
              <CardTitle className="text-base">Google Services</CardTitle>
              <CardDescription className="text-xs">
                Gmail, Calendar, Contacts
              </CardDescription>
            </div>
          </div>
          {status.connected && (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">
                {status.details?.email}
              </span>
            </div>
            {status.details?.scopes && status.details.scopes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {status.details.scopes.map((scope) => (
                  <Badge key={scope} variant="outline" className="text-xs">
                    {scope.includes("gmail") && (
                      <Mail className="h-3 w-3 mr-1" />
                    )}
                    {scope.includes("calendar") && (
                      <Calendar className="h-3 w-3 mr-1" />
                    )}
                    {scope.includes("contacts") && (
                      <Users className="h-3 w-3 mr-1" />
                    )}
                    {scope.split("/").pop()?.split(".").pop()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2 text-xs text-muted-foreground">
              <Mail className="h-4 w-4 text-red-500 shrink-0" />
              <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
              <Users className="h-4 w-4 text-green-500 shrink-0" />
              <span>Access email, calendar & contacts</span>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
              size="sm"
              aria-busy={isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                  <span>Connecting...</span>
                </>
              ) : (
                "Connect Google"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
