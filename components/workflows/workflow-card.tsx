"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Settings,
  Trash2,
  Share2,
  Clock,
  CheckCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  userIntent: string;
  serviceDependencies: string[];
  status: "draft" | "testing" | "live" | "shared" | "deprecated";
  usageCount: number;
  successRate: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

interface WorkflowCardProps {
  workflow: Workflow;
  onView: (workflow: Workflow) => void;
  onExecute: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onShare?: (workflow: Workflow) => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "live":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Live
        </Badge>
      );
    case "testing":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Testing
        </Badge>
      );
    case "shared":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Share2 className="h-3 w-3 mr-1" />
          Shared
        </Badge>
      );
    case "deprecated":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <AlertCircle className="h-3 w-3 mr-1" />
          Deprecated
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Settings className="h-3 w-3 mr-1" />
          Draft
        </Badge>
      );
  }
}

function getServiceBadge(service: string) {
  const colors: Record<string, string> = {
    google: "bg-red-500/10 text-red-400 border-red-500/30",
    twilio: "bg-red-500/10 text-red-400 border-red-500/30",
    blooio: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    notion: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  };

  return (
    <Badge
      key={service}
      variant="outline"
      className={`text-xs px-1.5 py-0 ${colors[service] || ""}`}
    >
      {service}
    </Badge>
  );
}

export function WorkflowCard({
  workflow,
  onView,
  onExecute,
  onDelete,
  onShare,
}: WorkflowCardProps) {
  const timeAgo = formatDistanceToNow(new Date(workflow.updatedAt), {
    addSuffix: true,
  });

  return (
    <Card
      className="hover:border-primary/50 transition-colors cursor-pointer group"
      onClick={() => onView(workflow)}
      data-testid="workflow-card"
      aria-label={`Workflow: ${workflow.name}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base font-semibold truncate flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              {workflow.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {workflow.description || workflow.userIntent}
            </p>
          </div>
          <span data-testid="status-badge">{getStatusBadge(workflow.status)}</span>
        </div>
      </CardHeader>

      <CardContent>
        {/* Service dependencies */}
        <div className="flex flex-wrap gap-1 mb-3">
          {workflow.serviceDependencies.map((service) => getServiceBadge(service))}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>
            {workflow.usageCount} execution{workflow.usageCount !== 1 ? "s" : ""}
          </span>
          {workflow.successRate && (
            <span className="text-green-400">
              {Number.parseFloat(workflow.successRate).toFixed(0)}% success
            </span>
          )}
          <span>{timeAgo}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="default"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onExecute(workflow);
            }}
          >
            <Play className="h-4 w-4 mr-1" />
            Run
          </Button>
          {onShare && !workflow.isPublic && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onShare(workflow);
              }}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(workflow);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
