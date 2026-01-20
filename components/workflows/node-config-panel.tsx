"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Bot, Database, AppWindow, GripHorizontal } from "lucide-react";
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
import Image from "next/image";
import { AgentPickerDialog } from "./agent-picker-dialog";
import { AppPickerDialog } from "./app-picker-dialog";

interface NodeConfigPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  workflowId?: string;
  position: { x: number; y: number } | null;
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
  workflowId,
  position,
}: NodeConfigPanelProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panelX: number; panelY: number } | null>(null);

  useEffect(() => {
    if (node) {
      setLocalData(node.data as Record<string, unknown>);
    }
  }, [node]);

  // Reset drag position when node changes
  useEffect(() => {
    setDragPosition(null);
  }, [node?.id]);

  // Calculate initial position
  const getInitialPosition = useCallback(() => {
    if (!position || !panelRef.current) return position;

    const panelWidth = 320;
    const panelHeight = panelRef.current.offsetHeight || 400;
    const padding = 16;

    let x = position.x;
    let y = position.y;

    // Check right edge
    if (x + panelWidth + padding > window.innerWidth) {
      x = position.x - panelWidth - 24 - 200;
    }

    // Check bottom edge
    if (y + panelHeight + padding > window.innerHeight) {
      y = window.innerHeight - panelHeight - padding;
    }

    // Ensure minimum top position
    if (y < padding) {
      y = padding;
    }

    return { x, y };
  }, [position]);

  // Mouse event handlers for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const currentPos = dragPosition ?? getInitialPosition();
    if (currentPos) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panelX: currentPos.x,
        panelY: currentPos.y,
      };
    }
  }, [dragPosition, getInitialPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      setDragPosition({
        x: dragStartRef.current.panelX + deltaX,
        y: dragStartRef.current.panelY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (!node || !position) return null;

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
        return <TriggerConfig data={localData} onChange={updateField} workflowId={workflowId} />;
      case "agent":
        return <AgentConfig data={localData} onChange={updateField} />;
      case "image":
        return <ImageConfig data={localData} onChange={updateField} />;
      case "output":
        return <OutputConfig data={localData} onChange={updateField} />;
      case "delay":
        return <DelayConfig data={localData} onChange={updateField} />;
      case "http":
        return <HttpConfig data={localData} onChange={updateField} />;
      case "condition":
        return <ConditionConfig data={localData} onChange={updateField} />;
      case "tts":
        return <TtsConfig data={localData} onChange={updateField} />;
      case "discord":
        return <DiscordConfig data={localData} onChange={updateField} />;
      case "mcp":
        return <McpConfig data={localData} onChange={updateField} />;
      case "twitter":
        return <TwitterConfig data={localData} onChange={updateField} />;
      case "telegram":
        return <TelegramConfig data={localData} onChange={updateField} />;
      case "email":
        return <EmailConfig data={localData} onChange={updateField} />;
      case "app-query":
        return <AppQueryConfig data={localData} onChange={updateField} />;
      default:
        return <div className="text-white/60">Unknown node type: {node.type}</div>;
    }
  };

  const displayPosition = dragPosition ?? getInitialPosition() ?? position;

  return (
    <div
      ref={panelRef}
      className="fixed w-80 bg-[#1A1A1A] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
      style={{
        left: displayPosition.x,
        top: displayPosition.y,
      }}
    >
      {/* Draggable header */}
      <div
        onMouseDown={handleMouseDown}
        className={`flex items-center justify-between px-4 py-3 border-b border-white/10 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        } select-none bg-white/[0.02]`}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-white/30" />
          <h3 className="text-base font-semibold text-white capitalize">
            {node.type}
          </h3>
        </div>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto max-h-[60vh]">
        <div className="space-y-4">{renderConfig()}</div>

        <div className="mt-5 flex gap-2">
          <Button onClick={handleSave} className="flex-1 bg-[#FF5800] text-black hover:bg-[#FF5800]/90 h-9">
            Save
          </Button>
          <Button onClick={onClose} variant="outline" className="flex-1 h-9">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// Trigger Configuration
function TriggerConfig({
  data,
  onChange,
  workflowId,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  workflowId?: string;
}) {
  const triggerType = (data.triggerType as string) ?? "manual";
  const webhookUrl = workflowId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/workflows/webhook/${workflowId}`
    : null;

  const copyWebhookUrl = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Trigger Type</Label>
        <Select
          value={triggerType}
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

      {triggerType === "webhook" && (
        <div className="space-y-3">
          <div>
            <Label className="text-white/80">Webhook URL</Label>
            {webhookUrl ? (
              <div className="mt-1 flex gap-2">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="text-xs font-mono bg-white/5"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyWebhookUrl}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>
            ) : (
              <p className="text-xs text-yellow-400 mt-1">
                Save workflow first to get webhook URL
              </p>
            )}
          </div>

          <div className="bg-white/5 rounded-lg p-3 text-xs space-y-2">
            <div className="text-white/60 font-medium">How to call:</div>
            <code className="block text-green-400 whitespace-pre-wrap">
{`curl -X POST ${webhookUrl ?? "[URL]"} \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`}
            </code>
            <p className="text-white/40">
              The JSON body is available in Agent prompt as {"{input.key}"}
            </p>
          </div>

          <div>
            <Label className="text-white/80">Webhook Secret (Optional)</Label>
            <Input
              value={(data.webhookSecret as string) ?? ""}
              onChange={(e) => onChange("webhookSecret", e.target.value)}
              placeholder="Enter secret for security"
              className="mt-1"
            />
            <p className="text-xs text-white/40 mt-1">
              If set, caller must include header: x-webhook-secret
            </p>
          </div>
        </div>
      )}

      {triggerType === "schedule" && (
        <div className="space-y-3">
          <div>
            <Label className="text-white/80">Run Every</Label>
            <Select
              value={(data.schedule as string) ?? ""}
              onValueChange={(v) => onChange("schedule", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select interval..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="* * * * *">1 minute</SelectItem>
                <SelectItem value="*/5 * * * *">5 minutes</SelectItem>
                <SelectItem value="*/15 * * * *">15 minutes</SelectItem>
                <SelectItem value="*/30 * * * *">30 minutes</SelectItem>
                <SelectItem value="0 * * * *">1 hour</SelectItem>
                <SelectItem value="0 */2 * * *">2 hours</SelectItem>
                <SelectItem value="0 */6 * * *">6 hours</SelectItem>
                <SelectItem value="0 */12 * * *">12 hours</SelectItem>
                <SelectItem value="0 0 * * *">Daily (midnight)</SelectItem>
                <SelectItem value="0 9 * * *">Daily (9 AM)</SelectItem>
                <SelectItem value="0 9 * * 1">Weekly (Monday 9 AM)</SelectItem>
                <SelectItem value="0 9 * * 1-5">Weekdays (9 AM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-xs">
            <p className="text-white/60">
              Scheduled workflows run automatically at the selected interval.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Agent Configuration - Only allows selecting user's own agents
function AgentConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const agentName = data.agentName as string;
  const agentAvatarUrl = data.agentAvatarUrl as string | undefined;

  // Ensure mode is always "my-agent"
  useEffect(() => {
    if (data.mode !== "my-agent") {
      onChange("mode", "my-agent");
    }
  }, [data.mode, onChange]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Select Agent</Label>
        {agentName ? (
          <button
            onClick={() => setShowAgentPicker(true)}
            className="mt-2 flex items-center gap-3 w-full p-3 rounded-lg border border-[#FF5800] bg-[#FF5800]/10 text-left hover:bg-[#FF5800]/20 transition-colors"
          >
            {agentAvatarUrl ? (
              <Image
                src={agentAvatarUrl}
                alt={agentName}
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-400" />
              </div>
            )}
            <div className="flex-1">
              <div className="font-medium text-white">{agentName}</div>
              <div className="text-xs text-white/40">Click to change</div>
            </div>
          </button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setShowAgentPicker(true)}
            className="mt-2 w-full border-dashed border-white/20 hover:border-[#FF5800] hover:bg-[#FF5800]/5"
          >
            <Bot className="w-4 h-4 mr-2" />
            Select one of your agents
          </Button>
        )}
        {!agentName && (
          <p className="text-xs text-yellow-400 mt-2">
            ⚠️ You must select an agent before running this workflow
          </p>
        )}
      </div>

      <AgentPickerDialog
        open={showAgentPicker}
        onOpenChange={setShowAgentPicker}
        onSelect={(agent) => {
          onChange("agentId", agent.id);
          onChange("agentName", agent.name);
          onChange("agentAvatarUrl", agent.avatarUrl ?? "");
          onChange("mode", "my-agent");
        }}
      />

      <div>
        <Label className="text-white/80">Prompt</Label>
        <Textarea
          value={(data.prompt as string) ?? ""}
          onChange={(e) => onChange("prompt", e.target.value)}
          placeholder="Enter your prompt for the agent..."
          className="mt-1 min-h-[100px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Use {"{input}"} to reference trigger data
        </p>
      </div>

      <div className="bg-blue-500/10 rounded-lg p-3 text-xs">
        <p className="text-blue-400">
          Your agent will process the prompt and return a response that can be used by the next node.
        </p>
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

// Delay Configuration
function DelayConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Delay (seconds)</Label>
        <Input
          type="number"
          min="1"
          max="300"
          value={(data.delaySeconds as number) ?? 5}
          onChange={(e) => onChange("delaySeconds", parseInt(e.target.value))}
          className="mt-1"
        />
        <p className="text-xs text-white/40 mt-1">
          Pause execution for this many seconds (max 300)
        </p>
      </div>
      <div className="bg-amber-500/10 rounded-lg p-3 text-xs">
        <p className="text-amber-400">
          Use delays to rate-limit API calls or wait for external processes.
        </p>
      </div>
    </div>
  );
}

// HTTP Request Configuration
function HttpConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">URL</Label>
        <Input
          value={(data.url as string) ?? ""}
          onChange={(e) => onChange("url", e.target.value)}
          placeholder="https://api.example.com/endpoint"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-white/80">Method</Label>
        <Select
          value={(data.method as string) ?? "GET"}
          onValueChange={(v) => onChange("method", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-white/80">Body (JSON)</Label>
        <Textarea
          value={(data.body as string) ?? ""}
          onChange={(e) => onChange("body", e.target.value)}
          placeholder='{"key": "value"}'
          className="mt-1 min-h-[80px] font-mono text-sm"
        />
        <p className="text-xs text-white/40 mt-1">
          Use {"{{nodeId}}"} to insert output from previous nodes
        </p>
      </div>

      <div className="bg-cyan-500/10 rounded-lg p-3 text-xs space-y-1">
        <p className="text-cyan-400 font-medium">Response is available as:</p>
        <p className="text-white/60">• response.status - HTTP status code</p>
        <p className="text-white/60">• response.data - Response body</p>
      </div>
    </div>
  );
}

// Condition Configuration
function ConditionConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Operator</Label>
        <Select
          value={(data.operator as string) ?? "contains"}
          onValueChange={(v) => onChange("operator", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="equals">Equals</SelectItem>
            <SelectItem value="startsWith">Starts With</SelectItem>
            <SelectItem value="endsWith">Ends With</SelectItem>
            <SelectItem value="regex">Regex Match</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-white/80">Value to Match</Label>
        <Input
          value={(data.value as string) ?? ""}
          onChange={(e) => onChange("value", e.target.value)}
          placeholder="Enter text to match..."
          className="mt-1"
        />
      </div>

      <div className="bg-pink-500/10 rounded-lg p-3 text-xs space-y-2">
        <p className="text-pink-400 font-medium">How it works:</p>
        <p className="text-white/60">
          Checks if the previous agent response matches your condition.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-white/60">True → Green output</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-white/60">False → Red output</span>
        </div>
      </div>
    </div>
  );
}

// Text-to-Speech Configuration
function TtsConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Voice</Label>
        <Select
          value={(data.voiceId as string) ?? "21m00Tcm4TlvDq8ikWAM"}
          onValueChange={(v) => onChange("voiceId", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel (Female)</SelectItem>
            <SelectItem value="29vD33N1CtxCmqQRPOHJ">Drew (Male)</SelectItem>
            <SelectItem value="EXAVITQu4vr4xnSDxMaL">Bella (Female)</SelectItem>
            <SelectItem value="ErXwobaYiN019PkySvjV">Antoni (Male)</SelectItem>
            <SelectItem value="MF3mGyEYCl7XYWbV9V6O">Elli (Female)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-white/80">Text (Optional)</Label>
        <Textarea
          value={(data.text as string) ?? ""}
          onChange={(e) => onChange("text", e.target.value)}
          placeholder="Leave empty to use previous agent response"
          className="mt-1 min-h-[80px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Leave empty to automatically use the previous agent's response
        </p>
      </div>

      <div className="bg-violet-500/10 rounded-lg p-3 text-xs">
        <p className="text-violet-400">
          Audio will be generated and saved. You can access it in the output node.
        </p>
      </div>
    </div>
  );
}

// Discord Configuration
function DiscordConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Webhook URL</Label>
        <Input
          value={(data.webhookUrl as string) ?? ""}
          onChange={(e) => onChange("webhookUrl", e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="mt-1 font-mono text-xs"
        />
        <p className="text-xs text-white/40 mt-1">
          Get this from Discord: Server Settings → Integrations → Webhooks
        </p>
      </div>

      <div>
        <Label className="text-white/80">Message (Optional)</Label>
        <Textarea
          value={(data.message as string) ?? ""}
          onChange={(e) => onChange("message", e.target.value)}
          placeholder="Custom message..."
          className="mt-1 min-h-[80px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Leave empty to auto-compose from previous node outputs
        </p>
      </div>

      <div className="bg-indigo-500/10 rounded-lg p-3 text-xs space-y-2">
        <p className="text-indigo-400 font-medium">How to get Webhook URL:</p>
        <ol className="text-white/60 list-decimal list-inside space-y-1">
          <li>Open Discord Server Settings</li>
          <li>Go to Integrations → Webhooks</li>
          <li>Click "New Webhook"</li>
          <li>Copy the Webhook URL</li>
        </ol>
      </div>
    </div>
  );
}

// MCP servers and their tools
const MCP_SERVERS = {
  crypto: {
    name: "Crypto Prices",
    description: "Get real-time cryptocurrency prices",
    tools: [
      { id: "get_crypto_price", name: "Get Price", description: "Get current price for a crypto" },
      { id: "get_multiple_prices", name: "Get Multiple Prices", description: "Get prices for multiple cryptos" },
      { id: "get_price_change", name: "Get Price Change", description: "Get 24h price change" },
    ],
  },
  time: {
    name: "Time & Date",
    description: "Time zone and date utilities",
    tools: [
      { id: "get_current_time", name: "Get Current Time", description: "Get time in any timezone" },
      { id: "get_timezone_info", name: "Get Timezone Info", description: "Get timezone details" },
      { id: "format_date", name: "Format Date", description: "Format a date string" },
    ],
  },
  weather: {
    name: "Weather",
    description: "Current weather and forecasts",
    tools: [
      { id: "get_current_weather", name: "Get Weather", description: "Get current weather for a location" },
      { id: "get_forecast", name: "Get Forecast", description: "Get weather forecast" },
    ],
  },
};

// MCP Tool Configuration
function McpConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const selectedServer = (data.mcpServer as string) ?? "";
  const selectedTool = (data.toolName as string) ?? "";
  const toolArgs = (data.toolArgs as Record<string, string>) ?? {};
  const label = (data.label as string) ?? "MCP Tool";

  const serverConfig = selectedServer ? MCP_SERVERS[selectedServer as keyof typeof MCP_SERVERS] : null;
  const toolInfo = serverConfig?.tools.find((t) => t.id === selectedTool);

  // Determine input label and placeholder based on tool
  const getInputConfig = () => {
    if (selectedServer === "crypto") {
      if (selectedTool === "get_multiple_prices") {
        return { field: "symbols", label: "Symbols", placeholder: "BTC,ETH,SOL" };
      }
      return { field: "symbol", label: "Symbol", placeholder: "BTC" };
    }
    if (selectedServer === "time") {
      return { field: "timezone", label: "Timezone", placeholder: "America/New_York" };
    }
    if (selectedServer === "weather") {
      return { field: "location", label: "Location", placeholder: "New York, NY" };
    }
    return null;
  };

  const inputConfig = getInputConfig();

  return (
    <div className="space-y-4">
      {/* Show the tool name */}
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-sm font-medium text-white">{label}</div>
        {toolInfo && (
          <div className="text-xs text-white/40 mt-1">{toolInfo.description}</div>
        )}
      </div>

      {/* Input field for arguments */}
      {inputConfig && (
        <div>
          <Label className="text-white/80">{inputConfig.label}</Label>
          <Input
            value={toolArgs[inputConfig.field] ?? ""}
            onChange={(e) => onChange("toolArgs", { ...toolArgs, [inputConfig.field]: e.target.value })}
            placeholder={inputConfig.placeholder}
            className="mt-1"
          />
          <p className="text-xs text-white/40 mt-1">
            Use {"{{nodeId}}"} to reference output from a previous node
          </p>
        </div>
      )}

      <div className="bg-emerald-500/10 rounded-lg p-3 text-xs space-y-1">
        <p className="text-emerald-400 font-medium">Output:</p>
        <p className="text-white/60">
          The result is available as <code>response</code> for the next node.
        </p>
      </div>
    </div>
  );
}

// Twitter/X Configuration
function TwitterConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const [showCredentials, setShowCredentials] = useState(false);
  const action = (data.action as string) ?? "post";
  const hasCredentials = !!(data.apiKey && data.apiSecret && data.accessToken && data.accessTokenSecret);

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`rounded-lg p-3 text-sm ${hasCredentials ? "bg-green-500/10 border border-green-500/30" : "bg-yellow-500/10 border border-yellow-500/30"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${hasCredentials ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className={hasCredentials ? "text-green-400" : "text-yellow-400"}>
              {hasCredentials ? "Connected" : "Not Connected"}
            </span>
          </div>
          <button
            onClick={() => setShowCredentials(!showCredentials)}
            className="text-xs text-white/60 hover:text-white transition-colors"
          >
            {showCredentials ? "Hide" : "Configure"}
          </button>
        </div>
      </div>

      {/* Credentials Form */}
      {showCredentials && (
        <div className="space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-xs text-white/60 mb-2">
            Get these from{" "}
            <a
              href="https://developer.twitter.com/en/portal/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
            >
              Twitter Developer Portal →
            </a>
          </div>
          
          <div>
            <Label className="text-white/80 text-xs">API Key</Label>
            <Input
              type="password"
              value={(data.apiKey as string) ?? ""}
              onChange={(e) => onChange("apiKey", e.target.value)}
              placeholder="Enter API Key..."
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">API Secret</Label>
            <Input
              type="password"
              value={(data.apiSecret as string) ?? ""}
              onChange={(e) => onChange("apiSecret", e.target.value)}
              placeholder="Enter API Secret..."
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">Access Token</Label>
            <Input
              type="password"
              value={(data.accessToken as string) ?? ""}
              onChange={(e) => onChange("accessToken", e.target.value)}
              placeholder="Enter Access Token..."
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">Access Token Secret</Label>
            <Input
              type="password"
              value={(data.accessTokenSecret as string) ?? ""}
              onChange={(e) => onChange("accessTokenSecret", e.target.value)}
              placeholder="Enter Access Token Secret..."
              className="mt-1 text-xs"
            />
          </div>

          {hasCredentials && (
            <button
              onClick={() => {
                onChange("apiKey", "");
                onChange("apiSecret", "");
                onChange("accessToken", "");
                onChange("accessTokenSecret", "");
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear credentials
            </button>
          )}
        </div>
      )}

      <div>
        <Label className="text-white/80">Action</Label>
        <Select
          value={action}
          onValueChange={(v) => onChange("action", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="post">Post Tweet</SelectItem>
            <SelectItem value="reply">Reply to Tweet</SelectItem>
            <SelectItem value="like">Like Tweet</SelectItem>
            <SelectItem value="retweet">Retweet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(action === "post" || action === "reply") && (
        <div>
          <Label className="text-white/80">Tweet Text</Label>
          <Textarea
            value={(data.tweetText as string) ?? ""}
            onChange={(e) => onChange("tweetText", e.target.value)}
            placeholder="What's happening?"
            className="mt-1 min-h-[100px]"
            maxLength={280}
          />
          <p className="text-xs text-white/40 mt-1">
            {((data.tweetText as string) ?? "").length}/280 characters
          </p>
          <p className="text-xs text-white/40">
            Use {"{{nodeId}}"} to insert output from previous nodes
          </p>
        </div>
      )}

      {action === "reply" && (
        <div>
          <Label className="text-white/80">Reply to Tweet ID</Label>
          <Input
            value={(data.replyToTweetId as string) ?? ""}
            onChange={(e) => onChange("replyToTweetId", e.target.value)}
            placeholder="1234567890..."
            className="mt-1 font-mono text-xs"
          />
          <p className="text-xs text-white/40 mt-1">
            The ID of the tweet to reply to
          </p>
        </div>
      )}

      {(action === "like" || action === "retweet") && (
        <div>
          <Label className="text-white/80">Tweet ID</Label>
          <Input
            value={(data.targetTweetId as string) ?? ""}
            onChange={(e) => onChange("targetTweetId", e.target.value)}
            placeholder="1234567890..."
            className="mt-1 font-mono text-xs"
          />
          <p className="text-xs text-white/40 mt-1">
            The ID of the tweet to {action}
          </p>
        </div>
      )}

      <div className="bg-white/5 rounded-lg p-3 text-xs space-y-1">
        <p className="text-white/60 font-medium">Output:</p>
        <p className="text-white/40">• postId - The ID of the created tweet</p>
        <p className="text-white/40">• postUrl - URL to the tweet</p>
      </div>
    </div>
  );
}

// Telegram Configuration
function TelegramConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const hasCredentials = !!(data.botToken && data.chatId);

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`rounded-lg p-3 text-sm ${hasCredentials ? "bg-green-500/10 border border-green-500/30" : "bg-yellow-500/10 border border-yellow-500/30"}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${hasCredentials ? "bg-green-500" : "bg-yellow-500"}`} />
          <span className={hasCredentials ? "text-green-400" : "text-yellow-400"}>
            {hasCredentials ? "Configured" : "Not Configured"}
          </span>
        </div>
      </div>

      <div>
        <Label className="text-white/80">Bot Token</Label>
        <Input
          type="password"
          value={(data.botToken as string) ?? ""}
          onChange={(e) => onChange("botToken", e.target.value)}
          placeholder="123456:ABC-DEF1234..."
          className="mt-1 font-mono text-xs"
        />
        <p className="text-xs text-white/40 mt-1">
          Get this from @BotFather on Telegram
        </p>
      </div>

      <div>
        <Label className="text-white/80">Chat ID</Label>
        <Input
          value={(data.chatId as string) ?? ""}
          onChange={(e) => onChange("chatId", e.target.value)}
          placeholder="-1001234567890 or @channelname"
          className="mt-1 font-mono text-xs"
        />
        <p className="text-xs text-white/40 mt-1">
          Channel/group ID or @username
        </p>
      </div>

      <div>
        <Label className="text-white/80">Message (Optional)</Label>
        <Textarea
          value={(data.message as string) ?? ""}
          onChange={(e) => onChange("message", e.target.value)}
          placeholder="Custom message..."
          className="mt-1 min-h-[80px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Leave empty to use previous agent response
        </p>
      </div>

      <div className="bg-cyan-500/10 rounded-lg p-3 text-xs space-y-2">
        <p className="text-cyan-400 font-medium">How to get Bot Token:</p>
        <ol className="text-white/60 list-decimal list-inside space-y-1">
          <li>Message @BotFather on Telegram</li>
          <li>Send /newbot and follow prompts</li>
          <li>Copy the token provided</li>
        </ol>
        <p className="text-cyan-400 font-medium mt-3">How to get Chat ID:</p>
        <ol className="text-white/60 list-decimal list-inside space-y-1">
          <li>Add your bot to the channel/group</li>
          <li>Send a message in the chat</li>
          <li>Visit: api.telegram.org/bot[TOKEN]/getUpdates</li>
          <li>Find "chat":{"{"}"id": in the response</li>
        </ol>
      </div>
    </div>
  );
}

// Email Configuration
function EmailConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const [showCredentials, setShowCredentials] = useState(false);
  const toEmail = (data.toEmail as string) ?? "";
  const isValidEmail = toEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail);
  const hasSmtpConfig = !!(data.smtpHost && data.smtpPort && data.smtpPassword);

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`rounded-lg p-3 text-sm ${hasSmtpConfig ? "bg-green-500/10 border border-green-500/30" : "bg-yellow-500/10 border border-yellow-500/30"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${hasSmtpConfig ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className={hasSmtpConfig ? "text-green-400" : "text-yellow-400"}>
              {hasSmtpConfig ? "SMTP Configured" : "SMTP Not Configured"}
            </span>
          </div>
          <button
            onClick={() => setShowCredentials(!showCredentials)}
            className="text-xs text-white/60 hover:text-white transition-colors"
          >
            {showCredentials ? "Hide" : "Configure"}
          </button>
        </div>
      </div>

      {/* SMTP Credentials */}
      {showCredentials && (
        <div className="space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-xs text-white/60 mb-2">
            Use your own SMTP server (Gmail, SendGrid, Mailgun, etc.)
          </div>
          
          <div>
            <Label className="text-white/80 text-xs">SMTP Host</Label>
            <Input
              value={(data.smtpHost as string) ?? ""}
              onChange={(e) => onChange("smtpHost", e.target.value)}
              placeholder="smtp.gmail.com"
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">SMTP Port</Label>
            <Input
              type="number"
              value={(data.smtpPort as number) ?? 587}
              onChange={(e) => onChange("smtpPort", parseInt(e.target.value))}
              placeholder="587"
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">Username / Email</Label>
            <Input
              value={(data.smtpUser as string) ?? ""}
              onChange={(e) => onChange("smtpUser", e.target.value)}
              placeholder="you@gmail.com"
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">Password / App Password</Label>
            <Input
              type="password"
              value={(data.smtpPassword as string) ?? ""}
              onChange={(e) => onChange("smtpPassword", e.target.value)}
              placeholder="Enter password or app password..."
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">From Email</Label>
            <Input
              type="email"
              value={(data.fromEmail as string) ?? ""}
              onChange={(e) => onChange("fromEmail", e.target.value)}
              placeholder="you@gmail.com"
              className="mt-1 text-xs"
            />
          </div>

          {hasSmtpConfig && (
            <button
              onClick={() => {
                onChange("smtpHost", "");
                onChange("smtpPort", 587);
                onChange("smtpUser", "");
                onChange("smtpPassword", "");
                onChange("fromEmail", "");
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear SMTP config
            </button>
          )}

          <div className="bg-emerald-500/10 rounded-lg p-2 text-xs space-y-1 mt-2">
            <p className="text-emerald-400 font-medium">Gmail Setup:</p>
            <ol className="text-white/60 list-decimal list-inside space-y-0.5">
              <li>Enable 2FA on your Google account</li>
              <li>Go to Google Account → Security → App Passwords</li>
              <li>Create an app password for "Mail"</li>
              <li>Host: smtp.gmail.com, Port: 587</li>
            </ol>
          </div>
        </div>
      )}

      <div>
        <Label className="text-white/80">To Email</Label>
        <Input
          type="email"
          value={toEmail}
          onChange={(e) => onChange("toEmail", e.target.value)}
          placeholder="recipient@example.com"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-white/80">Subject</Label>
        <Input
          value={(data.subject as string) ?? ""}
          onChange={(e) => onChange("subject", e.target.value)}
          placeholder="Workflow Notification"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-white/80">Body (Optional)</Label>
        <Textarea
          value={(data.body as string) ?? ""}
          onChange={(e) => onChange("body", e.target.value)}
          placeholder="Email content..."
          className="mt-1 min-h-[80px]"
        />
        <p className="text-xs text-white/40 mt-1">
          Leave empty to use previous agent response
        </p>
      </div>
    </div>
  );
}

// App Query Configuration
function AppQueryConfig({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const [showAppPicker, setShowAppPicker] = useState(false);
  const appName = data.appName as string;
  const queryType = (data.queryType as string) ?? "stats";

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Select App</Label>
        {appName ? (
          <button
            onClick={() => setShowAppPicker(true)}
            className="mt-2 flex items-center gap-3 w-full p-3 rounded-lg border border-purple-500 bg-purple-500/10 text-left hover:bg-purple-500/20 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <AppWindow className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-white">{appName}</div>
              <div className="text-xs text-white/40">Click to change</div>
            </div>
          </button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setShowAppPicker(true)}
            className="mt-2 w-full border-dashed border-white/20 hover:border-purple-500 hover:bg-purple-500/5"
          >
            <Database className="w-4 h-4 mr-2" />
            Select one of your apps
          </Button>
        )}
        {!appName && (
          <p className="text-xs text-yellow-400 mt-2">
            ⚠️ You must select an app before running this workflow
          </p>
        )}
      </div>

      <AppPickerDialog
        open={showAppPicker}
        onOpenChange={setShowAppPicker}
        onSelect={(app) => {
          onChange("appId", app.id);
          onChange("appName", app.name);
        }}
      />

      <div>
        <Label className="text-white/80">Query Type</Label>
        <Select
          value={queryType}
          onValueChange={(v) => onChange("queryType", v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stats">Request Stats</SelectItem>
            <SelectItem value="users">App Users</SelectItem>
            <SelectItem value="requests">Recent Requests</SelectItem>
            <SelectItem value="top-visitors">Top Visitors</SelectItem>
            <SelectItem value="analytics">Analytics</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(queryType === "users" || queryType === "requests" || queryType === "top-visitors") && (
        <div>
          <Label className="text-white/80">Limit</Label>
          <Input
            type="number"
            min="1"
            max="100"
            value={(data.limit as number) ?? 50}
            onChange={(e) => onChange("limit", parseInt(e.target.value))}
            className="mt-1"
          />
        </div>
      )}

      {queryType === "analytics" && (
        <div>
          <Label className="text-white/80">Period Type</Label>
          <Select
            value={(data.periodType as string) ?? "daily"}
            onValueChange={(v) => onChange("periodType", v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="bg-purple-500/10 rounded-lg p-3 text-xs space-y-1">
        <p className="text-purple-400 font-medium">Output:</p>
        <p className="text-white/60">
          Query results are available as <code>response</code> for use by Agent or other nodes.
        </p>
        <p className="text-white/40 mt-2">
          Example: Use an Agent node after this to summarize or analyze the data.
        </p>
      </div>
    </div>
  );
}
