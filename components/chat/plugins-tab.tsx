"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Puzzle,
  Clock,
  Cloud,
  Coins,
  Check,
  X,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Zap,
  Search,
  Info,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";

// Types for MCP configuration
interface McpServerConfig {
  type: "http" | "sse" | "streamable-http";
  url: string;
}

interface McpSettings {
  servers: Record<string, McpServerConfig>;
}

interface McpRegistryEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoint: string;
  fullEndpoint: string;
  type: "http" | "sse" | "streamable-http";
  version: string;
  status: "live" | "coming_soon" | "maintenance";
  icon: string;
  color: string;
  toolCount: number;
  features: string[];
  pricing: {
    type: "free" | "credits" | "x402";
    description: string;
    pricePerRequest?: string;
  };
  x402Enabled: boolean;
  documentation?: string;
  configTemplate: {
    servers: Record<string, McpServerConfig>;
  };
}

interface PluginsTabProps {
  character: ElizaCharacter;
  onChange: (updates: Partial<ElizaCharacter>) => void;
  onSave?: () => Promise<void>;
}

/**
 * Type guard to check if a value is a valid McpSettings object
 */
function isMcpSettings(value: unknown): value is McpSettings {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.servers !== "object" || obj.servers === null) return false;
  return true;
}

const iconMap: Record<string, typeof Puzzle> = {
  puzzle: Puzzle,
  clock: Clock,
  cloud: Cloud,
  coins: Coins,
};

export function PluginsTab({ character, onChange }: PluginsTabProps) {
  const [registry, setRegistry] = useState<McpRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<McpRegistryEntry | null>(null);

  // Extract current MCP settings from character
  const getCurrentMcpSettings = useCallback((): McpSettings => {
    const settings = character.settings || {};
    const mcpSetting = settings.mcp;

    if (typeof mcpSetting === "string") {
      try {
        const parsed: unknown = JSON.parse(mcpSetting);
        if (isMcpSettings(parsed)) {
          return parsed;
        }
        return { servers: {} };
      } catch {
        return { servers: {} };
      }
    }

    if (isMcpSettings(mcpSetting)) {
      return mcpSetting;
    }

    return { servers: {} };
  }, [character.settings]);

  const mcpSettings = getCurrentMcpSettings();
  const enabledServers = Object.keys(mcpSettings.servers || {});

  // Load registry on mount
  useEffect(() => {
    fetchRegistry();
  }, []);

  const fetchRegistry = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/mcp/registry");
      if (!response.ok) throw new Error("Failed to fetch registry");

      const data = await response.json();
      setRegistry(data.registry || []);
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error fetching registry:", error);
      toast.error("Failed to load MCP registry");
    } finally {
      setIsLoading(false);
    }
  };

  // Check if an MCP is enabled
  const isMcpEnabled = (mcpId: string): boolean => {
    return enabledServers.includes(mcpId);
  };

  // Enable an MCP
  const enableMcp = (mcp: McpRegistryEntry) => {
    const currentSettings = getCurrentMcpSettings();

    // Store pathnames directly - don't inject baseUrl at config time
    // The runtime will append the correct baseUrl when the agent runs
    const newServers = {
      ...currentSettings.servers,
      ...mcp.configTemplate.servers,
    };

    const newMcpSettings: McpSettings = {
      ...currentSettings,
      servers: newServers,
    };

    // Update character settings with new MCP config
    const newSettings = {
      ...character.settings,
      mcp: newMcpSettings,
    };

    // Also ensure plugin-mcp is in the plugins list
    const currentPlugins = character.plugins || [];
    const newPlugins = currentPlugins.includes("@elizaos/plugin-mcp")
      ? currentPlugins
      : [...currentPlugins, "@elizaos/plugin-mcp"];

    onChange({
      settings: newSettings,
      plugins: newPlugins,
    });

    toast.success(`${mcp.name} enabled! Save your character to apply changes.`);
  };

  // Disable an MCP
  const disableMcp = (mcpId: string) => {
    const currentSettings = getCurrentMcpSettings();
    const newServers = { ...currentSettings.servers };
    delete newServers[mcpId];

    const newMcpSettings: McpSettings = {
      ...currentSettings,
      servers: newServers,
    };

    // Update character settings
    const newSettings = {
      ...character.settings,
      mcp: newMcpSettings,
    };

    // Remove plugin-mcp from plugins if no servers left
    let newPlugins = character.plugins || [];
    if (Object.keys(newServers).length === 0) {
      newPlugins = newPlugins.filter((p) => p !== "@elizaos/plugin-mcp");
    }

    onChange({
      settings: newSettings,
      plugins: newPlugins,
    });

    toast.success("MCP disabled! Save your character to apply changes.");
  };

  // Filter registry based on search and category
  const filteredRegistry = registry.filter((mcp) => {
    const matchesSearch =
      searchQuery === "" ||
      mcp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mcp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mcp.features.some((f) =>
        f.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    const matchesCategory =
      categoryFilter === "all" || mcp.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Separate enabled and available MCPs
  const enabledMcps = filteredRegistry.filter((mcp) => isMcpEnabled(mcp.id));
  const availableMcps = filteredRegistry.filter((mcp) => !isMcpEnabled(mcp.id));

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col relative">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FF5800]/20 border border-[#FF5800]/30">
              <Puzzle className="h-5 w-5 text-[#FF5800]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Plugins & MCPs
              </h3>
              <p className="text-sm text-white/60">
                Enable external tools and capabilities for your agent
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRegistry}
            className="border-white/20 bg-transparent text-white/70 hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              placeholder="Search MCPs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#FF5800]/50"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "px-3 py-1.5 text-xs border rounded-lg transition-colors",
                categoryFilter === "all"
                  ? "bg-[#FF5800]/20 border-[#FF5800]/50 text-white"
                  : "bg-black/40 border-white/10 text-white/60 hover:border-white/30",
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "px-3 py-1.5 text-xs border rounded-lg transition-colors capitalize",
                  categoryFilter === cat
                    ? "bg-[#FF5800]/20 border-[#FF5800]/50 text-white"
                    : "bg-black/40 border-white/10 text-white/60 hover:border-white/30",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">
          {/* Enabled MCPs Section */}
          {enabledMcps.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Check className="h-4 w-4 text-green-400" />
                <h4 className="text-sm font-medium text-white/80 uppercase tracking-wider">
                  Enabled ({enabledMcps.length})
                </h4>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {enabledMcps.map((mcp) => (
                  <McpCard
                    key={mcp.id}
                    mcp={mcp}
                    isEnabled={true}
                    onToggle={() => disableMcp(mcp.id)}
                    onSelect={() => setSelectedMcp(mcp)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Available MCPs Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Plus className="h-4 w-4 text-white/60" />
              <h4 className="text-sm font-medium text-white/80 uppercase tracking-wider">
                Available ({availableMcps.length})
              </h4>
            </div>
            {availableMcps.length === 0 ? (
              <div className="text-center py-12">
                <Puzzle className="h-12 w-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/60">No MCPs match your search</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {availableMcps.map((mcp) => (
                  <McpCard
                    key={mcp.id}
                    mcp={mcp}
                    isEnabled={false}
                    onToggle={() => enableMcp(mcp)}
                    onSelect={() => setSelectedMcp(mcp)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedMcp && (
          <McpDetailPanel
            mcp={selectedMcp}
            isEnabled={isMcpEnabled(selectedMcp.id)}
            onToggle={() =>
              isMcpEnabled(selectedMcp.id)
                ? disableMcp(selectedMcp.id)
                : enableMcp(selectedMcp)
            }
            onClose={() => setSelectedMcp(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// MCP Card Component
interface McpCardProps {
  mcp: McpRegistryEntry;
  isEnabled: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

function McpCard({ mcp, isEnabled, onToggle, onSelect }: McpCardProps) {
  const Icon = iconMap[mcp.icon] || Puzzle;
  const isDisabled = mcp.status !== "live";

  return (
    <BrandCard
      hover={!isDisabled}
      className={cn(
        "cursor-pointer transition-all duration-300 group relative",
        isEnabled && "border-green-500/30 bg-green-500/5",
        isDisabled && "opacity-60 cursor-not-allowed",
      )}
      onClick={onSelect}
    >
      <CornerBrackets
        size="sm"
        color={isEnabled ? "#22C55E" : mcp.color}
        hoverColor="#FF5800"
        hoverScale={!isDisabled}
        className="opacity-30 group-hover:opacity-100 transition-opacity"
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg border"
              style={{
                backgroundColor: `${mcp.color}15`,
                borderColor: `${mcp.color}40`,
              }}
            >
              <Icon className="h-4 w-4" style={{ color: mcp.color }} />
            </div>
            <div>
              <h3 className="text-base font-medium text-white flex items-center gap-2">
                {mcp.name}
                {mcp.x402Enabled && (
                  <span className="px-1.5 py-0.5 text-[9px] bg-purple-500/20 border border-purple-500/40 text-purple-400 rounded">
                    x402
                  </span>
                )}
              </h3>
              <p className="text-xs text-white/50">
                v{mcp.version} • {mcp.toolCount} tools
              </p>
            </div>
          </div>

          {/* Status / Toggle */}
          <div className="flex items-center gap-2">
            {mcp.status !== "live" && (
              <span className="px-2 py-0.5 text-[10px] bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded">
                {mcp.status.replace("_", " ")}
              </span>
            )}
            {!isDisabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  isEnabled
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-green-500/20 text-green-400 hover:bg-green-500/30",
                )}
                title={isEnabled ? "Disable MCP" : "Enable MCP"}
              >
                {isEnabled ? (
                  <Trash2 className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-white/60 mb-3 line-clamp-2">
          {mcp.description}
        </p>

        {/* Features */}
        <div className="flex flex-wrap gap-1.5">
          {mcp.features.slice(0, 3).map((feature) => (
            <span
              key={feature}
              className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/60 rounded"
            >
              {feature}
            </span>
          ))}
          {mcp.features.length > 3 && (
            <span className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/40 rounded">
              +{mcp.features.length - 3} more
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            {mcp.pricing.type === "x402" && (
              <Zap className="h-3.5 w-3.5 text-purple-400" />
            )}
            <span className="text-xs text-white/50">
              {mcp.pricing.description}
            </span>
          </div>
          {isEnabled && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="h-3 w-3" />
              Enabled
            </span>
          )}
        </div>
      </div>
    </BrandCard>
  );
}

// MCP Detail Panel Component
interface McpDetailPanelProps {
  mcp: McpRegistryEntry;
  isEnabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function McpDetailPanel({
  mcp,
  isEnabled,
  onToggle,
  onClose,
}: McpDetailPanelProps) {
  const Icon = iconMap[mcp.icon] || Puzzle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-x-0 bottom-0 z-50 bg-[#0A0A0A] border-t border-white/10 shadow-2xl max-h-[60%] overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: `${mcp.color}15`,
              borderColor: `${mcp.color}40`,
            }}
          >
            <Icon className="h-6 w-6" style={{ color: mcp.color }} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              {mcp.name}
              {mcp.x402Enabled && (
                <span className="px-2 py-0.5 text-xs bg-purple-500/20 border border-purple-500/40 text-purple-400 rounded">
                  x402
                </span>
              )}
            </h2>
            <p className="text-sm text-white/60 mt-1">{mcp.description}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="h-5 w-5 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Endpoint Info */}
          <div className="space-y-2">
            <label className="text-xs text-white/50 uppercase tracking-wider flex items-center gap-1">
              <Info className="h-3 w-3" />
              MCP Endpoint
            </label>
            <div className="bg-black/60 border border-white/10 p-3 font-mono text-sm text-white/80 rounded-lg overflow-x-auto">
              {mcp.fullEndpoint}
            </div>
          </div>

          {/* Configuration Preview */}
          <div className="space-y-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">
              Configuration
            </label>
            <div className="bg-black/60 border border-white/10 p-3 font-mono text-xs text-white/70 rounded-lg overflow-x-auto">
              <pre>{JSON.stringify(mcp.configTemplate, null, 2)}</pre>
            </div>
          </div>
        </div>

        {/* Tools */}
        <div className="mt-6 space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">
            Available Tools ({mcp.toolCount})
          </label>
          <div className="flex flex-wrap gap-2">
            {mcp.features.map((feature) => (
              <span
                key={feature}
                className="px-3 py-1.5 text-xs border text-white/70 rounded-lg"
                style={{
                  backgroundColor: `${mcp.color}10`,
                  borderColor: `${mcp.color}30`,
                }}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        {/* x402 Info */}
        {mcp.x402Enabled && (
          <div className="mt-6 bg-purple-500/10 border border-purple-500/30 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">
                x402 Micropayments Enabled
              </span>
            </div>
            <p className="text-xs text-white/60">
              This MCP server supports accountless micropayments via the x402
              protocol. Pay only for what you use
              {mcp.pricing.pricePerRequest &&
                ` with $${mcp.pricing.pricePerRequest} per request`}
              . Powered by Coinbase CDP.
            </p>
          </div>
        )}
      </ScrollArea>

      {/* Actions */}
      <div className="flex items-center justify-between p-6 border-t border-white/10">
        <div className="flex items-center gap-3">
          {mcp.documentation && (
            <a
              href={mcp.documentation}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 hover:border-white/30 hover:text-white transition-colors rounded-lg text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              Documentation
            </a>
          )}
        </div>
        <Button
          onClick={onToggle}
          disabled={mcp.status !== "live"}
          className={cn(
            "px-6 rounded-lg",
            isEnabled
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              : "bg-[#FF5800] text-white hover:bg-[#FF5800]/90",
          )}
        >
          {isEnabled ? (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Disable MCP
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Enable MCP
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
