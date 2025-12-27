"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import {
  Loader2,
  Search,
  Globe,
  Zap,
  Bot,
  Copy,
  Check,
  Plus,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EndpointNode } from "./types";

interface EndpointDiscoveryProps {
  onSelectEndpoint?: (endpoint: EndpointNode) => void;
  selectionMode?: boolean;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Globe; color: string }
> = {
  a2a: { label: "A2A", icon: Zap, color: "from-orange-500 to-red-500" },
  mcp: { label: "MCP", icon: Bot, color: "from-purple-500 to-pink-500" },
  rest: { label: "REST", icon: Globe, color: "from-green-500 to-emerald-500" },
};

const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  storage: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  infrastructure: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  workflows: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  billing: "bg-green-500/20 text-green-400 border-green-500/30",
  memory: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  agents: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  discovery: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  defi: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  utilities: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export function EndpointDiscovery({
  onSelectEndpoint,
  selectionMode,
}: EndpointDiscoveryProps) {
  const [endpoints, setEndpoints] = useState<EndpointNode[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function doFetch() {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      if (selectedTypes.length > 0)
        params.set("types", selectedTypes.join(","));
      if (selectedCategories.length > 0)
        params.set("categories", selectedCategories.join(","));
      params.set("limit", "100");

      const response = await fetch(`/api/v1/n8n/discover-endpoints?${params}`);
      if (cancelled) return;

      if (!response.ok) {
        toast.error("Failed to load endpoints");
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      setEndpoints(data.endpoints || []);
      setCategories(data.categories || []);
      setTotal(data.total || 0);
      setIsLoading(false);
    }

    doFetch();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, selectedTypes, selectedCategories]);

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <BrandCard>
        <CornerBrackets size="sm" className="opacity-20" />
        <div className="relative z-10 p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search endpoints by name, description, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-white/40 py-1">Type:</span>
            {Object.entries(TYPE_CONFIG).map(([type, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    selectedTypes.includes(type)
                      ? `bg-gradient-to-r ${config.color} text-white`
                      : "bg-white/5 text-white/60 hover:bg-white/10",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-white/40 py-1">Category:</span>
              {categories.slice(0, 12).map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                    selectedCategories.includes(category)
                      ? CATEGORY_COLORS[category] || CATEGORY_COLORS.utilities
                      : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10",
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
        </div>
      </BrandCard>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
        </div>
      ) : endpoints.length === 0 ? (
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-8 text-center">
            <Search className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-2">No endpoints found</h4>
            <p className="text-sm text-white/50">
              Try adjusting your search query or filters
            </p>
          </div>
        </BrandCard>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-white/40">
            <span>
              Showing {endpoints.length} of {total} endpoints
            </span>
            <span>
              {selectedTypes.length > 0 || selectedCategories.length > 0
                ? "Filters applied"
                : "All endpoints"}
            </span>
          </div>

          <div className="grid gap-4">
            {endpoints.map((endpoint) => {
              const typeConfig = TYPE_CONFIG[endpoint.type];
              const Icon = typeConfig?.icon || Globe;

              return (
                <BrandCard key={endpoint.id} className="relative group">
                  <CornerBrackets
                    size="sm"
                    className="opacity-10 group-hover:opacity-30 transition-opacity"
                  />
                  <div className="relative z-10 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            "p-2 rounded-lg bg-gradient-to-r shrink-0",
                            typeConfig?.color || "from-gray-500 to-gray-600",
                          )}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-white font-medium truncate">
                              {endpoint.name}
                            </h4>
                            <Badge
                              variant="outline"
                              className={
                                CATEGORY_COLORS[endpoint.category] ||
                                CATEGORY_COLORS.utilities
                              }
                            >
                              {endpoint.category}
                            </Badge>
                            {endpoint.method && (
                              <Badge
                                variant="outline"
                                className="bg-white/5 text-white/60 border-white/10"
                              >
                                {endpoint.method}
                              </Badge>
                            )}
                            {endpoint.x402Enabled && (
                              <Badge
                                variant="outline"
                                className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                              >
                                x402
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-white/50 mt-1 line-clamp-2">
                            {endpoint.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <code className="text-xs text-white/40 font-mono truncate max-w-md">
                              {endpoint.endpoint}
                            </code>
                            <button
                              onClick={() =>
                                handleCopy(endpoint.endpoint, endpoint.id)
                              }
                              className="p-1 hover:bg-white/5 rounded transition-colors"
                            >
                              {copied === endpoint.id ? (
                                <Check className="h-3.5 w-3.5 text-green-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-white/30 hover:text-white/60" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {selectionMode && onSelectEndpoint ? (
                          <BrandButton
                            variant="primary"
                            size="sm"
                            onClick={() => onSelectEndpoint(endpoint)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </BrandButton>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              window.open(endpoint.endpoint, "_blank")
                            }
                            className="text-white/40 hover:text-white"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {endpoint.authentication && (
                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-white/40">
                        <span className="px-2 py-0.5 rounded bg-white/5">
                          Auth: {endpoint.authentication.type}
                        </span>
                        {endpoint.source !== "builtin" && (
                          <span className="px-2 py-0.5 rounded bg-white/5">
                            Source: {endpoint.source}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </BrandCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
