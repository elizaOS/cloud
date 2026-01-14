"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Node } from "@xyflow/react";

interface NodeConfigPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
}: NodeConfigPanelProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) {
      setLocalData(node.data as Record<string, unknown>);
    }
  }, [node]);

  if (!node) return null;

  const handleSave = () => {
    onUpdate(node.id, localData);
    onClose();
  };

  const updateField = (key: string, value: unknown) => {
    setLocalData((prev) => ({ ...prev, [key]: value }));
  };

  const renderConfig = () => {
    switch (node.type) {
      case "trigger":
        return <TriggerConfig data={localData} onChange={updateField} />;
      case "agent":
        return <AgentConfig data={localData} onChange={updateField} />;
      case "image":
        return <ImageConfig data={localData} onChange={updateField} />;
      case "output":
        return <OutputConfig data={localData} onChange={updateField} />;
      default:
        return <div>Unknown node type</div>;
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-black/95 border-l border-white/10 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">
          Configure {node.type}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-md transition-colors"
        >
          <X className="w-5 h-5 text-white/60" />
        </button>
      </div>

      <div className="space-y-6">{renderConfig()}</div>

      <div className="mt-6 flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-[#FF5800] text-black">
          Save
        </Button>
        <Button onClick={onClose} variant="outline" className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Trigger Configuration
function TriggerConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Trigger Type</Label>
        <Select
          value={(data.triggerType as string) ?? "manual"}
          onValueChange={(v) => onChange("triggerType", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual (Run button)</SelectItem>
            <SelectItem value="webhook">Webhook (HTTP POST)</SelectItem>
            <SelectItem value="schedule">Schedule (Cron)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.triggerType === "schedule" && (
        <div>
          <Label className="text-white/80">Cron Expression</Label>
          <Input
            value={(data.schedule as string) ?? ""}
            onChange={(e) => onChange("schedule", e.target.value)}
            placeholder="*/5 * * * *"
            className="mt-1"
          />
          <p className="text-xs text-white/40 mt-1">
            e.g., "*/5 * * * *" = every 5 minutes
          </p>
        </div>
      )}
    </div>
  );
}

// Agent Configuration
function AgentConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Mode</Label>
        <Select
          value={(data.mode as string) ?? "generic"}
          onValueChange={(v) => onChange("mode", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="generic">Generic AI Completion</SelectItem>
            <SelectItem value="my-agent">Use My Agent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.mode === "my-agent" && (
        <div>
          <Label className="text-white/80">Agent ID</Label>
          <Input
            value={(data.agentId as string) ?? ""}
            onChange={(e) => onChange("agentId", e.target.value)}
            placeholder="Enter agent ID"
            className="mt-1"
          />
        </div>
      )}

      <div>
        <Label className="text-white/80">Prompt</Label>
        <Textarea
          value={(data.prompt as string) ?? ""}
          onChange={(e) => onChange("prompt", e.target.value)}
          placeholder="Enter your prompt..."
          className="mt-1 min-h-[100px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Use {"{input}"} to reference trigger data
        </p>
      </div>

      <div>
        <Label className="text-white/80">Model (Generic mode)</Label>
        <Select
          value={(data.model as string) ?? "gpt-4o-mini"}
          onValueChange={(v) => onChange("model", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast)</SelectItem>
            <SelectItem value="gpt-4o">GPT-4o (Powerful)</SelectItem>
            <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
            <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Image Configuration
function ImageConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Image Model</Label>
        <Select
          value={(data.model as string) ?? "fal-ai/flux/schnell"}
          onValueChange={(v) => onChange("model", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fal-ai/flux/schnell">
              FLUX Schnell (Fast)
            </SelectItem>
            <SelectItem value="fal-ai/flux/dev">FLUX Dev (Quality)</SelectItem>
            <SelectItem value="fal-ai/flux-pro">FLUX Pro (Best)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-white/80">Prompt</Label>
        <Textarea
          value={(data.prompt as string) ?? ""}
          onChange={(e) => onChange("prompt", e.target.value)}
          placeholder="Describe the image to generate..."
          className="mt-1 min-h-[100px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Leave empty to use output from previous agent node
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white/80">Width</Label>
          <Input
            type="number"
            value={(data.width as number) ?? 1024}
            onChange={(e) => onChange("width", parseInt(e.target.value))}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-white/80">Height</Label>
          <Input
            type="number"
            value={(data.height as number) ?? 1024}
            onChange={(e) => onChange("height", parseInt(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}

// Output Configuration
function OutputConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Output Type</Label>
        <Select
          value={(data.outputType as string) ?? "display"}
          onValueChange={(v) => onChange("outputType", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="display">Display in UI</SelectItem>
            <SelectItem value="save">Save to Gallery</SelectItem>
            <SelectItem value="webhook">Send to Webhook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.outputType === "webhook" && (
        <div>
          <Label className="text-white/80">Webhook URL</Label>
          <Input
            value={(data.webhookUrl as string) ?? ""}
            onChange={(e) => onChange("webhookUrl", e.target.value)}
            placeholder="https://..."
            className="mt-1"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="saveToGallery"
          checked={(data.saveToGallery as boolean) ?? false}
          onChange={(e) => onChange("saveToGallery", e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="saveToGallery" className="text-white/80">
          Also save images to gallery
        </Label>
      </div>
    </div>
  );
}
