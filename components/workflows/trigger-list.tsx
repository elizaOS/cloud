"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  Loader2,
  Trash2,
  Edit2,
  Zap,
  MessageSquare,
  Phone,
  Clock,
  Webhook,
  Regex,
} from "lucide-react";

export interface Trigger {
  id: string;
  workflowId: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: {
    keywords?: string[];
    contains?: string;
    pattern?: string;
    phoneNumbers?: string[];
    schedule?: string;
    caseSensitive?: boolean;
  };
  responseConfig: {
    sendResponse?: boolean;
    responseTemplate?: string;
    responseField?: string;
  };
  providerFilter: string;
  priority: number;
  isActive: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TriggerListProps {
  triggers: Trigger[];
  workflowId: string;
  onEdit: (trigger: Trigger) => void;
  onRefresh: () => void;
}

function getTriggerIcon(triggerType: string) {
  switch (triggerType) {
    case "message_keyword":
      return <Zap className="h-4 w-4" />;
    case "message_contains":
      return <MessageSquare className="h-4 w-4" />;
    case "message_from":
      return <Phone className="h-4 w-4" />;
    case "message_regex":
      return <Regex className="h-4 w-4" />;
    case "schedule":
      return <Clock className="h-4 w-4" />;
    case "webhook":
      return <Webhook className="h-4 w-4" />;
    default:
      return <Zap className="h-4 w-4" />;
  }
}

function getTriggerTypeLabel(triggerType: string) {
  switch (triggerType) {
    case "message_keyword":
      return "Keyword Match";
    case "message_contains":
      return "Contains Text";
    case "message_from":
      return "From Sender";
    case "message_regex":
      return "Regex Pattern";
    case "schedule":
      return "Scheduled";
    case "webhook":
      return "Webhook";
    default:
      return triggerType;
  }
}

function getProviderBadge(providerFilter: string) {
  switch (providerFilter) {
    case "twilio":
      return (
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
          SMS
        </Badge>
      );
    case "blooio":
      return (
        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
          iMessage
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          All
        </Badge>
      );
  }
}

function getTriggerConditionSummary(trigger: Trigger) {
  const config = trigger.triggerConfig;
  
  switch (trigger.triggerType) {
    case "message_keyword":
      return config.keywords?.join(", ") || "No keywords";
    case "message_contains":
      return `"${config.contains || ""}"`;
    case "message_from":
      return config.phoneNumbers?.join(", ") || "No numbers";
    case "message_regex":
      return `/${config.pattern || ""}/`;
    case "schedule":
      return config.schedule || "No schedule";
    case "webhook":
      return "External webhook";
    default:
      return "";
  }
}

export function TriggerList({
  triggers,
  workflowId,
  onEdit,
  onRefresh,
}: TriggerListProps) {
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleToggle = async (triggerId: string, currentActive: boolean) => {
    setTogglingId(triggerId);
    try {
      const response = await fetch(
        `/api/v1/workflows/${workflowId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !currentActive }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to toggle trigger");
      }

      toast.success(currentActive ? "Trigger disabled" : "Trigger enabled");
      onRefresh();
    } catch {
      toast.error("Failed to toggle trigger");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (triggerId: string) => {
    if (!confirm("Are you sure you want to delete this trigger?")) return;

    setDeletingId(triggerId);
    try {
      const response = await fetch(
        `/api/v1/workflows/${workflowId}/triggers/${triggerId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete trigger");
      }

      toast.success("Trigger deleted");
      onRefresh();
    } catch {
      toast.error("Failed to delete trigger");
    } finally {
      setDeletingId(null);
    }
  };

  if (triggers.length === 0) {
    return (
      <div className="text-center py-8">
        <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No triggers configured</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create a trigger to automatically run this workflow
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {triggers.map((trigger) => (
        <Card
          key={trigger.id}
          className={`${!trigger.isActive ? "opacity-60" : ""}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div
                  className={`p-2 rounded-lg ${
                    trigger.isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {getTriggerIcon(trigger.triggerType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{trigger.name}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {getTriggerTypeLabel(trigger.triggerType)}
                    </Badge>
                    {getProviderBadge(trigger.providerFilter)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {getTriggerConditionSummary(trigger)}
                  </p>
                  {trigger.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {trigger.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Triggered {trigger.triggerCount} times</span>
                    {trigger.lastTriggeredAt && (
                      <span>
                        Last:{" "}
                        {new Date(trigger.lastTriggeredAt).toLocaleDateString()}
                      </span>
                    )}
                    {trigger.priority > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Priority: {trigger.priority}
                      </Badge>
                    )}
                  </div>
                  {trigger.lastError && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      <span className="truncate">{trigger.lastError}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Switch
                  checked={trigger.isActive}
                  onCheckedChange={() =>
                    handleToggle(trigger.id, trigger.isActive)
                  }
                  disabled={togglingId === trigger.id}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(trigger)}
                  className="h-8 w-8 p-0"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(trigger.id)}
                  disabled={deletingId === trigger.id}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  {deletingId === trigger.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
