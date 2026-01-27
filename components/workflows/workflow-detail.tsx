"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CodeViewer } from "./code-viewer";
import { ExecutionHistory, type Execution } from "./execution-history";
import {
  ArrowLeft,
  Play,
  Share2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Sparkles,
  Settings,
  Code2,
  History,
  Info,
} from "lucide-react";

interface WorkflowDetailProps {
  workflowId: string;
  onBack: () => void;
  onDeleted?: () => void;
}

interface WorkflowFull {
  id: string;
  name: string;
  description: string | null;
  userIntent: string;
  code: string;
  serviceDependencies: string[];
  executionPlan: Array<{
    step: number;
    serviceId: string;
    operation: string;
  }>;
  status: string;
  testResults: {
    syntaxValid?: boolean;
    hasErrorHandling?: boolean;
    hasTypedReturn?: boolean;
    warnings?: string[];
  };
  generationMetadata: {
    model?: string;
    iterations?: number;
    tokensUsed?: number;
    generatedAt?: string;
  };
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "live":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Live
        </Badge>
      );
    case "testing":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Testing
        </Badge>
      );
    case "shared":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Share2 className="h-3 w-3 mr-1" />
          Shared
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Settings className="h-3 w-3 mr-1" />
          Draft
        </Badge>
      );
  }
}

export function WorkflowDetail({
  workflowId,
  onBack,
  onDeleted,
}: WorkflowDetailProps) {
  const [workflow, setWorkflow] = useState<WorkflowFull | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [executeParams, setExecuteParams] = useState("{}");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch workflow details
  const fetchWorkflow = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/workflows/${workflowId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch workflow");
      }
      const data = await response.json();
      setWorkflow(data.workflow);
      setExecutions(data.executions || []);
    } catch (error) {
      console.error("Failed to fetch workflow:", error);
      toast.error("Failed to load workflow");
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Execute workflow
  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      let params = {};
      try {
        params = JSON.parse(executeParams);
      } catch {
        toast.error("Invalid JSON parameters");
        return;
      }

      const response = await fetch(`/api/v1/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Execution failed");
      }

      toast.success("Workflow executed successfully!");
      setShowExecuteDialog(false);
      fetchWorkflow(); // Refresh to get new execution
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  // Delete workflow
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/workflows/${workflowId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete workflow");
      }

      toast.success("Workflow deleted");
      onDeleted?.();
      onBack();
    } catch (error) {
      toast.error("Failed to delete workflow");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || !workflow) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="workflow-detail">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to workflow list">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              {workflow.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {workflow.description || workflow.userIntent}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {getStatusBadge(workflow.status)}
              {workflow.serviceDependencies.map((service) => (
                <Badge key={service} variant="outline" className="text-xs">
                  {service}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setShowExecuteDialog(true)}>
            <Play className="h-4 w-4 mr-2" />
            Run
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Info className="h-4 w-4 mr-1" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code2 className="h-4 w-4 mr-1" />
            Code
          </TabsTrigger>
          <TabsTrigger value="executions">
            <History className="h-4 w-4 mr-1" />
            Executions
            {executions.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {executions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{workflow.usageCount}</div>
                <p className="text-xs text-muted-foreground">Total Executions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-400">
                  {workflow.successCount}
                </div>
                <p className="text-xs text-muted-foreground">Successful</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-400">
                  {workflow.failureCount}
                </div>
                <p className="text-xs text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">
                  {workflow.successRate
                    ? `${parseFloat(workflow.successRate).toFixed(0)}%`
                    : "-"}
                </div>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Execution Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Execution Plan</CardTitle>
            </CardHeader>
            <CardContent>
              {workflow.executionPlan.length > 0 ? (
                <div className="space-y-2">
                  {workflow.executionPlan.map((step, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded bg-muted/50"
                    >
                      <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center">
                        {step.step}
                      </Badge>
                      <Badge variant="secondary">{step.serviceId}</Badge>
                      <span className="text-sm">{step.operation}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No execution plan available</p>
              )}
            </CardContent>
          </Card>

          {/* Validation Results */}
          {workflow.testResults && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Validation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {workflow.testResults.syntaxValid !== undefined && (
                    <Badge
                      variant={workflow.testResults.syntaxValid ? "default" : "destructive"}
                      className={workflow.testResults.syntaxValid ? "bg-green-500/20 text-green-400" : ""}
                    >
                      {workflow.testResults.syntaxValid ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : (
                        <AlertCircle className="h-3 w-3 mr-1" />
                      )}
                      Syntax
                    </Badge>
                  )}
                  {workflow.testResults.hasErrorHandling !== undefined && (
                    <Badge
                      variant={workflow.testResults.hasErrorHandling ? "default" : "secondary"}
                      className={workflow.testResults.hasErrorHandling ? "bg-green-500/20 text-green-400" : ""}
                    >
                      Error Handling
                    </Badge>
                  )}
                  {workflow.testResults.hasTypedReturn !== undefined && (
                    <Badge
                      variant={workflow.testResults.hasTypedReturn ? "default" : "secondary"}
                      className={workflow.testResults.hasTypedReturn ? "bg-green-500/20 text-green-400" : ""}
                    >
                      Typed Return
                    </Badge>
                  )}
                </div>
                {workflow.testResults.warnings && workflow.testResults.warnings.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {workflow.testResults.warnings.map((warning, i) => (
                      <p key={i} className="text-xs text-yellow-400">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="code">
          <CodeViewer code={workflow.code} language="typescript" maxHeight="600px" />
        </TabsContent>

        <TabsContent value="executions">
          <ExecutionHistory executions={executions} />
        </TabsContent>
      </Tabs>

      {/* Execute Dialog */}
      <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Workflow</DialogTitle>
            <DialogDescription>
              Execute this workflow with optional parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Parameters (JSON)</label>
              <Textarea
                value={executeParams}
                onChange={(e) => setExecuteParams(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-sm"
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Provide any input parameters as JSON.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExecuteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExecute} disabled={isExecuting}>
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
