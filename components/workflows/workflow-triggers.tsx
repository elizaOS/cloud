"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Clock,
  Globe,
  Bot,
  Zap,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type TriggerType = "cron" | "webhook" | "mcp" | "a2a";

interface Trigger {
  id: string;
  triggerType: TriggerType;
  triggerKey: string;
  config: {
    cronExpression?: string;
    webhookSecret?: string;
    webhookUrl?: string;
    requireSignature?: boolean;
    skillId?: string;
    toolName?: string;
    maxExecutionsPerDay?: number;
    inputData?: Record<string, unknown>;
  };
  isActive: boolean;
  executionCount: number;
  errorCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  webhookUrl?: string;
}

interface WorkflowTriggersProps {
  workflowId: string;
  workflowName: string;
}

const TRIGGER_CONFIG: Record<TriggerType, { 
  label: string; 
  description: string; 
  icon: typeof Globe; 
  color: string;
}> = {
  webhook: { label: "Webhook", description: "HTTP endpoint trigger", icon: Globe, color: "from-green-500 to-emerald-500" },
  cron: { label: "Schedule", description: "Cron-based scheduling", icon: Clock, color: "from-blue-500 to-cyan-500" },
  mcp: { label: "MCP Tool", description: "Model Context Protocol", icon: Bot, color: "from-purple-500 to-pink-500" },
  a2a: { label: "A2A Skill", description: "Agent-to-Agent", icon: Zap, color: "from-orange-500 to-red-500" },
};

const TRIGGER_TYPES = Object.entries(TRIGGER_CONFIG).map(([value, config]) => ({ 
  value: value as TriggerType, 
  ...config 
}));

const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
];

export function WorkflowTriggers({ workflowId, workflowName }: WorkflowTriggersProps) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Create trigger dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<TriggerType>("webhook");
  const [createConfig, setCreateConfig] = useState({
    cronExpression: "0 * * * *",
    toolName: workflowName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    skillId: workflowName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    maxExecutionsPerDay: 1000,
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsRefreshing(true);
      const response = await fetch(`/api/v1/n8n/triggers?workflowId=${workflowId}`);
      if (response.ok && !cancelled) {
        const data = await response.json();
        setTriggers(data.triggers || []);
      }
      if (!cancelled) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [workflowId]);

  const fetchTriggers = async () => {
    setIsRefreshing(true);
    const response = await fetch(`/api/v1/n8n/triggers?workflowId=${workflowId}`);
    if (response.ok) {
      const data = await response.json();
      setTriggers(data.triggers || []);
    }
    setIsRefreshing(false);
  };

  const handleCreate = async () => {
    setIsCreating(true);

    const config: Record<string, unknown> = {
      maxExecutionsPerDay: createConfig.maxExecutionsPerDay,
    };

    let triggerKey = "";

    switch (createType) {
      case "cron":
        config.cronExpression = createConfig.cronExpression;
        triggerKey = `cron-${workflowId.slice(0, 8)}-${Date.now()}`;
        break;
      case "webhook":
        triggerKey = `wh-${workflowId.slice(0, 8)}-${Date.now().toString(36)}`;
        config.requireSignature = true;
        break;
      case "mcp":
        config.toolName = createConfig.toolName;
        triggerKey = `mcp-${createConfig.toolName}`;
        break;
      case "a2a":
        config.skillId = createConfig.skillId;
        triggerKey = `a2a-${createConfig.skillId}`;
        break;
    }

    const response = await fetch("/api/v1/n8n/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId,
        triggerType: createType,
        triggerKey,
        config,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to create trigger");
      setIsCreating(false);
      return;
    }

    toast.success("Trigger created");
    setShowCreateDialog(false);
    setIsCreating(false);
    fetchTriggers();
  };

  const handleToggle = async (trigger: Trigger, active: boolean) => {
    const response = await fetch(`/api/v1/n8n/triggers/${trigger.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: active }),
    });

    if (!response.ok) {
      toast.error("Failed to update trigger");
      return;
    }

    setTriggers(triggers.map((t) => (t.id === trigger.id ? { ...t, isActive: active } : t)));
    toast.success(active ? "Trigger enabled" : "Trigger disabled");
  };

  const handleDelete = async (trigger: Trigger) => {
    if (!confirm("Delete this trigger?")) return;

    const response = await fetch(`/api/v1/n8n/triggers/${trigger.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error("Failed to delete trigger");
      return;
    }

    setTriggers(triggers.filter((t) => t.id !== trigger.id));
    toast.success("Trigger deleted");
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  const getEndpointUrl = (trigger: Trigger): string => {
    if (trigger.webhookUrl) return trigger.webhookUrl;
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://elizacloud.ai";
    const urls: Record<TriggerType, string> = {
      webhook: `${baseUrl}/api/v1/n8n/webhooks/${trigger.triggerKey}`,
      mcp: `${baseUrl}/api/mcp/workflows/${workflowId}`,
      a2a: `${baseUrl}/api/a2a/workflows/${workflowId}`,
      cron: "",
    };
    return urls[trigger.triggerType];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Triggers</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchTriggers}
            disabled={isRefreshing}
            className="text-white/60 hover:text-white"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <BrandButton variant="primary" size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Trigger
          </BrandButton>
        </div>
      </div>

      {triggers.length === 0 ? (
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-white/40" />
            </div>
            <h4 className="text-white font-medium mb-2">No triggers configured</h4>
            <p className="text-sm text-white/50 mb-4">
              Add a trigger to run this workflow via webhook, schedule, MCP, or A2A
            </p>
            <BrandButton variant="secondary" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Trigger
            </BrandButton>
          </div>
        </BrandCard>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger) => {
            const config = TRIGGER_CONFIG[trigger.triggerType];
            const endpointUrl = getEndpointUrl(trigger);

            return (
              <BrandCard key={trigger.id} className="relative">
                <CornerBrackets size="sm" className="opacity-10" />
                <div className="relative z-10 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn("p-2 rounded-lg bg-gradient-to-r", config.color)}>
                        <config.icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white capitalize">
                            {trigger.triggerType === "a2a"
                              ? "A2A Skill"
                              : trigger.triggerType === "mcp"
                              ? "MCP Tool"
                              : trigger.triggerType}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              trigger.isActive
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            )}
                          >
                            {trigger.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>

                        {trigger.triggerType === "cron" && (
                          <code className="text-xs text-white/50 font-mono">
                            {trigger.config.cronExpression}
                          </code>
                        )}

                        {trigger.triggerType === "mcp" && trigger.config.toolName && (
                          <code className="text-xs text-[#FF5800] font-mono">
                            {trigger.config.toolName}
                          </code>
                        )}

                        {trigger.triggerType === "a2a" && trigger.config.skillId && (
                          <code className="text-xs text-[#FF5800] font-mono">
                            {trigger.config.skillId}
                          </code>
                        )}

                        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                          <span>{trigger.executionCount} executions</span>
                          {trigger.errorCount > 0 && (
                            <span className="text-red-400">{trigger.errorCount} errors</span>
                          )}
                          {trigger.lastExecutedAt && (
                            <span>
                              Last run {formatDistanceToNow(new Date(trigger.lastExecutedAt))} ago
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={trigger.isActive}
                        onCheckedChange={(checked) => handleToggle(trigger, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(trigger)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Endpoint URL for webhook/mcp/a2a */}
                  {endpointUrl && (
                    <div className="mt-3 flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-black/30 rounded text-xs text-white/60 font-mono truncate">
                        {endpointUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(endpointUrl, trigger.id)}
                      >
                        {copied === trigger.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </BrandCard>
            );
          })}
        </div>
      )}

      {/* Create Trigger Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Trigger</DialogTitle>
            <DialogDescription>
              Configure how this workflow can be triggered
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white/80">Trigger Type</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {TRIGGER_TYPES.map(({ value, label, description, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCreateType(value as TriggerType)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                      createType === value
                        ? "border-[#FF5800]/50 bg-[#FF5800]/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        createType === value ? "text-[#FF5800]" : "text-white/50"
                      )}
                    />
                    <div>
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div className="text-xs text-white/40">{description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {createType === "cron" && (
              <div>
                <Label className="text-white/80">Schedule</Label>
                <Select
                  value={createConfig.cronExpression}
                  onValueChange={(v) => setCreateConfig({ ...createConfig, cronExpression: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={createConfig.cronExpression}
                  onChange={(e) =>
                    setCreateConfig({ ...createConfig, cronExpression: e.target.value })
                  }
                  placeholder="Custom cron expression"
                  className="mt-2 font-mono text-sm"
                />
              </div>
            )}

            {createType === "mcp" && (
              <div>
                <Label className="text-white/80">Tool Name</Label>
                <Input
                  value={createConfig.toolName}
                  onChange={(e) => setCreateConfig({ ...createConfig, toolName: e.target.value })}
                  placeholder="e.g., run_workflow"
                  className="mt-1 font-mono"
                />
                <p className="text-xs text-white/40 mt-1">
                  This becomes callable as an MCP tool by AI agents
                </p>
              </div>
            )}

            {createType === "a2a" && (
              <div>
                <Label className="text-white/80">Skill ID</Label>
                <Input
                  value={createConfig.skillId}
                  onChange={(e) => setCreateConfig({ ...createConfig, skillId: e.target.value })}
                  placeholder="e.g., process-data"
                  className="mt-1 font-mono"
                />
                <p className="text-xs text-white/40 mt-1">
                  Other agents can call this workflow via A2A protocol
                </p>
              </div>
            )}

            {createType === "webhook" && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-300">
                    A unique webhook URL will be generated. You can send POST requests to trigger the
                    workflow.
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-white/80">Max Executions per Day</Label>
              <Input
                type="number"
                value={createConfig.maxExecutionsPerDay}
                onChange={(e) =>
                  setCreateConfig({ ...createConfig, maxExecutionsPerDay: parseInt(e.target.value) || 1000 })
                }
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="bg-gradient-to-r from-[#FF5800] to-purple-600"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Trigger"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
