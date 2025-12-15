/**
 * Services Marketplace component with filtering and protocol support.
 * Displays services from demo, user, and public sources.
 * Supports MCP, A2A, and REST protocol filtering.
 */

"use client";

import { useState, useMemo } from "react";
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
  User,
  Globe,
  Sparkles,
} from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface MarketplaceService {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  version: string;
  category: string;
  status: "live" | "draft" | "coming_soon";
  source: "demo" | "user" | "public";
  protocols: ("mcp" | "a2a" | "rest")[];
  pricing: {
    type: "free" | "credits" | "x402";
    description: string;
    pricePerRequest?: number;
  };
  x402Enabled: boolean;
  toolCount: number;
  icon: string;
  color: string;
  features: string[];
  creator?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
}

interface ServicesMarketplaceProps {
  services: MarketplaceService[];
  userOrganizationId: string;
}

const iconMap: Record<string, typeof Puzzle> = {
  puzzle: Puzzle,
  clock: Clock,
  cloud: Cloud,
  coins: Coins,
};

const protocolLabels: Record<string, { label: string; color: string }> = {
  mcp: { label: "MCP", color: "#06B6D4" },
  a2a: { label: "A2A", color: "#3B82F6" },
  rest: { label: "REST", color: "#22C55E" },
};

const sourceLabels: Record<string, { label: string; icon: typeof Globe }> = {
  demo: { label: "Demo", icon: Sparkles },
  user: { label: "My Services", icon: User },
  public: { label: "Public", icon: Globe },
};

export function ServicesMarketplace({
  services,
  userOrganizationId,
}: ServicesMarketplaceProps) {
  const [selectedService, setSelectedService] =
    useState<MarketplaceService | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Get unique values for filters
  const categories = useMemo(
    () => ["all", ...new Set(services.map((s) => s.category))],
    [services],
  );

  const protocols = ["all", "mcp", "a2a", "rest"];
  const sources = ["all", "demo", "user", "public"];

  const filteredServices = services.filter((s) => {
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (
      protocolFilter !== "all" &&
      !s.protocols.includes(protocolFilter as "mcp" | "a2a" | "rest")
    )
      return false;
    if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
    return true;
  });

  const copyEndpoint = async (endpoint: string, serviceId: string) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const fullUrl = endpoint.startsWith("http")
      ? endpoint
      : `${baseUrl}${endpoint}`;

    await navigator.clipboard.writeText(fullUrl);
    setCopiedEndpoint(serviceId);
    toast.success("Endpoint URL copied to clipboard");
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const testService = async (service: MarketplaceService) => {
    setTestingService(service.id);
    setTestResult(null);

    const response = await fetch(service.endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));
      toast.success(`${service.name} is responding`);
    } else {
      setTestResult(`Error: ${response.status} ${response.statusText}`);
      toast.error(`Service returned ${response.status}`);
    }
    setTestingService(null);
  };

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Protocol Filter */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-white/50 uppercase tracking-wider"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            Protocol:
          </span>
          <Tabs
            value={protocolFilter}
            onValueChange={setProtocolFilter}
            className="w-auto"
          >
            <TabsList className="bg-white/5 border border-white/10 h-8">
              {protocols.map((protocol) => (
                <TabsTrigger
                  key={protocol}
                  value={protocol}
                  className="text-xs px-3 h-6 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  {protocol === "all"
                    ? "All"
                    : (protocolLabels[protocol]?.label ??
                      protocol.toUpperCase())}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-white/50 uppercase tracking-wider"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            Source:
          </span>
          <Tabs
            value={sourceFilter}
            onValueChange={setSourceFilter}
            className="w-auto"
          >
            <TabsList className="bg-white/5 border border-white/10 h-8">
              {sources.map((source) => (
                <TabsTrigger
                  key={source}
                  value={source}
                  className="text-xs px-3 h-6 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  {source === "all"
                    ? "All"
                    : (sourceLabels[source]?.label ?? source)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setCategoryFilter(category)}
            className={cn(
              "px-4 py-2 text-sm border transition-all duration-200",
              categoryFilter === category
                ? "bg-cyan-500/20 border-cyan-500/50 text-white"
                : "bg-black/40 border-white/10 text-white/60 hover:border-white/30 hover:text-white",
            )}
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {/* Results Count */}
      <p
        className="text-sm text-white/50"
        style={{ fontFamily: "var(--font-roboto-mono)" }}
      >
        Showing {filteredServices.length} of {services.length} services
      </p>

      {/* Service Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {filteredServices.map((service, index) => {
            const Icon = iconMap[service.icon] || Puzzle;
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <BrandCard
                  hover
                  className={cn(
                    "cursor-pointer transition-all duration-300 group",
                    selectedService?.id === service.id &&
                      "border-cyan-500/50 shadow-lg shadow-cyan-500/10",
                  )}
                  onClick={() =>
                    setSelectedService(
                      selectedService?.id === service.id ? null : service,
                    )
                  }
                >
                  <CornerBrackets
                    size="sm"
                    color={service.color}
                    hoverColor="#06B6D4"
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
                            backgroundColor: `${service.color}15`,
                            borderColor: `${service.color}40`,
                          }}
                        >
                          <Icon
                            className="h-5 w-5"
                            style={{ color: service.color }}
                          />
                        </div>
                        <div>
                          <h3
                            className="text-lg font-medium text-white flex items-center gap-2 flex-wrap"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {service.name}
                            {service.x402Enabled && (
                              <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-400">
                                x402
                              </span>
                            )}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p
                              className="text-xs text-white/50"
                              style={{ fontFamily: "var(--font-roboto-mono)" }}
                            >
                              v{service.version} • {service.toolCount} tools
                            </p>
                            {service.creator && (
                              <span className="text-xs text-white/40">
                                by {service.creator.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full",
                              service.status === "live"
                                ? "bg-green-400"
                                : service.status === "coming_soon"
                                  ? "bg-yellow-400"
                                  : "bg-white/40",
                            )}
                          />
                          <span
                            className="text-xs text-white/50 uppercase"
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            {service.status.replace("_", " ")}
                          </span>
                        </div>
                        {/* Protocol badges */}
                        <div className="flex gap-1">
                          {service.protocols.map((protocol) => (
                            <span
                              key={protocol}
                              className="px-1.5 py-0.5 text-[9px] uppercase border"
                              style={{
                                backgroundColor: `${protocolLabels[protocol]?.color}15`,
                                borderColor: `${protocolLabels[protocol]?.color}40`,
                                color: protocolLabels[protocol]?.color,
                                fontFamily: "var(--font-roboto-mono)",
                              }}
                            >
                              {protocol}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-white/60 mb-4 line-clamp-2">
                      {service.description}
                    </p>

                    {/* Features */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {service.features.slice(0, 3).map((feature) => (
                        <span
                          key={feature}
                          className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/60"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          {feature}
                        </span>
                      ))}
                      {service.features.length > 3 && (
                        <span
                          className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/40"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          +{service.features.length - 3} more
                        </span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        {service.pricing.type === "x402" && (
                          <Zap className="h-3.5 w-3.5 text-purple-400" />
                        )}
                        <span
                          className="text-xs text-white/50"
                          style={{ fontFamily: "var(--font-roboto-mono)" }}
                        >
                          {service.pricing.description}
                        </span>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-white/30 transition-transform group-hover:text-white/60",
                          selectedService?.id === service.id && "rotate-90",
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

      {/* Empty State */}
      {filteredServices.length === 0 && (
        <div className="text-center py-12">
          <Puzzle className="h-12 w-12 text-white/20 mx-auto mb-4" />
          <p
            className="text-white/50"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            No services match your filters
          </p>
        </div>
      )}

      {/* Service Detail Panel */}
      <AnimatePresence>
        {selectedService && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <BrandCard className="relative shadow-lg shadow-black/50">
              <CornerBrackets
                size="md"
                color={selectedService.color}
                className="opacity-50"
              />

              <div className="relative z-10 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="p-3 rounded-none border"
                      style={{
                        backgroundColor: `${selectedService.color}15`,
                        borderColor: `${selectedService.color}40`,
                      }}
                    >
                      {(() => {
                        const Icon = iconMap[selectedService.icon] || Puzzle;
                        return (
                          <Icon
                            className="h-6 w-6"
                            style={{ color: selectedService.color }}
                          />
                        );
                      })()}
                    </div>
                    <div>
                      <h2
                        className="text-2xl font-normal text-white"
                        style={{ fontFamily: "var(--font-roboto-mono)" }}
                      >
                        {selectedService.name}
                      </h2>
                      <p className="text-sm text-white/60 mt-1">
                        {selectedService.description}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedService(null)}
                    className="p-2 hover:bg-white/10 transition-colors"
                  >
                    <X className="h-5 w-5 text-white/60" />
                  </button>
                </div>

                {/* Protocol & Source Info */}
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50 uppercase">
                      Protocols:
                    </span>
                    {selectedService.protocols.map((protocol) => (
                      <span
                        key={protocol}
                        className="px-2 py-1 text-xs uppercase border"
                        style={{
                          backgroundColor: `${protocolLabels[protocol]?.color}15`,
                          borderColor: `${protocolLabels[protocol]?.color}40`,
                          color: protocolLabels[protocol]?.color,
                          fontFamily: "var(--font-roboto-mono)",
                        }}
                      >
                        {protocol}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50 uppercase">
                      Source:
                    </span>
                    <span
                      className="px-2 py-1 text-xs uppercase bg-white/5 border border-white/10 text-white/60"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      {selectedService.source}
                    </span>
                  </div>
                </div>

                {/* Connection Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Endpoint */}
                  <div className="space-y-2">
                    <label
                      className="text-xs text-white/50 uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Service Endpoint URL
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/60 border border-white/10 p-3 font-mono text-sm text-white/80 overflow-x-auto">
                        {selectedService.endpoint.startsWith("http")
                          ? selectedService.endpoint
                          : `${typeof window !== "undefined" ? window.location.origin : ""}${selectedService.endpoint}`}
                      </div>
                      <button
                        onClick={() =>
                          copyEndpoint(
                            selectedService.endpoint,
                            selectedService.id,
                          )
                        }
                        className="p-3 bg-black/60 border border-white/10 hover:border-cyan-500/50 transition-colors"
                      >
                        {copiedEndpoint === selectedService.id ? (
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
                              [selectedService.id]: {
                                command: "npx",
                                args: [
                                  "-y",
                                  "@anthropic/mcp-client",
                                  selectedService.endpoint.startsWith("http")
                                    ? selectedService.endpoint
                                    : `${typeof window !== "undefined" ? window.location.origin : ""}${selectedService.endpoint}`,
                                ],
                              },
                            },
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Actions & Test */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => testService(selectedService)}
                    disabled={testingService === selectedService.id}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                  >
                    {testingService === selectedService.id ? (
                      <span className="h-4 w-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Test Connection
                  </button>

                  <a
                    href={selectedService.endpoint}
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
                        "https://modelcontextprotocol.io/introduction",
                        "_blank",
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
                      Service Response
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
                    Available Tools ({selectedService.toolCount})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedService.features.map((feature) => (
                      <span
                        key={feature}
                        className="px-3 py-1.5 text-xs border text-white/70"
                        style={{
                          backgroundColor: `${selectedService.color}10`,
                          borderColor: `${selectedService.color}30`,
                          fontFamily: "var(--font-roboto-mono)",
                        }}
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                {/* x402 Info */}
                {selectedService.x402Enabled && (
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
                      This service supports accountless micropayments via the
                      x402 protocol. Pay only for what you use with{" "}
                      {selectedService.pricing.pricePerRequest &&
                        `$${selectedService.pricing.pricePerRequest}`}{" "}
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
