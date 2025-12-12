"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Puzzle,
  Globe,
  Zap,
  Server,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PostCreationAppPrompt,
  type EntityType,
} from "@/components/builders/post-creation-app-prompt";

interface ServiceTool {
  name: string;
  description: string;
}

interface ServiceEndpoints {
  mcp: boolean;
  a2a: boolean;
  rest: boolean;
}

const CATEGORIES = [
  { value: "utilities", label: "Utilities" },
  { value: "finance", label: "Finance" },
  { value: "data", label: "Data" },
  { value: "communication", label: "Communication" },
  { value: "productivity", label: "Productivity" },
  { value: "ai", label: "AI" },
  { value: "search", label: "Search" },
  { value: "platform", label: "Platform" },
  { value: "other", label: "Other" },
];

const ENDPOINT_OPTIONS = [
  {
    key: "mcp" as const,
    label: "MCP Server",
    description: "Model Context Protocol endpoint",
    icon: Puzzle,
    color: "#06B6D4",
  },
  {
    key: "a2a" as const,
    label: "A2A Protocol",
    description: "Agent-to-Agent communication",
    icon: Zap,
    color: "#3B82F6",
  },
  {
    key: "rest" as const,
    label: "REST API",
    description: "Standard HTTP endpoints",
    icon: Globe,
    color: "#22C55E",
  },
];

/**
 * Create Service page for building new MCP/A2A/REST services.
 */
export default function CreateServicePage() {
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("utilities");
  const [endpoints, setEndpoints] = useState<ServiceEndpoints>({
    mcp: true,
    a2a: false,
    rest: false,
  });
  const [tools, setTools] = useState<ServiceTool[]>([]);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [pricingType, setPricingType] = useState<"free" | "credits" | "x402">(
    "credits"
  );
  const [creditsPerRequest, setCreditsPerRequest] = useState("1");
  const [x402Enabled, setX402Enabled] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [createdService, setCreatedService] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showAppPrompt, setShowAppPrompt] = useState(false);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    );
  };

  // Add tool
  const addTool = () => {
    if (!newToolName.trim()) return;
    setTools([
      ...tools,
      { name: newToolName.trim(), description: newToolDescription.trim() },
    ]);
    setNewToolName("");
    setNewToolDescription("");
  };

  // Remove tool
  const removeTool = (index: number) => {
    setTools(tools.filter((_, i) => i !== index));
  };

  // Create service
  const handleCreate = async () => {
    if (!name.trim() || !slug.trim() || !description.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);

    const response = await fetch("/api/v1/mcps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        category,
        tools,
        pricingType,
        creditsPerRequest: parseFloat(creditsPerRequest),
        x402Enabled,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Failed to create service");
      setIsLoading(false);
      return;
    }

    const data = await response.json();
    setCreatedService({ id: data.mcp.id, name: name.trim() });
    toast.success("Service created successfully!");
    setShowAppPrompt(true);
    setIsLoading(false);
  };

  // Handle post-creation navigation
  const handlePostCreation = () => {
    if (createdService) {
      router.push(`/dashboard/services`);
    }
  };

  return (
    <>
      <div className="max-w-4xl mx-auto py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/services"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white/60" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: "#06B6D4" }}
              />
              <h1
                className="text-3xl font-normal tracking-tight text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Create Service
              </h1>
            </div>
            <p className="text-white/60">
              Build a new MCP, A2A, or REST service for the marketplace
            </p>
          </div>
        </div>

        {/* Main Form */}
        <BrandCard className="relative shadow-lg shadow-black/50">
          <CornerBrackets size="sm" className="opacity-50" />
          <div className="relative z-10 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Server className="h-5 w-5 text-cyan-400" />
                <h2
                  className="text-xl font-normal text-white"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Basic Information
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/70">
                    Service Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="My Awesome Service"
                    className="bg-black/40 border-white/20 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white/70">
                    Slug <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="my-awesome-service"
                    className="bg-black/40 border-white/20 text-white font-mono"
                  />
                  <p className="text-xs text-white/40">
                    URL-friendly identifier (lowercase, no spaces)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">
                  Description <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what your service does..."
                  className="bg-black/40 border-white/20 text-white min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-black/40 border-white/20 text-white w-full md:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Protocols */}
            <div className="space-y-4 pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Puzzle className="h-5 w-5 text-cyan-400" />
                <h2
                  className="text-xl font-normal text-white"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Protocols
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {ENDPOINT_OPTIONS.map(({ key, label, description, icon: Icon, color }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setEndpoints((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className={`p-4 rounded-lg border text-left transition-all ${
                      endpoints[key]
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="p-2 rounded border"
                        style={{
                          backgroundColor: `${color}15`,
                          borderColor: `${color}40`,
                        }}
                      >
                        <Icon className="h-4 w-4" style={{ color }} />
                      </div>
                      <span className="font-medium text-white">{label}</span>
                    </div>
                    <p className="text-xs text-white/50">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Tools */}
            <div className="space-y-4 pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-cyan-400" />
                <h2
                  className="text-xl font-normal text-white"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Tools
                </h2>
              </div>

              {/* Existing tools */}
              {tools.length > 0 && (
                <div className="space-y-2">
                  {tools.map((tool, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">
                          {tool.name}
                        </p>
                        {tool.description && (
                          <p className="text-xs text-white/50">
                            {tool.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTool(index)}
                        className="p-1 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new tool */}
              <div className="flex gap-2">
                <Input
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  placeholder="Tool name"
                  className="bg-black/40 border-white/20 text-white flex-1"
                />
                <Input
                  value={newToolDescription}
                  onChange={(e) => setNewToolDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="bg-black/40 border-white/20 text-white flex-1"
                />
                <BrandButton
                  variant="hud"
                  onClick={addTool}
                  disabled={!newToolName.trim()}
                >
                  <Plus className="h-4 w-4" />
                </BrandButton>
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4 pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-5 w-5 text-cyan-400" />
                <h2
                  className="text-xl font-normal text-white"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Pricing
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/70">Pricing Type</Label>
                  <Select
                    value={pricingType}
                    onValueChange={(v) =>
                      setPricingType(v as "free" | "credits" | "x402")
                    }
                  >
                    <SelectTrigger className="bg-black/40 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="credits">Credits</SelectItem>
                      <SelectItem value="x402">x402 Micropayments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {pricingType === "credits" && (
                  <div className="space-y-2">
                    <Label className="text-white/70">Credits per Request</Label>
                    <Input
                      type="number"
                      value={creditsPerRequest}
                      onChange={(e) => setCreditsPerRequest(e.target.value)}
                      min="0"
                      step="0.1"
                      className="bg-black/40 border-white/20 text-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={x402Enabled} onCheckedChange={setX402Enabled} />
                <Label className="text-white/70">
                  Enable x402 Micropayments
                </Label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
              <Link href="/dashboard/services">
                <BrandButton variant="hud">Cancel</BrandButton>
              </Link>
              <BrandButton
                variant="primary"
                onClick={handleCreate}
                disabled={
                  isLoading ||
                  !name.trim() ||
                  !slug.trim() ||
                  !description.trim()
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Service
                  </>
                )}
              </BrandButton>
            </div>
          </div>
        </BrandCard>
      </div>

      {/* Post-creation app prompt */}
      {createdService && (
        <PostCreationAppPrompt
          open={showAppPrompt}
          onOpenChange={setShowAppPrompt}
          entityType="service"
          entityId={createdService.id}
          entityName={createdService.name}
          onSkip={handlePostCreation}
        />
      )}
    </>
  );
}

