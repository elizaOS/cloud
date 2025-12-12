"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Server,
  Bot,
  Zap,
  Globe,
  Workflow,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  Code,
  Terminal,
  ExternalLink,
  Settings,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { generateServiceName } from "@/lib/utils/random-names";
import { cn } from "@/lib/utils";

interface ServiceEndpoints {
  mcp: boolean;
  a2a: boolean;
  rest: boolean;
}

interface ServiceTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface ServiceBuilderProps {
  appId?: string;
  initialData?: {
    name?: string;
    description?: string;
    endpoints?: ServiceEndpoints;
    tools?: ServiceTool[];
  };
  onSave?: (data: ServiceData) => void;
}

interface ServiceData {
  name: string;
  description: string;
  endpoints: ServiceEndpoints;
  tools: ServiceTool[];
  workflows: string[];
}

interface Workflow {
  id: string;
  name: string;
  status: string;
}

export function ServiceBuilder({ appId, initialData, onSave }: ServiceBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name ?? generateServiceName());
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [endpoints, setEndpoints] = useState<ServiceEndpoints>(
    initialData?.endpoints ?? { mcp: true, a2a: true, rest: true }
  );
  const [tools, setTools] = useState<ServiceTool[]>(initialData?.tools ?? []);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"endpoints" | "tools" | "workflows">("endpoints");

  useEffect(() => {
    async function loadWorkflows() {
      setIsLoadingWorkflows(true);
      const response = await fetch("/api/v1/n8n/workflows");
      if (response.ok) {
        const data = await response.json();
        setAvailableWorkflows(data.workflows ?? []);
      }
      setIsLoadingWorkflows(false);
    }
    loadWorkflows();
  }, []);

  const regenerateName = () => {
    setName(generateServiceName());
  };

  const addTool = () => {
    if (!newToolName.trim()) return;
    setTools([
      ...tools,
      { name: newToolName.trim(), description: newToolDescription.trim() },
    ]);
    setNewToolName("");
    setNewToolDescription("");
  };

  const removeTool = (index: number) => {
    setTools(tools.filter((_, i) => i !== index));
  };

  const toggleWorkflow = (workflowId: string) => {
    setSelectedWorkflows((prev) =>
      prev.includes(workflowId) ? prev.filter((id) => id !== workflowId) : [...prev, workflowId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);

    const data: ServiceData = {
      name: name.trim(),
      description: description.trim(),
      endpoints,
      tools,
      workflows: selectedWorkflows,
    };

    if (onSave) {
      onSave(data);
    } else {
      const response = await fetch(appId ? `/api/v1/apps/${appId}` : "/api/v1/apps", {
        method: appId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          app_url: "https://localhost:3000",
          metadata: {
            app_type: "service",
            service_endpoints: data.endpoints,
            service_tools: data.tools,
            linked_workflows: data.workflows,
          },
          features_enabled: {
            chat: true,
            agents: true,
            embedding: true,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Failed to save service");
        setIsSaving(false);
        return;
      }

      toast.success("Service saved");
      const result = await response.json();
      if (!appId) {
        router.push(`/dashboard/apps/${result.app.id}`);
      }
    }

    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <BrandCard className="relative">
        <CornerBrackets size="sm" className="opacity-20" />
        <div className="relative z-10 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500">
                <Server className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Service Builder</h2>
                <p className="text-sm text-white/60">Configure MCP, A2A, and REST endpoints</p>
              </div>
            </div>
            <BrandButton
              variant="primary"
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Service"
              )}
            </BrandButton>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-white/80">Service Name</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter service name..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={regenerateName}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-white/80">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this service do?"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </BrandCard>

      <div className="flex gap-2">
        {[
          { key: "endpoints" as const, label: "Endpoints", icon: Globe },
          { key: "tools" as const, label: "Tools", icon: Terminal },
          { key: "workflows" as const, label: "Workflows", icon: Workflow },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              activeSection === key
                ? "bg-[#FF5800] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeSection === "endpoints" && (
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-[#FF5800]" />
              <h3 className="text-lg font-semibold text-white">Service Endpoints</h3>
            </div>

            <p className="text-sm text-white/60 mb-4">
              Configure which protocols your service will support. These settings are stored for integration planning.
            </p>

            <div className="space-y-3">
              {[
                {
                  key: "mcp" as const,
                  label: "MCP Server",
                  description: "Model Context Protocol for AI agents",
                  icon: Bot,
                  color: "from-blue-500 to-cyan-500",
                },
                {
                  key: "a2a" as const,
                  label: "A2A Protocol",
                  description: "Agent-to-Agent communication",
                  icon: Zap,
                  color: "from-purple-500 to-pink-500",
                },
                {
                  key: "rest" as const,
                  label: "REST API",
                  description: "Standard HTTP JSON API",
                  icon: Code,
                  color: "from-green-500 to-emerald-500",
                },
              ].map(({ key, label, description, icon: Icon, color }) => (
                <div
                  key={key}
                  className={cn(
                    "p-4 rounded-lg border transition-all",
                    endpoints[key]
                      ? "border-[#FF5800]/50 bg-[#FF5800]/10"
                      : "border-white/10 bg-white/5"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg bg-gradient-to-r", color)}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-white">{label}</div>
                        <div className="text-xs text-white/50">{description}</div>
                      </div>
                    </div>
                    <Switch
                      checked={endpoints[key]}
                      onCheckedChange={(checked) =>
                        setEndpoints((prev) => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Settings className="h-4 w-4 text-amber-400 mt-0.5" />
                <div className="text-sm text-amber-300">
                  <strong>Note:</strong> These settings configure service capabilities. Actual endpoint deployment requires additional setup via workflows or manual configuration.
                </div>
              </div>
            </div>
          </div>
        </BrandCard>
      )}

      {activeSection === "tools" && (
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="h-5 w-5 text-[#FF5800]" />
              <h3 className="text-lg font-semibold text-white">Service Tools</h3>
            </div>

            <p className="text-sm text-white/60 mb-4">
              Define the tools (functions) your service provides. These become callable via MCP and A2A.
            </p>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-white/70 text-sm">Tool Name</Label>
                  <Input
                    value={newToolName}
                    onChange={(e) => setNewToolName(e.target.value)}
                    placeholder="e.g., search_database"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-sm">Description</Label>
                  <Input
                    value={newToolDescription}
                    onChange={(e) => setNewToolDescription(e.target.value)}
                    placeholder="What does this tool do?"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addTool}
                disabled={!newToolName.trim()}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Tool
              </Button>
            </div>

            {tools.length === 0 ? (
              <div className="text-center py-8 text-white/40">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No tools defined yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tools.map((tool, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                  >
                    <div>
                      <code className="text-sm font-mono text-[#FF5800]">{tool.name}</code>
                      {tool.description && (
                        <p className="text-xs text-white/50 mt-0.5">{tool.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTool(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BrandCard>
      )}

      {activeSection === "workflows" && (
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-[#FF5800]" />
                <h3 className="text-lg font-semibold text-white">Linked Workflows</h3>
              </div>
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/workflows")}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Manage Workflows
              </Button>
            </div>

            <p className="text-sm text-white/60 mb-4">
              Link workflows to your service. Linked workflows can be triggered via any enabled endpoint.
            </p>

            {isLoadingWorkflows ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF5800]" />
              </div>
            ) : availableWorkflows.length === 0 ? (
              <div className="text-center py-8">
                <Workflow className="h-8 w-8 mx-auto mb-2 text-white/30" />
                <p className="text-white/40">No workflows available</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => router.push("/dashboard/workflows")}
                >
                  Create Workflow
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {availableWorkflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    onClick={() => toggleWorkflow(workflow.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
                      selectedWorkflows.includes(workflow.id)
                        ? "border-[#FF5800]/50 bg-[#FF5800]/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Workflow className={cn(
                        "h-4 w-4",
                        selectedWorkflows.includes(workflow.id) ? "text-[#FF5800]" : "text-white/50"
                      )} />
                      <span className="text-white">{workflow.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {workflow.status}
                      </Badge>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      selectedWorkflows.includes(workflow.id)
                        ? "border-[#FF5800] bg-[#FF5800]"
                        : "border-white/30"
                    )}>
                      {selectedWorkflows.includes(workflow.id) && (
                        <Check className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedWorkflows.length > 0 && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="text-sm text-green-300">
                  <strong>{selectedWorkflows.length} workflow(s)</strong> linked. 
                  These can be triggered via your service endpoints.
                </div>
              </div>
            )}
          </div>
        </BrandCard>
      )}
    </div>
  );
}
