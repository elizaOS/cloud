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
import { Loader2, CheckCircle, XCircle, FileText, Database } from "lucide-react";
import { toast } from "sonner";

// Notion icon SVG
const NotionIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.187 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.763 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM2.877 1.114l13.396-.933c1.634-.14 2.055-.047 3.08.7l4.25 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.127-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.36-1.553z" />
  </svg>
);

interface NotionStatus {
  configured: boolean;
  connected: boolean;
  workspaceId?: string;
  workspaceName?: string;
  workspaceIcon?: string;
  error?: string;
}

export function NotionConnection() {
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/notion/status");
      const data: NotionStatus = await response.json();
      setStatus(data);
    } catch {
      toast.error("Failed to fetch Notion status");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/notion/status", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const data: NotionStatus = await response.json();
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
    const notionStatus = params.get("notion");
    if (notionStatus === "connected") {
      const workspaceName = params.get("workspaceName");
      toast.success(
        workspaceName
          ? `Notion workspace "${decodeURIComponent(workspaceName)}" connected!`
          : "Notion workspace connected!"
      );
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("notion");
      url.searchParams.delete("workspaceName");
      window.history.replaceState({}, "", url.toString());
    } else if (notionStatus === "error") {
      const message = params.get("message");
      toast.error(
        message
          ? `Notion error: ${decodeURIComponent(message)}`
          : "Notion connection failed"
      );
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("notion");
      url.searchParams.delete("message");
      window.history.replaceState({}, "", url.toString());
    }

    return () => controller.abort();
  }, []);

  const handleConnect = () => {
    // Redirect to OAuth flow
    window.location.href = "/api/v1/notion/oauth?returnUrl=/dashboard/settings?tab=connections";
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      const response = await fetch("/api/v1/notion/disconnect", {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Notion disconnected");
        fetchStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to disconnect Notion");
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
                <NotionIcon className="h-5 w-5" />
                Notion
              </CardTitle>
              <CardDescription>
                Notion integration is not configured
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Notion integration requires environment variables to be configured.
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
              <NotionIcon className="h-5 w-5" />
              Notion
            </CardTitle>
            <CardDescription>
              Connect Notion for pages and databases
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
              <div className="h-12 w-12 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden border">
                {status.workspaceIcon ? (
                  <span className="text-2xl">{status.workspaceIcon}</span>
                ) : (
                  <NotionIcon className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{status.workspaceName}</div>
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
                  <FileText className="h-3 w-3" />
                  Create and update pages
                </li>
                <li className="flex items-center gap-2">
                  <Database className="h-3 w-3" />
                  Query and add to databases
                </li>
              </ul>
            </div>

            {/* Disconnect button */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                Use Notion in your workflows.
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
                    <AlertDialogTitle>Disconnect Notion?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove your Notion workspace connection. Any
                      active Notion automation will stop working until you
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
                What you can do with Notion:
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Create pages from automation workflows</li>
                <li>• Add entries to databases</li>
                <li>• Search and retrieve content</li>
                <li>• Organize knowledge automatically</li>
              </ul>
            </div>

            <Button onClick={handleConnect} className="w-full">
              <NotionIcon className="h-4 w-4 mr-2" />
              Connect Notion
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              You&apos;ll be redirected to Notion to authorize access
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
