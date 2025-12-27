/**
 * Fragment Projects Table Component
 *
 * Displays fragment projects in a table format with actions
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { FragmentProject } from "@/db/schemas/fragment-projects";
import {
  Code,
  Rocket,
  MoreVertical,
  Edit,
  Trash2,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface FragmentProjectsTableProps {
  projects: FragmentProject[];
}

export function FragmentProjectsTable({
  projects,
}: FragmentProjectsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const router = useRouter();

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/fragments/projects/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete project");
      }

      toast.success("Project deleted");
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-4">
          <Code className="h-8 w-8 text-white/40" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          No projects yet
        </h3>
        <p className="text-white/60 mb-4">
          Create your first fragment project to get started
        </p>
        <Button onClick={() => router.push("/dashboard/fragments")}>
          Create Fragment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {projects.map((project) => (
        <div
          key={project.id}
          className="group relative flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-white/5 hover:bg-white/[0.07] rounded-lg border border-white/10 hover:border-white/20 transition-all gap-3 sm:gap-0"
        >
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            {/* Project Icon */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-[#FF5800] to-purple-600 flex items-center justify-center">
                <Code className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>

            {/* Project Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                <Link
                  href={`/dashboard/fragments/projects/${project.id}`}
                  className="text-sm sm:text-base text-white font-semibold hover:text-[#FF5800] transition-colors truncate"
                >
                  {project.name}
                </Link>
                <Badge
                  variant={
                    project.status === "deployed"
                      ? "default"
                      : project.status === "draft"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-[10px] sm:text-xs w-fit"
                >
                  {project.status}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-white/60 truncate">
                {project.description || `Template: ${project.template}`}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 text-[10px] sm:text-xs text-white/40">
                <span>
                  {formatDistanceToNow(new Date(project.updated_at), {
                    addSuffix: true,
                  })}
                </span>
                {project.deployed_app_id && (
                  <Link
                    href={`/dashboard/apps/${project.deployed_app_id}`}
                    className="flex items-center gap-1 hover:text-[#FF5800] transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">View App</span>
                    <span className="sm:hidden">App</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 justify-end sm:justify-start">
            {project.status === "draft" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(
                    `/dashboard/fragments/projects/${project.id}/deploy`,
                  )
                }
                className="text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
              >
                <Rocket className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Deploy</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 sm:h-9 sm:w-9"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => copyToClipboard(project.id, project.id)}
                  className="text-xs sm:text-sm"
                >
                  {copiedId === project.id ? (
                    <>
                      <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      Copy ID
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/dashboard/fragments/projects/${project.id}`)
                  }
                  className="text-xs sm:text-sm"
                >
                  <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleDelete(project.id)}
                  className="text-red-400 text-xs sm:text-sm"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
