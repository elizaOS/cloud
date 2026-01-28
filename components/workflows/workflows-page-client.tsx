"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkflowList, type Workflow } from "./workflow-list";
import { WorkflowGenerator } from "./workflow-generator";
import { WorkflowDetail } from "./workflow-detail";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Plus,
  Sparkles,
  Filter,
} from "lucide-react";

interface ServiceStatus {
  serviceId: string;
  connected: boolean;
  scopes?: string[];
}

type ViewMode = "list" | "detail" | "create";

export function WorkflowsPageClient() {
  // Workflows state
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectedServices, setConnectedServices] = useState<ServiceStatus[]>([]);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const response = await fetch(`/api/v1/workflows?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch workflows");
      }

      const data = await response.json();
      setWorkflows(data.workflows || []);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
      toast.error("Failed to load workflows");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  // Fetch connected services for the generator
  const fetchConnectedServices = useCallback(async () => {
    try {
      // Fetch status from each service endpoint
      const [googleRes, twilioRes, blooioRes] = await Promise.allSettled([
        fetch("/api/v1/google/status"),
        fetch("/api/v1/twilio/status"),
        fetch("/api/v1/blooio/status"),
      ]);

      const services: ServiceStatus[] = [];

      // Parse Google status
      if (googleRes.status === "fulfilled" && googleRes.value.ok) {
        const data = await googleRes.value.json();
        services.push({
          serviceId: "google",
          connected: data.connected || false,
          scopes: data.scopes,
        });
      } else {
        services.push({ serviceId: "google", connected: false });
      }

      // Parse Twilio status
      if (twilioRes.status === "fulfilled" && twilioRes.value.ok) {
        const data = await twilioRes.value.json();
        services.push({
          serviceId: "twilio",
          connected: data.connected || false,
        });
      } else {
        services.push({ serviceId: "twilio", connected: false });
      }

      // Parse Blooio status
      if (blooioRes.status === "fulfilled" && blooioRes.value.ok) {
        const data = await blooioRes.value.json();
        services.push({
          serviceId: "blooio",
          connected: data.connected || false,
        });
      } else {
        services.push({ serviceId: "blooio", connected: false });
      }

      // Add Notion (not implemented yet)
      services.push({ serviceId: "notion", connected: false });

      setConnectedServices(services);
    } catch (error) {
      console.error("Failed to fetch service status:", error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchWorkflows();
    fetchConnectedServices();
  }, [fetchWorkflows, fetchConnectedServices]);

  // Handle workflow actions
  const handleView = (workflow: Workflow) => {
    setSelectedWorkflowId(workflow.id);
    setViewMode("detail");
  };

  const handleExecute = async (workflow: Workflow) => {
    try {
      const response = await fetch(`/api/v1/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: {} }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Execution failed");
      }

      toast.success("Workflow executed successfully!");
      fetchWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Execution failed");
    }
  };

  const handleDelete = async (workflow: Workflow) => {
    if (!confirm(`Delete workflow "${workflow.name}"?`)) return;

    try {
      const response = await fetch(`/api/v1/workflows/${workflow.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete workflow");
      }

      toast.success("Workflow deleted");
      fetchWorkflows();
    } catch (error) {
      toast.error("Failed to delete workflow");
    }
  };

  const handleShare = async (workflow: Workflow) => {
    try {
      const response = await fetch(`/api/v1/workflows/${workflow.id}/share`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to share workflow");
      }

      toast.success("Workflow shared as MCP!");
      fetchWorkflows();
    } catch (error) {
      toast.error("Failed to share workflow");
    }
  };

  const handleGenerated = (workflow: { id: string }) => {
    setShowCreateDialog(false);
    setSelectedWorkflowId(workflow.id);
    setViewMode("detail");
    fetchWorkflows();
  };

  // Render detail view
  if (viewMode === "detail" && selectedWorkflowId) {
    return (
      <div className="container mx-auto py-8">
        <WorkflowDetail
          workflowId={selectedWorkflowId}
          onBack={() => {
            setViewMode("list");
            setSelectedWorkflowId(null);
          }}
          onDeleted={() => {
            fetchWorkflows();
          }}
        />
      </div>
    );
  }

  // Render list view
  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Workflow Studio
          </h1>
          <p className="text-muted-foreground mt-1">
            Create AI-powered workflows using natural language. Automate tasks across your connected services.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchWorkflows()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            data-testid="create-workflow-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="shared">Shared</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary">
          {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Workflow List */}
      <WorkflowList
        workflows={workflows}
        onView={handleView}
        onExecute={handleExecute}
        onDelete={handleDelete}
        onShare={handleShare}
        onCreate={() => setShowCreateDialog(true)}
        isLoading={isLoading}
      />

      {/* Create Dialog */}
      <Dialog 
        open={showCreateDialog} 
        onOpenChange={(open) => {
          setShowCreateDialog(open);
        }}
      >
        <DialogContent 
          className="max-w-2xl"
          onPointerDownOutside={(e) => {
            // Prevent closing when clicking inside the dialog
            e.preventDefault();
          }}
        >
          <WorkflowGenerator
            connectedServices={connectedServices}
            onGenerated={handleGenerated}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
