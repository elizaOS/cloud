"use client";

import { useState, useEffect } from "react";
import { X, Bot, Loader2 } from "lucide-react";
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

interface NodeConfigPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  workflowId?: string;
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
  workflowId,
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
      default:
        return <div className="text-white/60">Unknown node type: {node.type}</div>;
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
            <Label className="text-white/80">Cron Expression</Label>
            <Input
              value={(data.schedule as string) ?? ""}
              onChange={(e) => onChange("schedule", e.target.value)}
              placeholder="*/5 * * * *"
              className="mt-1"
            />
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-xs space-y-1">
            <div className="text-white/60 font-medium">Examples:</div>
            <div className="text-white/40">• <code>*/5 * * * *</code> = every 5 minutes</div>
            <div className="text-white/40">• <code>0 * * * *</code> = every hour</div>
            <div className="text-white/40">• <code>0 9 * * *</code> = daily at 9 AM</div>
            <div className="text-white/40">• <code>0 0 * * 1</code> = every Monday</div>
          </div>
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
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const mode = (data.mode as string) ?? "generic";
  const agentName = data.agentName as string;
  const agentAvatarUrl = data.agentAvatarUrl as string | undefined;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-white/80">Mode</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            onChange("mode", v);
            if (v === "my-agent") {
              setShowAgentPicker(true);
            } else {
              onChange("agentId", "");
              onChange("agentName", "");
              onChange("agentAvatarUrl", "");
            }
          }}
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

      {mode === "my-agent" && (
        <div>
          <Label className="text-white/80">Selected Agent</Label>
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
              className="mt-2 w-full"
            >
              <Bot className="w-4 h-4 mr-2" />
              Select Agent
            </Button>
          )}
        </div>
      )}

      <AgentPickerDialog
        open={showAgentPicker}
        onOpenChange={setShowAgentPicker}
        onSelect={(agent) => {
          onChange("agentId", agent.id);
          onChange("agentName", agent.name);
          onChange("agentAvatarUrl", agent.avatarUrl ?? "");
        }}
      />

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

      {mode === "generic" && (
        <div>
          <Label className="text-white/80">Model</Label>
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
      )}
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
        <Label className="text-white/80">Channel ID (Optional)</Label>
        <Input
          value={(data.channelId as string) ?? ""}
          onChange={(e) => onChange("channelId", e.target.value)}
          placeholder="Leave empty for default channel"
          className="mt-1"
        />
        <p className="text-xs text-white/40 mt-1">
          Leave empty to use default webhook channel
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

      <div className="bg-indigo-500/10 rounded-lg p-3 text-xs space-y-1">
        <p className="text-indigo-400 font-medium">Auto-compose includes:</p>
        <p className="text-white/60">• Agent responses</p>
        <p className="text-white/60">• Generated image URLs</p>
        <p className="text-white/60">• Workflow completion status</p>
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
