"use client";

import { useState, useEffect } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Database,
  Table2,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

// Airtable icon SVG
const AirtableIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.992 0L0 5.395v13.158L11.992 24V10.842L24 5.395 11.992 0zm.016 11.789v10.158l10.008-4.316V7.473l-10.008 4.316z" />
  </svg>
);

interface AirtableStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  userId?: string;
  error?: string;
}

export function AirtableConnection() {
  const [status, setStatus] = useState<AirtableStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/v1/airtable/status");
      const data: AirtableStatus = await response.json();
      setStatus(data);
    } catch {
      toast.error("Failed to fetch Airtable status");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/airtable/status", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const data: AirtableStatus = await response.json();
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

    return () => controller.abort();
  }, []);

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
        toast.success("Airtable connected successfully!");
        setAccessToken("");
        fetchStatus();
      } else {
        toast.error(data.error || "Failed to connect Airtable");
      }
    } catch {
      toast.error("Network error. Please check your connection.");
    }

    setIsConnecting(false);
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      const response = await fetch("/api/v1/airtable/disconnect", {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Airtable disconnected");
        fetchStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to disconnect Airtable");
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AirtableIcon className="h-5 w-5 text-[#18BFFF]" />
              Airtable
            </CardTitle>
            <CardDescription>
              Connect Airtable for database automation
            </CardDescription>
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
            {/* Connected account */}
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div className="h-12 w-12 rounded-lg bg-[#18BFFF] flex items-center justify-center">
                <AirtableIcon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {status.email || "Airtable Account"}
                </div>
                <div className="text-sm text-muted-foreground">
                  Account connected
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
                  <Database className="h-3 w-3" />
                  Access your Airtable bases
                </li>
                <li className="flex items-center gap-2">
                  <Table2 className="h-3 w-3" />
                  Read and write records
                </li>
              </ul>
            </div>

            {/* Disconnect */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                Use Airtable in your workflows.
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
                    <AlertDialogTitle>Disconnect Airtable?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove your Airtable connection. Any active
                      Airtable automation will stop working until you reconnect.
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
                  <span>How to get your token</span>
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
                      href="https://airtable.com/create/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#18BFFF] hover:underline inline-flex items-center gap-1"
                    >
                      Airtable Token Settings
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Create a new Personal Access Token</li>
                  <li>
                    Add scopes: <code>data.records:read</code>,{" "}
                    <code>data.records:write</code>, <code>schema.bases:read</code>
                  </li>
                  <li>Add access to your bases</li>
                  <li>Copy and paste the token below</li>
                </ol>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
