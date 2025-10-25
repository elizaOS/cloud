"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  platform: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  crypto: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  social: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  ai: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
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

  const copyToClipboard = async (text: string, type: "result" | "code" | "endpoint") => {
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
            <SelectValue
              placeholder={`Select ${paramName}`}
            />
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
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MCP Playground</h1>
          <p className="text-muted-foreground mt-2">
            Explore and test our Model Context Protocol integrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <Database className="size-3" />
            {mcps.length} MCPs Available
          </Badge>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search MCPs and tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="platform">Platform</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedPaymentType} onValueChange={setSelectedPaymentType}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Payment Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Types</SelectItem>
                <SelectItem value="x402">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-3 text-blue-600 dark:text-blue-400" />
                    x402 Protocol
                  </div>
                </SelectItem>
                <SelectItem value="credits">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-3 text-emerald-600 dark:text-emerald-400" />
                    Credit-Based
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        {/* MCP List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Available MCPs</h2>
          <div className="space-y-2">
            {filteredMcps.map((mcp) => {
              const Icon = categoryIcons[mcp.category] || Database;
              const isSelected = selectedMcp?.id === mcp.id;

              return (
                <Card
                  key={mcp.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => {
                    setSelectedMcp(mcp);
                    setSelectedTool(mcp.tools[0] || null);
                    setToolParams({});
                    setResult(null);
                    setError(null);
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`rounded-lg p-2 ${categoryColors[mcp.category]}`}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm truncate">{mcp.name}</CardTitle>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {mcp.tools.length} tools
                            </Badge>
                            {mcp.pricing.type === "x402" && (
                              <Badge
                                variant="outline"
                                className="text-xs gap-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                              >
                                <Wallet className="size-2.5" />
                                x402
                              </Badge>
                            )}
                            {mcp.pricing.type === "credits" && (
                              <Badge
                                variant="outline"
                                className="text-xs gap-1 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              >
                                <CreditCard className="size-2.5" />
                                Credits
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Tool Tester */}
        {selectedMcp && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{selectedMcp.name}</CardTitle>
                  <CardDescription className="mt-2">
                    {selectedMcp.description}
                  </CardDescription>
                </div>
                <Badge
                  className={categoryColors[selectedMcp.category]}
                  variant="outline"
                >
                  {selectedMcp.category}
                </Badge>
              </div>
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedMcp.pricing.type === "x402" ? (
                    <Badge
                      variant="outline"
                      className="gap-1.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                    >
                      <Wallet className="size-3" />
                      x402 Protocol
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    >
                      <CreditCard className="size-3" />
                      Credit-Based
                    </Badge>
                  )}
                  <Badge variant="outline" className="gap-1.5">
                    <DollarSign className="size-3" />
                    {selectedMcp.pricing.base}
                  </Badge>
                  <Badge variant="outline">v{selectedMcp.version}</Badge>
                </div>
                
                {/* Endpoint URL */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="size-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        MCP Endpoint
                      </span>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          `${typeof window !== "undefined" ? window.location.origin : ""}${selectedMcp.endpoint}`,
                          "endpoint"
                        )
                      }
                    >
                      {copiedEndpoint ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  </div>
                  <code className="text-xs text-foreground/80 break-all">
                    {typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}
                    {selectedMcp.endpoint}
                  </code>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs
                defaultValue={selectedTool?.name || selectedMcp.tools[0]?.name}
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
                <TabsList className="w-full overflow-x-auto flex-wrap h-auto justify-start">
                  {selectedMcp.tools.map((tool) => (
                    <TabsTrigger key={tool.name} value={tool.name}>
                      {tool.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {selectedMcp.tools.map((tool) => (
                  <TabsContent key={tool.name} value={tool.name} className="space-y-4">
                    <div className="rounded-lg bg-muted/50 p-4 space-y-3 border">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">{tool.name}</h3>
                        <div className="flex items-center gap-2">
                          {selectedMcp.pricing.type === "x402" && (
                            <Badge
                              variant="outline"
                              className="gap-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs"
                            >
                              <Wallet className="size-2.5" />
                              x402
                            </Badge>
                          )}
                          <Badge variant="secondary">{tool.cost}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tool.description}
                      </p>
                      {selectedMcp.pricing.type === "x402" && (
                        <div className="flex items-start gap-2 rounded-md bg-blue-500/5 border border-blue-500/20 p-2.5 text-xs">
                          <Wallet className="size-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-blue-600 dark:text-blue-400">
                            <span className="font-medium">x402 Protocol:</span> Pay
                            per call with cryptocurrency via Coinbase x402. No
                            subscription required.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Parameters */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold">Parameters</h4>
                      {Object.keys(tool.parameters).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No parameters required
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(tool.parameters).map(
                            ([paramName, paramConfig]: [string, any]) => (
                              <div key={paramName} className="space-y-2">
                                <Label htmlFor={paramName}>
                                  {paramName}
                                  {!paramConfig.optional && (
                                    <span className="text-destructive ml-1">*</span>
                                  )}
                                </Label>
                                <div>
                                  {renderParameterInput(paramName, paramConfig)}
                                </div>
                                {paramConfig.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {paramConfig.description}
                                  </p>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Execute Button */}
                    <Button
                      onClick={executeTool}
                      disabled={executing}
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
                    </Button>

                    {/* Result Display */}
                    {(result || error) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold">Result</h4>
                          <div className="flex items-center gap-2">
                            {result && (
                              <Badge
                                variant="outline"
                                className="gap-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              >
                                <CheckCircle2 className="size-3" />
                                Success
                              </Badge>
                            )}
                            {error && (
                              <Badge
                                variant="outline"
                                className="gap-1.5 bg-destructive/10 text-destructive border-destructive/20"
                              >
                                <XCircle className="size-3" />
                                Error
                              </Badge>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() =>
                                copyToClipboard(
                                  error || JSON.stringify(result, null, 2),
                                  "result"
                                )
                              }
                            >
                              {copied ? (
                                <Check className="size-3 text-emerald-600" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-4 border">
                          <pre className="text-xs overflow-x-auto">
                            {error || JSON.stringify(result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Connection & Code Examples */}
                    <div className="space-y-3">
                      {/* MCP Connection Info */}
                      <details className="space-y-2" open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors">
                          <Link2 className="size-4" />
                          Connect Your Agent
                        </summary>
                        <div className="rounded-lg bg-muted/50 p-4 border space-y-3">
                          <div>
                            <p className="text-xs font-medium mb-2 text-muted-foreground">
                              MCP Configuration (Claude Desktop / Agent)
                            </p>
                            <pre className="text-xs overflow-x-auto p-3 rounded bg-background/50 border">
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
                          <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Server className="size-3.5 mt-0.5 shrink-0" />
                            <p>
                              Add this configuration to your MCP client (Claude Desktop, 
                              custom agent, etc.) to connect to this MCP server.
                            </p>
                          </div>
                        </div>
                      </details>

                      {/* Code Example */}
                      <details className="space-y-2">
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors">
                          <Code2 className="size-4" />
                          View Code Example
                        </summary>
                      <div className="rounded-lg bg-muted/50 p-4 border relative">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="absolute top-2 right-2"
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
      name: "${tool.name}",
      arguments: ${JSON.stringify(toolParams, null, 2)}
    }
  })
});

const data = await response.json();
console.log(data);`,
                              "code"
                            )
                          }
                        >
                          {copiedCode ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </Button>
                        <pre className="text-xs overflow-x-auto pr-8">
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
      name: "${tool.name}",
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
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

