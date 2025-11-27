"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Puzzle,
  Clock,
  Cloud,
  Coins,
  ExternalLink,
  Copy,
  Check,
  Zap,
  ChevronRight,
  Play,
  Terminal,
  X,
} from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MCPServer {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  version: string;
  category: string;
  status: "live" | "coming_soon" | "maintenance";
  pricing: {
    type: "free" | "credits" | "x402";
    description: string;
    pricePerRequest?: string;
  };
  x402Enabled: boolean;
  toolCount: number;
  icon: string;
  color: string;
  features: string[];
}

interface MCPsPageClientProps {
  servers: MCPServer[];
}

const iconMap: Record<string, typeof Puzzle> = {
  puzzle: Puzzle,
  clock: Clock,
  cloud: Cloud,
  coins: Coins,
};

export function MCPsPageClient({ servers }: MCPsPageClientProps) {
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const categories = ["all", ...new Set(servers.map((s) => s.category))];

  const filteredServers =
    filter === "all" ? servers : servers.filter((s) => s.category === filter);

  const copyEndpoint = async (endpoint: string, serverId: string) => {
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const fullUrl = `${baseUrl}${endpoint}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedEndpoint(serverId);
      toast.success("Endpoint URL copied to clipboard");
      setTimeout(() => setCopiedEndpoint(null), 2000);
    } catch {
      toast.error("Failed to copy endpoint");
    }
  };

  const testMcpServer = async (server: MCPServer) => {
    setTestingServer(server.id);
    setTestResult(null);

    try {
      const response = await fetch(server.endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult(JSON.stringify(data, null, 2));
        toast.success(`${server.name} is responding`);
      } else {
        setTestResult(`Error: ${response.status} ${response.statusText}`);
        toast.error(`Server returned ${response.status}`);
      }
    } catch (error) {
      setTestResult(
        `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      toast.error("Failed to connect to server");
    } finally {
      setTestingServer(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={cn(
              "px-4 py-2 text-sm border transition-all duration-200",
              filter === category
                ? "bg-[#FF5800]/20 border-[#FF5800]/50 text-white"
                : "bg-black/40 border-white/10 text-white/60 hover:border-white/30 hover:text-white"
            )}
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {/* Server Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {filteredServers.map((server, index) => {
            const Icon = iconMap[server.icon] || Puzzle;
            return (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <BrandCard
                  hover
                  className={cn(
                    "cursor-pointer transition-all duration-300 group",
                    selectedServer?.id === server.id &&
                      "border-[#FF5800]/50 shadow-lg shadow-[#FF5800]/10"
                  )}
                  onClick={() =>
                    setSelectedServer(
                      selectedServer?.id === server.id ? null : server
                    )
                  }
                >
                  <CornerBrackets
                    size="sm"
                    color={server.color}
                    hoverColor="#FF5800"
                    hoverScale
                    className="opacity-30 group-hover:opacity-100 transition-opacity"
                  />

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="p-2.5 rounded-none border"
                          style={{
                            backgroundColor: `${server.color}15`,
                            borderColor: `${server.color}40`,
                          }}
                        >
                          <Icon
                            className="h-5 w-5"
                            style={{ color: server.color }}
                          />
                        </div>
                        <div>
                          <h3
                            className="text-lg font-medium text-white flex items-center gap-2"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {server.name}
                            {server.x402Enabled && (
                              <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-400">
                                x402
                              </span>
                            )}
                          </h3>
                          <p
                            className="text-xs text-white/50"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            v{server.version} • {server.toolCount} tools
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full",
                            server.status === "live"
                              ? "bg-green-400"
                              : server.status === "coming_soon"
                                ? "bg-yellow-400"
                                : "bg-red-400"
                          )}
                        />
                        <span
                          className="text-xs text-white/50 uppercase"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          {server.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-white/60 mb-4 line-clamp-2">
                      {server.description}
                    </p>

                    {/* Features */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {server.features.slice(0, 3).map((feature) => (
                        <span
                          key={feature}
                          className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/60"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          {feature}
                        </span>
                      ))}
                      {server.features.length > 3 && (
                        <span
                          className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/40"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          +{server.features.length - 3} more
                        </span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        {server.pricing.type === "x402" && (
                          <Zap className="h-3.5 w-3.5 text-purple-400" />
                        )}
                        <span
                          className="text-xs text-white/50"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          {server.pricing.description}
                        </span>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-white/30 transition-transform group-hover:text-white/60",
                          selectedServer?.id === server.id && "rotate-90"
                        )}
                      />
                    </div>
                  </div>
                </BrandCard>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Server Detail Panel */}
      <AnimatePresence>
        {selectedServer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <BrandCard className="relative shadow-lg shadow-black/50">
              <CornerBrackets
                size="md"
                color={selectedServer.color}
                className="opacity-50"
              />

              <div className="relative z-10 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="p-3 rounded-none border"
                      style={{
                        backgroundColor: `${selectedServer.color}15`,
                        borderColor: `${selectedServer.color}40`,
                      }}
                    >
                      {(() => {
                        const Icon = iconMap[selectedServer.icon] || Puzzle;
                        return (
                          <Icon
                            className="h-6 w-6"
                            style={{ color: selectedServer.color }}
                          />
                        );
                      })()}
                    </div>
                    <div>
                      <h2
                        className="text-2xl font-normal text-white"
                        style={{ fontFamily: "var(--font-roboto-mono)" }}
                      >
                        {selectedServer.name}
                      </h2>
                      <p className="text-sm text-white/60 mt-1">
                        {selectedServer.description}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedServer(null)}
                    className="p-2 hover:bg-white/10 transition-colors"
                  >
                    <X className="h-5 w-5 text-white/60" />
                  </button>
                </div>

                {/* Connection Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Endpoint */}
                  <div className="space-y-2">
                    <label
                      className="text-xs text-white/50 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      MCP Endpoint URL
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/60 border border-white/10 p-3 font-mono text-sm text-white/80 overflow-x-auto">
                        {typeof window !== "undefined"
                          ? window.location.origin
                          : ""}
                        {selectedServer.endpoint}
                      </div>
                      <button
                        onClick={() =>
                          copyEndpoint(
                            selectedServer.endpoint,
                            selectedServer.id
                          )
                        }
                        className="p-3 bg-black/60 border border-white/10 hover:border-[#FF5800]/50 transition-colors"
                      >
                        {copiedEndpoint === selectedServer.id ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-white/60" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Connection Config */}
                  <div className="space-y-2">
                    <label
                      className="text-xs text-white/50 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Claude Desktop Config
                    </label>
                    <div className="bg-black/60 border border-white/10 p-3 font-mono text-xs text-white/70 overflow-x-auto">
                      <pre>
                        {JSON.stringify(
                          {
                            mcpServers: {
                              [selectedServer.id]: {
                                command: "npx",
                                args: [
                                  "-y",
                                  "@anthropic/mcp-client",
                                  `${typeof window !== "undefined" ? window.location.origin : ""}${selectedServer.endpoint}`,
                                ],
                              },
                            },
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Actions & Test */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => testMcpServer(selectedServer)}
                    disabled={testingServer === selectedServer.id}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FF5800]/20 border border-[#FF5800]/50 text-[#FF5800] hover:bg-[#FF5800]/30 transition-colors disabled:opacity-50"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                  >
                    {testingServer === selectedServer.id ? (
                      <span className="h-4 w-4 border-2 border-[#FF5800]/30 border-t-[#FF5800] rounded-full animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Test Connection
                  </button>

                  <a
                    href={`${selectedServer.endpoint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 hover:border-white/30 hover:text-white transition-colors"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Endpoint
                  </a>

                  <button
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/70 hover:border-white/30 hover:text-white transition-colors"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                    onClick={() =>
                      window.open(
                        "https://docs.modelcontextprotocol.io",
                        "_blank"
                      )
                    }
                  >
                    <Terminal className="h-4 w-4" />
                    MCP Docs
                  </button>
                </div>

                {/* Test Result */}
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <label
                      className="text-xs text-white/50 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Server Response
                    </label>
                    <div className="bg-black/60 border border-white/10 p-4 font-mono text-xs text-green-400/80 overflow-x-auto max-h-48 overflow-y-auto">
                      <pre>{testResult}</pre>
                    </div>
                  </motion.div>
                )}

                {/* Features List */}
                <div className="space-y-2">
                  <label
                    className="text-xs text-white/50 uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                  >
                    Available Tools ({selectedServer.toolCount})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedServer.features.map((feature) => (
                      <span
                        key={feature}
                        className="px-3 py-1.5 text-xs border text-white/70"
                        style={{
                          backgroundColor: `${selectedServer.color}10`,
                          borderColor: `${selectedServer.color}30`,
                          fontFamily: "var(--font-roboto-mono)",
                        }}
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                {/* x402 Info */}
                {selectedServer.x402Enabled && (
                  <div className="bg-purple-500/10 border border-purple-500/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-purple-400" />
                      <span
                        className="text-sm font-medium text-purple-300"
                        style={{ fontFamily: "var(--font-roboto-mono)" }}
                      >
                        x402 Micropayments Enabled
                      </span>
                    </div>
                    <p className="text-xs text-white/60">
                      This MCP server supports accountless micropayments via the
                      x402 protocol. Pay only for what you use with{" "}
                      {selectedServer.pricing.pricePerRequest &&
                        `$${selectedServer.pricing.pricePerRequest}`}{" "}
                      per request. Powered by Coinbase CDP.
                    </p>
                  </div>
                )}
              </div>
            </BrandCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

