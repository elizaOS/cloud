"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Bot,
  ImageIcon,
  Clock,
  Globe,
  GitBranch,
  Volume2,
  MessageCircle,
  Puzzle,
  Search,
  Twitter,
  Send,
  Mail,
  Database,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowNodeType } from "@/db/schemas";
import { cn } from "@/lib/utils";

interface AddModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNode: (type: WorkflowNodeType, initialData?: Record<string, unknown>) => void;
}

type NodeCategory = "ai" | "integrations" | "logic" | "mcps";

interface NodeDefinition {
  type: WorkflowNodeType;
  label: string;
  icon: LucideIcon;
  color: string;
  description: string;
  category: NodeCategory;
  mcpConfig?: { server: string; tool: string };
}

const nodeDefinitions: NodeDefinition[] = [
  {
    type: "agent",
    label: "AI Agent",
    icon: Bot,
    color: "blue",
    description: "Process data with AI models like GPT-4 or Claude",
    category: "ai",
  },
  {
    type: "image",
    label: "Image Generation",
    icon: ImageIcon,
    color: "purple",
    description: "Generate images using FLUX or other AI models",
    category: "ai",
  },
  {
    type: "tts",
    label: "Text to Speech",
    icon: Volume2,
    color: "violet",
    description: "Convert text to speech using ElevenLabs",
    category: "ai",
  },
  {
    type: "http",
    label: "HTTP Request",
    icon: Globe,
    color: "cyan",
    description: "Make API calls to external services",
    category: "integrations",
  },
  {
    type: "discord",
    label: "Discord",
    icon: MessageCircle,
    color: "indigo",
    description: "Send messages to Discord channels",
    category: "integrations",
  },
  {
    type: "twitter",
    label: "Twitter/X",
    icon: Twitter,
    color: "sky",
    description: "Post tweets, reply, like, and retweet on Twitter/X",
    category: "integrations",
  },
  {
    type: "telegram",
    label: "Telegram",
    icon: Send,
    color: "cyan",
    description: "Send messages to Telegram channels or groups via bot",
    category: "integrations",
  },
  {
    type: "email",
    label: "Email",
    icon: Mail,
    color: "emerald",
    description: "Send emails to any address",
    category: "integrations",
  },
  {
    type: "app-query",
    label: "App Query",
    icon: Database,
    color: "purple",
    description: "Query your app data: users, stats, requests, analytics",
    category: "integrations",
  },
  {
    type: "condition",
    label: "Condition",
    icon: GitBranch,
    color: "pink",
    description: "Branch workflow based on conditions",
    category: "logic",
  },
  {
    type: "delay",
    label: "Delay",
    icon: Clock,
    color: "amber",
    description: "Pause workflow execution for a set time",
    category: "logic",
  },
  // MCP Tools - Crypto
  {
    type: "mcp",
    label: "Get Crypto Price",
    icon: Puzzle,
    color: "emerald",
    description: "Get current price for a cryptocurrency",
    category: "mcps",
    mcpConfig: { server: "crypto", tool: "get_crypto_price" },
  },
  {
    type: "mcp",
    label: "Get Multiple Crypto Prices",
    icon: Puzzle,
    color: "emerald",
    description: "Get prices for multiple cryptocurrencies",
    category: "mcps",
    mcpConfig: { server: "crypto", tool: "get_multiple_prices" },
  },
  {
    type: "mcp",
    label: "Get Crypto Price Change",
    icon: Puzzle,
    color: "emerald",
    description: "Get 24h price change for a crypto",
    category: "mcps",
    mcpConfig: { server: "crypto", tool: "get_price_change" },
  },
  // MCP Tools - Time
  {
    type: "mcp",
    label: "Get Current Time",
    icon: Puzzle,
    color: "teal",
    description: "Get current time in any timezone",
    category: "mcps",
    mcpConfig: { server: "time", tool: "get_current_time" },
  },
  {
    type: "mcp",
    label: "Get Timezone Info",
    icon: Puzzle,
    color: "teal",
    description: "Get details about a timezone",
    category: "mcps",
    mcpConfig: { server: "time", tool: "get_timezone_info" },
  },
  // MCP Tools - Weather
  {
    type: "mcp",
    label: "Get Weather",
    icon: Puzzle,
    color: "sky",
    description: "Get current weather for a location",
    category: "mcps",
    mcpConfig: { server: "weather", tool: "get_current_weather" },
  },
  {
    type: "mcp",
    label: "Get Forecast",
    icon: Puzzle,
    color: "sky",
    description: "Get weather forecast for a location",
    category: "mcps",
    mcpConfig: { server: "weather", tool: "get_forecast" },
  },
];

const categories: { id: NodeCategory; label: string }[] = [
  { id: "ai", label: "AI & Generation" },
  { id: "integrations", label: "Integrations" },
  { id: "mcps", label: "MCPs" },
  { id: "logic", label: "Logic & Flow" },
];

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
  pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400" },
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400" },
  sky: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-400" },
};

export function AddModuleDialog({ open, onOpenChange, onAddNode }: AddModuleDialogProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<NodeCategory | "all">("all");

  const filteredNodes = useMemo(() => {
    return nodeDefinitions.filter((node) => {
      const matchesSearch =
        search === "" ||
        node.label.toLowerCase().includes(search.toLowerCase()) ||
        node.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "all" || node.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const handleSelect = (node: NodeDefinition) => {
    const initialData: Record<string, unknown> = { label: node.label };
    if (node.mcpConfig) {
      initialData.mcpServer = node.mcpConfig.server;
      initialData.toolName = node.mcpConfig.tool;
      initialData.toolArgs = {};
    }
    onAddNode(node.type, initialData);
    onOpenChange(false);
    setSearch("");
    setActiveCategory("all");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-neutral-950 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Module</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules..."
            className="pl-10 bg-white/5 border-white/10"
            autoFocus
          />
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              activeCategory === "all"
                ? "bg-[#FF5800] text-black font-medium"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                activeCategory === cat.id
                  ? "bg-[#FF5800] text-black font-medium"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Node grid */}
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="grid grid-cols-2 gap-3">
            {filteredNodes.map((node, index) => {
              const colors = colorClasses[node.color];
              const uniqueKey = node.mcpConfig
                ? `${node.type}-${node.mcpConfig.server}-${node.mcpConfig.tool}`
                : node.type;
              return (
                <button
                  key={uniqueKey}
                  onClick={() => handleSelect(node)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border text-left transition-all",
                    "hover:scale-[1.02] hover:shadow-lg",
                    colors.bg,
                    colors.border
                  )}
                >
                  <div className={cn("p-2 rounded-lg", colors.bg, colors.border)}>
                    <node.icon className={cn("w-5 h-5", colors.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white">{node.label}</div>
                    <div className="text-xs text-white/50 mt-0.5 line-clamp-2">
                      {node.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {filteredNodes.length === 0 && (
            <div className="text-center py-12 text-white/40">
              No modules found matching "{search}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
