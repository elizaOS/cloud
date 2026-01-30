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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  CheckCircle,
  MessageCircle,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

interface BlooioCardProps {
  status: ServiceStatus;
  onConnected: () => void;
}

export function BlooioCard({ status, onConnected }: BlooioCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const handleConnect = async () => {
    if (isConnecting) return;
    if (!apiKey.trim()) {
      toast.error("Please enter your Blooio API Key");
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error("Please enter your iMessage phone number");
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("/api/v1/blooio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, fromNumber: phoneNumber }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success("iMessage connected successfully!");
        setApiKey("");
        setPhoneNumber("");
        onConnected();
      } else {
        toast.error(data.error || "Failed to connect iMessage");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsConnecting(false);
  };

  if (status.loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={status.connected ? "border-green-500/50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-base">iMessage</CardTitle>
              <CardDescription className="text-xs">via Blooio</CardDescription>
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
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">
              {status.details?.fromNumber}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <Collapsible
              open={showInstructions}
              onOpenChange={setShowInstructions}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between p-2 h-auto text-xs"
                >
                  <span>How to get credentials</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      showInstructions ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="text-xs text-muted-foreground p-2 bg-muted rounded-lg mt-1">
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Go to{" "}
                    <a
                      href="https://blooio.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:underline inline-flex items-center gap-1"
                    >
                      Blooio.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Create an account and get your API key</li>
                  <li>Enter your iMessage-enabled phone number</li>
                </ol>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="blooioApiKey" className="text-xs">
                  API Key
                </Label>
                <Input
                  id="blooioApiKey"
                  type="password"
                  placeholder="Your Blooio API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="blooioPhone" className="text-xs">
                  Phone Number
                </Label>
                <Input
                  id="blooioPhone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting || !apiKey.trim() || !phoneNumber.trim()}
              className="w-full bg-green-600 hover:bg-green-700"
              size="sm"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                "Connect iMessage"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
