"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Play,
  Pause,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { type Workflow, getStatusColor } from "./types";

interface WorkflowListProps {
  onSelect?: (workflow: Workflow) => void;
  onTest?: (workflow: Workflow) => void;
}

export function WorkflowList({ onSelect, onTest }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function fetchWorkflows() {
    try {
      const response = await fetch("/api/v1/n8n/workflows");
      if (!response.ok) {
        throw new Error("Failed to fetch workflows");
      }
      const data = await response.json();
      setWorkflows(data.workflows || []);
    } catch (error) {
      toast.error("Failed to load workflows");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    fetchWorkflows();
  }, []);

  async function handleRefresh() {
    setIsRefreshing(true);
    await fetchWorkflows();
  }

  async function handleDelete(workflow: Workflow) {
    if (!confirm(`Delete workflow "${workflow.name}"?`)) return;

    try {
      const response = await fetch(`/api/v1/n8n/workflows/${workflow.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete workflow");
      }

      setWorkflows(workflows.filter((w) => w.id !== workflow.id));
      toast.success("Workflow deleted");
    } catch (error) {
      toast.error("Failed to delete workflow");
    }
  }

  async function handleStatusChange(workflow: Workflow, status: "active" | "archived") {
    try {
      const response = await fetch(`/api/v1/n8n/workflows/${workflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update workflow");
      }

      setWorkflows(
        workflows.map((w) =>
          w.id === workflow.id ? { ...w, status } : w
        )
      );
      toast.success(`Workflow ${status === "active" ? "activated" : "archived"}`);
    } catch (error) {
      toast.error("Failed to update workflow");
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "archived":
        return <XCircle className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
    }
  }


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <BrandCard>
        <CornerBrackets size="sm" className="opacity-20" />
        <div className="relative z-10 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-white/40" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No workflows yet</h3>
          <p className="text-sm text-white/60 mb-6">
            Generate your first workflow using the AI generator above
          </p>
        </div>
      </BrandCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Your Workflows</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-white/60 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {workflows.map((workflow) => (
          <BrandCard key={workflow.id} className="group">
            <CornerBrackets size="sm" className="opacity-10 group-hover:opacity-20 transition-opacity" />
            <div className="relative z-10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(workflow.status)}
                    <h4 className="text-base font-medium text-white truncate">
                      {workflow.name}
                    </h4>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(workflow.status)}`}
                    >
                      {workflow.status}
                    </Badge>
                    <span className="text-xs text-white/40">v{workflow.version}</span>
                  </div>

                  {workflow.description && (
                    <p className="text-sm text-white/60 mb-3 line-clamp-2">
                      {workflow.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-white/40">
                    <span>
                      Updated {formatDistanceToNow(new Date(workflow.updatedAt))} ago
                    </span>
                    {workflow.isActiveInN8n && (
                      <span className="text-green-400">
                        Active in n8n
                      </span>
                    )}
                  </div>

                  {workflow.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {workflow.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs rounded-full bg-white/5 text-white/60"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect?.(workflow)}
                    className="text-white/60 hover:text-white"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTest?.(workflow)}
                    className="text-white/60 hover:text-white"
                  >
                    <Play className="h-4 w-4" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white/60 hover:text-white"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#1A1A1A] border-white/10">
                      <DropdownMenuItem
                        onClick={() => onSelect?.(workflow)}
                        className="text-white/80 hover:text-white focus:text-white"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onTest?.(workflow)}
                        className="text-white/80 hover:text-white focus:text-white"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Test Workflow
                      </DropdownMenuItem>
                      {workflow.status === "active" ? (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(workflow, "archived")}
                          className="text-white/80 hover:text-white focus:text-white"
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(workflow, "active")}
                          className="text-white/80 hover:text-white focus:text-white"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Activate
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDelete(workflow)}
                        className="text-red-400 hover:text-red-300 focus:text-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </BrandCard>
        ))}
      </div>
    </div>
  );
}

