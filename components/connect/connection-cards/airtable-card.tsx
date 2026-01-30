"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

// Airtable icon SVG
const AirtableIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.992 0L0 5.395v13.158L11.992 24V10.842L24 5.395 11.992 0zm.016 11.789v10.158l10.008-4.316V7.473l-10.008 4.316z" />
  </svg>
);

interface AirtableCardProps {
  status: ServiceStatus;
  onConnected: () => void;
}

export function AirtableCard({ status, onConnected }: AirtableCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [accessToken, setAccessToken] = useState("");

  const handleConnect = async () => {
    if (!accessToken.trim()) {
      toast.error("Please enter your Airtable Personal Access Token");
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("/api/v1/airtable/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success("Airtable connected!");
        setAccessToken("");
        onConnected();
      } else {
        toast.error(data.error || "Failed to connect Airtable");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }

    setIsConnecting(false);
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

  // Connected state
  if (status.connected) {
    return (
      <Card className="border-green-500/50 bg-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AirtableIcon className="h-5 w-5 text-[#18BFFF]" />
              Airtable
            </CardTitle>
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </div>
          <CardDescription>Bases & tables</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <AirtableIcon className="h-5 w-5 text-[#18BFFF]" />
            <span className="text-sm font-medium">
              {status.details?.email || "Airtable connected"}
            </span>
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
          <AirtableIcon className="h-5 w-5 text-[#18BFFF]" />
          Airtable
        </CardTitle>
        <CardDescription>Connect for database automation</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="airtableToken" className="text-xs">
            Personal Access Token
          </Label>
          <Input
            id="airtableToken"
            type="password"
            placeholder="pat..."
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className="h-8 text-sm font-mono"
          />
        </div>

        <Button
          onClick={handleConnect}
          disabled={isConnecting || !accessToken.trim()}
          className="w-full bg-[#18BFFF] hover:bg-[#0ea5e9]"
          size="sm"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <AirtableIcon className="h-4 w-4 mr-2" />
              Connect Airtable
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
