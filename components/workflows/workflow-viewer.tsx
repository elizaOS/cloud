"use client";

import { useState, useEffect, useCallback } from "react";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  ArrowLeft,
  Copy,
  Play,
  History,
  Settings,
  Code,
  Activity,
  Zap,
  Sparkles,
} from "lucide-react";
import { WorkflowChatEditor } from "./workflow-chat-editor";
import { WorkflowTriggers } from "./workflow-triggers";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  tags: string[];
  workflowData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowVersion {
  id: string;
  version: number;
  changes_summary: string | null;
  created_at: string;
}

interface Execution {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

interface WorkflowViewerProps {
  workflowId: string;
  onBack: () => void;
  onTest: (workflow: Workflow) => void;
}

export function WorkflowViewer({ workflowId, onBack, onTest }: WorkflowViewerProps) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [showChatEditor, setShowChatEditor] = useState(false);

  useEffect(() => {
    async function fetchWorkflow() {
      try {
        const response = await fetch(`/api/v1/n8n/workflows/${workflowId}`);
        if (!response.ok) throw new Error("Failed to fetch workflow");
        const data = await response.json();
        setWorkflow(data.workflow);
      } catch (error) {
        toast.error("Failed to load workflow");
      } finally {
        setIsLoading(false);
      }
    }

    fetchWorkflow();
  }, [workflowId]);

  const fetchVersions = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/n8n/workflows/${workflowId}/versions`);
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      }
    } catch {}
  }, [workflowId]);

  const fetchExecutions = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/n8n/workflows/${workflowId}/executions`);
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
      }
    } catch {}
  }, [workflowId]);

  useEffect(() => {
    if (activeTab === "versions" && workflow) {
      fetchVersions();
    } else if (activeTab === "executions" && workflow) {
      fetchExecutions();
    }
  }, [activeTab, workflow, fetchVersions, fetchExecutions]);

  function copyWorkflowJson() {
    if (workflow?.workflowData) {
      navigator.clipboard.writeText(JSON.stringify(workflow.workflowData, null, 2));
      toast.success("Workflow JSON copied to clipboard");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="text-center py-12">
        <p className="text-white/60">Workflow not found</p>
        <Button variant="ghost" onClick={onBack} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  function handleWorkflowUpdated(updatedWorkflow: Workflow) {
    setWorkflow(updatedWorkflow);
    fetchVersions();
  }

  if (showChatEditor) {
    return (
      <div className="h-[calc(100vh-200px)]">
        <WorkflowChatEditor
          workflow={workflow}
          onWorkflowUpdated={handleWorkflowUpdated}
          onBack={() => setShowChatEditor(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-white">{workflow.name}</h2>
              <Badge
                variant="outline"
                className={`text-xs ${
                  workflow.status === "active"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : workflow.status === "archived"
                    ? "bg-gray-500/20 text-gray-400 border-gray-500/30"
                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                }`}
              >
                {workflow.status}
              </Badge>
              <span className="text-xs text-white/40">v{workflow.version}</span>
            </div>
            {workflow.description && (
              <p className="text-sm text-white/60 mt-1">{workflow.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BrandButton variant="secondary" onClick={() => setShowChatEditor(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Edit with AI
          </BrandButton>
          <BrandButton variant="primary" onClick={() => onTest(workflow)}>
            <Play className="h-4 w-4 mr-2" />
            Test Workflow
          </BrandButton>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-[#FF5800]">
            <Settings className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="triggers" className="data-[state=active]:bg-[#FF5800]">
            <Zap className="h-4 w-4 mr-2" />
            Triggers
          </TabsTrigger>
          <TabsTrigger value="code" className="data-[state=active]:bg-[#FF5800]">
            <Code className="h-4 w-4 mr-2" />
            JSON
          </TabsTrigger>
          <TabsTrigger value="versions" className="data-[state=active]:bg-[#FF5800]">
            <History className="h-4 w-4 mr-2" />
            Versions
          </TabsTrigger>
          <TabsTrigger value="executions" className="data-[state=active]:bg-[#FF5800]">
            <Activity className="h-4 w-4 mr-2" />
            Executions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <BrandCard>
              <CornerBrackets size="sm" className="opacity-20" />
              <div className="relative z-10 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-white">Workflow Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Created</span>
                    <span className="text-white/80">
                      {formatDistanceToNow(new Date(workflow.createdAt))} ago
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Last Updated</span>
                    <span className="text-white/80">
                      {formatDistanceToNow(new Date(workflow.updatedAt))} ago
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Version</span>
                    <span className="text-white/80">{workflow.version}</span>
                  </div>
                </div>
              </div>
            </BrandCard>

            <BrandCard>
              <CornerBrackets size="sm" className="opacity-20" />
              <div className="relative z-10 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-white">Workflow Nodes</h3>
                <div className="space-y-2">
                  {Array.isArray(workflow.workflowData?.nodes) ? (
                    (workflow.workflowData.nodes as Array<{name: string; type: string}>).map((node, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                        <span className="text-sm text-white/80">{node.name}</span>
                        <span className="text-xs text-white/40 ml-auto">
                          {node.type}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/40">No nodes defined</p>
                  )}
                </div>
              </div>
            </BrandCard>
          </div>
        </TabsContent>

        <TabsContent value="triggers" className="mt-6">
          <WorkflowTriggers workflowId={workflowId} workflowName={workflow.name} />
        </TabsContent>

        <TabsContent value="code" className="mt-6">
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Workflow JSON</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyWorkflowJson}
                  className="text-white/60 hover:text-white"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>
              <div className="bg-black/30 rounded-lg p-4 overflow-auto max-h-[500px]">
                <pre className="text-sm text-white/80 font-mono">
                  {JSON.stringify(workflow.workflowData, null, 2)}
                </pre>
              </div>
            </div>
          </BrandCard>
        </TabsContent>

        <TabsContent value="versions" className="mt-6">
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Version History</h3>
              {versions.length > 0 ? (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#FF5800]/20 flex items-center justify-center">
                          <span className="text-sm text-[#FF5800]">v{version.version}</span>
                        </div>
                        <div>
                          <p className="text-sm text-white/80">
                            {version.changes_summary || "No summary"}
                          </p>
                          <p className="text-xs text-white/40">
                            {formatDistanceToNow(new Date(version.created_at))} ago
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40 text-center py-8">
                  No version history available
                </p>
              )}
            </div>
          </BrandCard>
        </TabsContent>

        <TabsContent value="executions" className="mt-6">
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Execution History</h3>
              {executions.length > 0 ? (
                <div className="space-y-3">
                  {executions.map((execution) => (
                    <div
                      key={execution.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            execution.status === "completed"
                              ? "bg-green-400"
                              : execution.status === "failed"
                              ? "bg-red-400"
                              : "bg-yellow-400"
                          }`}
                        />
                        <div>
                          <p className="text-sm text-white/80">
                            {execution.status.charAt(0).toUpperCase() +
                              execution.status.slice(1)}
                          </p>
                          <p className="text-xs text-white/40">
                            {formatDistanceToNow(new Date(execution.started_at))} ago
                            {execution.duration_ms && ` • ${execution.duration_ms}ms`}
                          </p>
                        </div>
                      </div>
                      {execution.error && (
                        <span className="text-xs text-red-400 truncate max-w-[200px]">
                          {execution.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40 text-center py-8">
                  No executions yet
                </p>
              )}
            </div>
          </BrandCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

