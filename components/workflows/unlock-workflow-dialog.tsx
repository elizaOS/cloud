"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * Missing credential info
 */
export interface MissingCredential {
  provider: string;
  displayName: string;
  description: string;
  connectUrl: string;
}

/**
 * Workflow info for the dialog
 */
export interface WorkflowInfo {
  id: string;
  name: string;
  description?: string;
  serviceDependencies?: string[];
}

interface UnlockWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowInfo;
  missingCredentials: MissingCredential[];
}

/**
 * Get the icon/color for a provider
 */
function getProviderStyles(provider: string): { bgClass: string; textClass: string } {
  const styles: Record<string, { bgClass: string; textClass: string }> = {
    google: { bgClass: "bg-red-500/10", textClass: "text-red-400" },
    twilio: { bgClass: "bg-purple-500/10", textClass: "text-purple-400" },
    blooio: { bgClass: "bg-blue-500/10", textClass: "text-blue-400" },
    notion: { bgClass: "bg-zinc-500/10", textClass: "text-zinc-400" },
    telegram: { bgClass: "bg-sky-500/10", textClass: "text-sky-400" },
  };
  return styles[provider] || { bgClass: "bg-muted", textClass: "text-muted-foreground" };
}

export function UnlockWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  missingCredentials,
}: UnlockWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-yellow-400" />
            <DialogTitle>Connect to Unlock</DialogTitle>
          </div>
          <DialogDescription>
            <span className="font-medium text-foreground">{workflow.name}</span>{" "}
            requires the following connections to run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Workflow info */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{workflow.name}</h4>
              {workflow.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {workflow.description}
                </p>
              )}
              {workflow.serviceDependencies && workflow.serviceDependencies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {workflow.serviceDependencies.map((dep) => (
                    <Badge key={dep} variant="outline" className="text-xs">
                      {dep}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Missing credentials */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Missing Connections ({missingCredentials.length})
            </h4>

            {missingCredentials.map((credential) => {
              const styles = getProviderStyles(credential.provider);
              return (
                <div
                  key={credential.provider}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${styles.bgClass}`}
                    >
                      <span className={`text-sm font-bold ${styles.textClass}`}>
                        {credential.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{credential.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {credential.description}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={credential.connectUrl}>
                      Connect
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <Link href="/dashboard/settings?tab=connections">
              Go to Connections
              <ExternalLink className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
