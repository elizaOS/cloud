"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle, Webhook, ExternalLink } from "lucide-react";
import type { ServiceStatus } from "@/lib/hooks/use-connection-status";

interface WebhookCardProps {
  status: ServiceStatus;
  onConnected: () => void;
}

export function WebhookCard({ status }: WebhookCardProps) {
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

  // Webhooks are always available
  return (
    <Card className="border-green-500/50 bg-green-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-5 w-5 text-purple-500" />
            Webhooks
          </CardTitle>
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Available
          </Badge>
        </div>
        <CardDescription>Receive events from any service</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
          <p className="mb-2">
            Create webhook endpoints to receive HTTP POST events from external services.
          </p>
          <a
            href="/dashboard/settings?tab=connections"
            className="text-purple-500 hover:underline inline-flex items-center gap-1"
          >
            Configure in Settings
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
