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
  Bot,
  ChevronDown,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

interface TelegramCardProps {
  status: ServiceStatus;
  onConnected: () => void;
}

export function TelegramCard({ status, onConnected }: TelegramCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const handleConnect = async () => {
    if (isConnecting) return;
    if (!botToken.trim()) {
      toast.error("Please enter your Telegram bot token");
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("/api/v1/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`Telegram bot @${data.botUsername} connected!`);
        setBotToken("");
        onConnected();
      } else {
        toast.error(data.error || "Failed to connect Telegram bot");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsConnecting(false);
  };

  if (status.loading) {
    return (
      <Card aria-busy="true" aria-label="Loading Telegram connection status">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading Telegram connection status...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={status.connected ? "border-green-500/50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#0088cc]/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-[#0088cc]" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram Bot</CardTitle>
              <CardDescription className="text-xs">
                Connect your bot
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
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Bot className="h-4 w-4 text-[#0088cc]" />
            <span className="text-sm font-medium">
              @{status.details?.botUsername}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() =>
                window.open(
                  `https://t.me/${status.details?.botUsername}`,
                  "_blank",
                )
              }
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open
            </Button>
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
                  <span>How to create a bot</span>
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
                    Open{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0088cc] hover:underline"
                    >
                      @BotFather
                    </a>{" "}
                    on Telegram
                  </li>
                  <li>
                    Send{" "}
                    <code className="bg-background px-1 rounded">/newbot</code>
                  </li>
                  <li>Follow the prompts to name your bot</li>
                  <li>Copy the API token and paste below</li>
                </ol>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-1">
              <Label htmlFor="botToken" className="text-xs">
                Bot Token
              </Label>
              <Input
                id="botToken"
                type="password"
                placeholder="123456789:ABCdefGHI..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                className="h-8 text-sm"
              />
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting || !botToken.trim()}
              className="w-full bg-[#0088cc] hover:bg-[#0077b5]"
              size="sm"
              aria-busy={isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                  <span>Connecting...</span>
                </>
              ) : (
                "Connect Telegram"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
