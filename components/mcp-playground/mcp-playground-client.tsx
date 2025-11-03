"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  Zap,
  TrendingUp,
  Twitter,
  Image as ImageIcon,
  Search,
  Play,
  Code2,
  Loader2,
  CheckCircle2,
  XCircle,
  DollarSign,
  Sparkles,
  Copy,
  Check,
  Wallet,
  CreditCard,
  Link2,
  Server,
} from "lucide-react";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
  CornerBrackets,
  SectionLabel,
} from "@/components/brand";

interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  cost: string;
}

interface MCP {
  id: string;
  name: string;
  description: string;
  version: string;
  endpoint: string;
  category: string;
  pricing: { type: string; base: string };
  tools: MCPTool[];
}

interface MCPListResponse {
  mcps: MCP[];
  total: number;
  categories: string[];
}

const categoryIcons: Record<string, any> = {
  platform: Database,
  crypto: TrendingUp,
  social: Twitter,
  ai: Sparkles,
};

const categoryColors: Record<string, string> = {
  platform: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  crypto: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  social: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  ai: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
};

export function MCPPlaygroundClient() {
  const [mcps, setMcps] = useState<MCP[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMcp, setSelectedMcp] = useState<MCP | null>(null);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>("all");
  const [toolParams, setToolParams] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  useEffect(() => {
    fetchMCPs();
  }, []);

  // Ensure first tool is selected when MCP changes
  useEffect(() => {
    if (selectedMcp && selectedMcp.tools.length > 0 && !selectedTool) {
      setSelectedTool(selectedMcp.tools[0]);
    }
  }, [selectedMcp, selectedTool]);

  const fetchMCPs = async () => {
    try {
      const response = await fetch("/api/mcp/list");
      const data: MCPListResponse = await response.json();
      setMcps(data.mcps);
      if (data.mcps.length > 0) {
        setSelectedMcp(data.mcps[0]);
        if (data.mcps[0].tools.length > 0) {
          setSelectedTool(data.mcps[0].tools[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch MCPs:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMcps = mcps.filter((mcp) => {
    const matchesSearch =
      mcp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mcp.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || mcp.category === selectedCategory;
    const matchesPayment =
      selectedPaymentType === "all" || mcp.pricing.type === selectedPaymentType;
    return matchesSearch && matchesCategory && matchesPayment;
  });

  const executeTool = async () => {
    if (!selectedTool || !selectedMcp) return;

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      // Build the request based on MCP type
      const response = await fetch(selectedMcp.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: "tools/call",
          params: {
            name: selectedTool.name,
            arguments: toolParams,
          },
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to execute tool");
    } finally {
      setExecuting(false);
    }
  };

  const handleParamChange = (paramName: string, value: any) => {
    setToolParams((prev) => ({
      ...prev,
      [paramName]: value,
    }));
  };

  const copyToClipboard = async (
    text: string,
    type: "result" | "code" | "endpoint",
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "result") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else if (type === "endpoint") {
        setCopiedEndpoint(true);
        setTimeout(() => setCopiedEndpoint(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const renderParameterInput = (paramName: string, paramConfig: any) => {
    const value = toolParams[paramName] || paramConfig.default || "";

    if (paramConfig.type === "enum") {
      return (
        <Select
          value={value}
          onValueChange={(val) => handleParamChange(paramName, val)}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${paramName}`} />
          </SelectTrigger>
          <SelectContent>
            {paramConfig.options.map((option: string) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (paramConfig.type === "boolean") {
      return (
        <Select
          value={value.toString()}
          onValueChange={(val) => handleParamChange(paramName, val === "true")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (paramConfig.type === "number") {
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) =>
            handleParamChange(paramName, parseInt(e.target.value) || 0)
          }
          min={paramConfig.min}
          max={paramConfig.max}
          placeholder={`Enter ${paramName}`}
        />
      );
    }

    if (paramConfig.max && paramConfig.max > 1000) {
      return (
        <Textarea
          value={value}
          onChange={(e) => handleParamChange(paramName, e.target.value)}
          placeholder={paramConfig.description || `Enter ${paramName}`}
          rows={4}
        />
      );
    }

    return (
      <Input
        type="text"
        value={value}
        onChange={(e) => handleParamChange(paramName, e.target.value)}
        placeholder={paramConfig.description || `Enter ${paramName}`}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <Loader2 className="size-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            MCP Playground
          </h1>
          <p className="text-white/60 mt-2">
            Explore and test our Model Context Protocol integrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-none border border-white/20 bg-white/10 px-3 py-1 text-xs text-white flex items-center gap-2">
            <Database className="size-3" />
            {mcps.length} MCPs Available
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <BrandCard corners={false}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center py-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <Input
              placeholder="Search MCPs and tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-[180px] rounded-none border-white/10 bg-black/40 text-white focus:ring-1 focus:ring-[#FF5800]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-white/10 bg-black/90">
              <SelectItem
                value="all"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                All Categories
              </SelectItem>
              <SelectItem
                value="platform"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                Platform
              </SelectItem>
              <SelectItem
                value="crypto"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                Crypto
              </SelectItem>
              <SelectItem
                value="social"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                Social
              </SelectItem>
              <SelectItem
                value="ai"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                AI
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectedPaymentType}
            onValueChange={setSelectedPaymentType}
          >
            <SelectTrigger className="w-full md:w-[180px] rounded-none border-white/10 bg-black/40 text-white focus:ring-1 focus:ring-[#FF5800]">
              <SelectValue placeholder="Payment Type" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-white/10 bg-black/90">
              <SelectItem
                value="all"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                All Payment Types
              </SelectItem>
              <SelectItem
                value="x402"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                <div className="flex items-center gap-2">
                  <Wallet className="size-3 text-blue-400" />
                  x402 Protocol
                </div>
              </SelectItem>
              <SelectItem
                value="credits"
                className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="size-3 text-emerald-400" />
                  Credit-Based
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </BrandCard>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        {/* MCP List */}
        <div className="space-y-3">
          <SectionLabel>Available MCPs</SectionLabel>
          <div className="space-y-2">
            {filteredMcps.map((mcp) => {
              const Icon = categoryIcons[mcp.category] || Database;
              const isSelected = selectedMcp?.id === mcp.id;

              return (
                <BrandCard
                  key={mcp.id}
                  corners={false}
                  hover
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? "border-[#FF5800] ring-2 ring-[#FF5800]/40"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedMcp(mcp);
                    setSelectedTool(mcp.tools[0] || null);
                    setToolParams({});
                    setResult(null);
                    setError(null);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className={`rounded-none p-2 border ${categoryColors[mcp.category]}`}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm truncate font-bold text-white">
                          {mcp.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-xs rounded-none bg-white/10 px-2 py-0.5 text-white">
                            {mcp.tools.length} tools
                          </span>
                          {mcp.pricing.type === "x402" && (
                            <span className="text-xs gap-1 rounded-none bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 text-blue-400 inline-flex items-center">
                              <Wallet className="size-2.5" />
                              x402
                            </span>
                          )}
                          {mcp.pricing.type === "credits" && (
                            <span className="text-xs gap-1 rounded-none bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-emerald-400 inline-flex items-center">
                              <CreditCard className="size-2.5" />
                              Credits
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </BrandCard>
              );
            })}
          </div>
        </div>

        {/* Tool Tester */}
        {selectedMcp && (
          <BrandCard className="relative">
            <CornerBrackets size="sm" className="opacity-50" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedMcp.name}
                  </h3>
                  <p className="text-sm text-white/60 mt-2">
                    {selectedMcp.description}
                  </p>
                </div>
                <span
                  className={`rounded-none border px-2 py-1 text-xs font-bold uppercase tracking-wide ${categoryColors[selectedMcp.category]}`}
                >
                  {selectedMcp.category}
                </span>
              </div>
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedMcp.pricing.type === "x402" ? (
                    <span className="gap-1.5 rounded-none bg-blue-500/20 border border-blue-500/40 px-2 py-1 text-xs text-blue-400 inline-flex items-center">
                      <Wallet className="size-3" />
                      x402 Protocol
                    </span>
                  ) : (
                    <span className="gap-1.5 rounded-none bg-emerald-500/20 border border-emerald-500/40 px-2 py-1 text-xs text-emerald-400 inline-flex items-center">
                      <CreditCard className="size-3" />
                      Credit-Based
                    </span>
                  )}
                  <span className="rounded-none border border-white/20 bg-white/10 px-2 py-1 text-xs text-white inline-flex items-center gap-1.5">
                    <DollarSign className="size-3" />
                    {selectedMcp.pricing.base}
                  </span>
                  <span className="rounded-none border border-white/20 bg-white/10 px-2 py-1 text-xs text-white">
                    v{selectedMcp.version}
                  </span>
                </div>

                {/* Endpoint URL */}
                <div className="rounded-none border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="size-3.5 text-[#FF5800]" />
                      <span className="text-xs font-medium text-white/70 uppercase tracking-wide">
                        MCP Endpoint
                      </span>
                    </div>
                    <BrandButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          `${typeof window !== "undefined" ? window.location.origin : ""}${selectedMcp.endpoint}`,
                          "endpoint",
                        )
                      }
                      className="h-6 w-6 p-0"
                    >
                      {copiedEndpoint ? (
                        <Check className="size-3 text-green-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </BrandButton>
                  </div>
                  <code className="text-xs text-white/70 break-all">
                    {typeof window !== "undefined"
                      ? window.location.origin
                      : "https://your-domain.com"}
                    {selectedMcp.endpoint}
                  </code>
                </div>
              </div>

              <div className="border-t border-white/10 my-4" />
              <BrandTabs
                value={selectedTool?.name || selectedMcp.tools[0]?.name}
                onValueChange={(value) => {
                  const tool = selectedMcp.tools.find((t) => t.name === value);
                  if (tool) {
                    setSelectedTool(tool);
                    setToolParams({});
                    setResult(null);
                    setError(null);
                  }
                }}
              >
                <div className="overflow-x-auto scrollbar-hide -mx-6 px-6 mb-4">
                  <div className="inline-flex gap-0 min-w-max border border-white/10 bg-black/50 rounded-none">
                    {selectedMcp.tools.map((tool) => (
                      <button
                        key={tool.name}
                        onClick={() => {
                          const foundTool = selectedMcp.tools.find(
                            (t) => t.name === tool.name,
                          );
                          if (foundTool) {
                            setSelectedTool(foundTool);
                            setToolParams({});
                            setResult(null);
                            setError(null);
                          }
                        }}
                        className={`
                          inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap
                          border-b-2 border-transparent
                          ${
                            selectedTool?.name === tool.name
                              ? "border-[#FF5800] bg-[#252527] text-white"
                              : "text-white/70 hover:text-white/90 hover:bg-white/5"
                          }
                        `}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedTool && (
                  <div className="space-y-4">
                    <div className="rounded-none bg-black/40 border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-white">
                          {selectedTool.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          {selectedMcp.pricing.type === "x402" && (
                            <span className="gap-1 rounded-none bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 text-xs text-blue-400 inline-flex items-center">
                              <Wallet className="size-2.5" />
                              x402
                            </span>
                          )}
                          <span className="rounded-none bg-white/10 px-2 py-0.5 text-xs text-white">
                            {selectedTool.cost}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-white/60">
                        {selectedTool.description}
                      </p>
                      {selectedMcp.pricing.type === "x402" && (
                        <div className="flex items-start gap-2 rounded-none bg-blue-500/10 border border-blue-500/20 p-2.5 text-xs">
                          <Wallet className="size-3.5 text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-blue-400">
                            <span className="font-medium">x402 Protocol:</span>{" "}
                            Pay per call with cryptocurrency via Coinbase x402.
                            No subscription required.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Parameters */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-white">
                        Parameters
                      </h4>
                      {Object.keys(selectedTool.parameters).length === 0 ? (
                        <p className="text-sm text-white/60">
                          No parameters required
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(selectedTool.parameters).map(
                            ([paramName, paramConfig]: [string, any]) => (
                              <div key={paramName} className="space-y-2">
                                <label
                                  htmlFor={paramName}
                                  className="text-xs font-medium text-white/70 uppercase tracking-wide"
                                >
                                  {paramName}
                                  {!paramConfig.optional && (
                                    <span className="text-rose-400 ml-1">
                                      *
                                    </span>
                                  )}
                                </label>
                                <div>
                                  {renderParameterInput(paramName, paramConfig)}
                                </div>
                                {paramConfig.description && (
                                  <p className="text-xs text-white/50">
                                    {paramConfig.description}
                                  </p>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>

                    {/* Execute Button */}
                    <BrandButton
                      onClick={executeTool}
                      disabled={executing}
                      variant="primary"
                      className="w-full"
                      size="lg"
                    >
                      {executing ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="size-4" />
                          Execute Tool
                        </>
                      )}
                    </BrandButton>

                    {/* Result Display */}
                    {(result || error) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-white">
                            Result
                          </h4>
                          <div className="flex items-center gap-2">
                            {result && (
                              <span className="gap-1.5 rounded-none bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-400 inline-flex items-center">
                                <CheckCircle2 className="size-3" />
                                Success
                              </span>
                            )}
                            {error && (
                              <span className="gap-1.5 rounded-none bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-xs text-rose-400 inline-flex items-center">
                                <XCircle className="size-3" />
                                Error
                              </span>
                            )}
                            <BrandButton
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                copyToClipboard(
                                  error || JSON.stringify(result, null, 2),
                                  "result",
                                )
                              }
                              className="h-6 w-6 p-0"
                            >
                              {copied ? (
                                <Check className="size-3 text-green-400" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </BrandButton>
                          </div>
                        </div>
                        <div className="rounded-none bg-black/60 border border-white/10 p-4">
                          <pre className="text-xs overflow-x-auto text-white/70">
                            {error || JSON.stringify(result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Connection & Code Examples */}
                    <div className="space-y-3">
                      {/* MCP Connection Info */}
                      <details className="space-y-2" open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 hover:text-[#FF5800] transition-colors text-white">
                          <Link2 className="size-4" />
                          Connect Your Agent
                        </summary>
                        <div className="rounded-none bg-black/40 border border-white/10 p-4 space-y-3">
                          <div>
                            <p className="text-xs font-medium mb-2 text-white/70 uppercase tracking-wide">
                              MCP Configuration (Claude Desktop / Agent)
                            </p>
                            <pre className="text-xs overflow-x-auto p-3 rounded-none bg-black/60 border border-white/10 text-white/70">
                              {`{
  "mcpServers": {
    "${selectedMcp.id}": {
      "url": "${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}${selectedMcp.endpoint}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
                            </pre>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-white/60">
                            <Server className="size-3.5 mt-0.5 shrink-0 text-[#FF5800]" />
                            <p>
                              Add this configuration to your MCP client (Claude
                              Desktop, custom agent, etc.) to connect to this
                              MCP server.
                            </p>
                          </div>
                        </div>
                      </details>

                      {/* Code Example */}
                      <details className="space-y-2">
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 hover:text-[#FF5800] transition-colors text-white">
                          <Code2 className="size-4" />
                          View Code Example
                        </summary>
                        <div className="rounded-none bg-black/40 border border-white/10 p-4 relative">
                          <BrandButton
                            size="sm"
                            variant="ghost"
                            className="absolute top-2 right-2 h-6 w-6 p-0"
                            onClick={() =>
                              copyToClipboard(
                                `// MCP Tool Call Example
const response = await fetch("${selectedMcp.endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    method: "tools/call",
    params: {
      name: "${selectedTool.name}",
      arguments: ${JSON.stringify(toolParams, null, 2)}
    }
  })
});

const data = await response.json();
console.log(data);`,
                                "code",
                              )
                            }
                          >
                            {copiedCode ? (
                              <Check className="size-3 text-green-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </BrandButton>
                          <pre className="text-xs overflow-x-auto pr-8 text-white/70">
                            {`// MCP Tool Call Example
const response = await fetch("${selectedMcp.endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
  },
  body: JSON.stringify({
    method: "tools/call",
    params: {
      name: "${selectedTool.name}",
      arguments: ${JSON.stringify(toolParams, null, 2)}
    }
  })
});

const data = await response.json();
console.log(data);`}
                          </pre>
                        </div>
                      </details>
                    </div>
                  </div>
                )}
              </BrandTabs>
            </div>
          </BrandCard>
        )}
      </div>
    </div>
  );
}
