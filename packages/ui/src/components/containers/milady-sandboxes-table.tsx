/**
 * Milady Sandboxes Table — lists AI agent sandboxes in the containers dashboard.
 * Distinguishes between Docker-backed (node_id set) and Vercel-backed sandboxes.
 * Keeps the user-facing surface focused on Milady actions instead of raw infra.
 */
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@elizaos/ui";
import {
  ArrowUpDown,
  Boxes,
  Cloud,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { openWebUIWithPairing } from "@/lib/hooks/open-web-ui";
import { useJobPoller } from "@/lib/hooks/use-job-poller";
import { getClientSafeMiladyAgentWebUiUrl } from "@/lib/milady-web-ui";
import { CreateMiladySandboxDialog } from "./create-milady-sandbox-dialog";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface MiladySandboxRow {
  id: string;
  agent_name: string | null;
  status: string;
  canonical_web_ui_url?: string | null;
  // Docker fields
  node_id: string | null;
  container_name: string | null;
  bridge_port: number | null;
  web_ui_port: number | null;
  headscale_ip: string | null;
  docker_image: string | null;
  // Vercel fields
  sandbox_id: string | null;
  bridge_url: string | null;
  // Common
  error_message: string | null;
  last_heartbeat_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MiladySandboxesTableProps {
  sandboxes: MiladySandboxRow[];
}

// ----------------------------------------------------------------
// Status helpers
// ----------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  running: "bg-green-500 hover:bg-green-600",
  provisioning: "bg-blue-500 hover:bg-blue-600",
  pending: "bg-yellow-500 hover:bg-yellow-600",
  stopped: "bg-gray-500 hover:bg-gray-600",
  disconnected: "bg-orange-500 hover:bg-orange-600",
  error: "bg-red-500 hover:bg-red-600",
};

const STATUS_DOTS: Record<string, string> = {
  running: "🟢",
  provisioning: "🔵",
  pending: "🟡",
  stopped: "⚫",
  disconnected: "🟠",
  error: "🔴",
};

function statusColor(status: string) {
  return STATUS_COLORS[status] ?? "bg-gray-500";
}
function statusDot(status: string) {
  return STATUS_DOTS[status] ?? "⚪";
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function isDockerBacked(sb: MiladySandboxRow): boolean {
  return !!sb.node_id;
}

function getConnectUrl(sb: MiladySandboxRow): string | null {
  return getClientSafeMiladyAgentWebUiUrl({
    ...sb,
    canonicalWebUiUrl: sb.canonical_web_ui_url,
  });
}

function formatRelative(date: Date | string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------

export function MiladySandboxesTable({ sandboxes }: MiladySandboxesTableProps) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const poller = useJobPoller({
    onComplete: () => toast.success("Agent provisioning completed"),
    onFailed: (job) => toast.error(job.error ?? "Provisioning failed"),
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"name" | "status" | "created">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (field: typeof sortField) => {
    setSortDir((prev) => (sortField === field && prev === "asc" ? "desc" : "asc"));
    setSortField(field);
  };

  const filtered = useMemo(() => {
    let list = sandboxes.filter((sb) => {
      const q = searchQuery.toLowerCase();
      const displayStatus = poller.isActive(sb.id) ? "provisioning" : sb.status;
      const matchSearch =
        !q ||
        (sb.agent_name ?? "").toLowerCase().includes(q) ||
        (sb.container_name ?? "").toLowerCase().includes(q) ||
        (sb.node_id ?? "").toLowerCase().includes(q) ||
        (sb.headscale_ip ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || displayStatus === statusFilter;
      return matchSearch && matchStatus;
    });

    list.sort((a, b) => {
      let cmp = 0;
      const aStatus = poller.isActive(a.id) ? "provisioning" : a.status;
      const bStatus = poller.isActive(b.id) ? "provisioning" : b.status;
      if (sortField === "name") {
        cmp = (a.agent_name ?? "").localeCompare(b.agent_name ?? "");
      } else if (sortField === "status") {
        cmp = aStatus.localeCompare(bStatus);
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sandboxes, searchQuery, statusFilter, sortField, sortDir, poller.isActive]);

  // ── Actions ──────────────────────────────────────────────────────

  async function handleProvision(id: string) {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/v1/milady/agents/${id}/provision`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        const jobId = (data as { data?: { jobId?: string } }).data?.jobId;
        if (jobId) {
          poller.track(id, jobId);
          toast.info("Provisioning already in progress");
          return;
        }
      }

      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Provision failed");
      }

      if (res.status === 202) {
        const jobId = (data as { data?: { jobId?: string } }).data?.jobId;
        if (jobId) {
          poller.track(id, jobId);
          toast.success("Agent provisioning queued");
          return;
        }

        toast.success("Agent provisioning started");
        router.refresh();
        return;
      }

      toast.success("Agent is already running");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to start agent: ${message}`);
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleSuspend(id: string) {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/v1/milady/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend" }),
      });
      if (!res.ok) throw new Error("Suspend failed");
      toast.success("Agent suspended (snapshot saved)");
      router.refresh();
    } catch {
      toast.error("Failed to suspend agent");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleDelete(id: string) {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/milady/agents/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Delete failed");
      }
      toast.success("Agent deleted");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete agent";
      toast.error(message);
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  }

  const deleteTargetBusy = deleteId ? poller.isActive(deleteId) : false;

  if (sandboxes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <Boxes className="h-10 w-10 text-neutral-600" />
        <div className="space-y-1">
          <p className="text-white font-medium">No Milady sandboxes yet</p>
          <p className="text-sm text-neutral-500 max-w-xs">
            Create your first sandbox, then provision it from the dashboard.
          </p>
        </div>
        <CreateMiladySandboxDialog
          onProvisionQueued={(agentId, jobId) => poller.track(agentId, jobId)}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search agents or IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-lg border-white/10 bg-black/40 text-white placeholder:text-neutral-500 focus-visible:ring-[#FF5800]/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px] h-10 rounded-lg border-white/10 bg-black/40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="rounded-lg border-white/10 bg-neutral-900">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="provisioning">Provisioning</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
              <SelectItem value="disconnected">Disconnected</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <CreateMiladySandboxDialog
            onProvisionQueued={(agentId, jobId) => poller.track(agentId, jobId)}
          />
        </div>

        {(searchQuery || statusFilter !== "all") && (
          <p className="text-sm text-neutral-500">
            Showing {filtered.length} of {sandboxes.length} agents
          </p>
        )}

        {/* Table */}
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-black/40 border-b border-white/10">
                <TableHead>
                  <button
                    onClick={() => handleSort("name")}
                    className="flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Agent
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => handleSort("status")}
                    className="flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Status
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-xs font-medium text-neutral-400">Runtime</TableHead>
                <TableHead className="text-xs font-medium text-neutral-400">Web UI</TableHead>
                <TableHead>
                  <button
                    onClick={() => handleSort("created")}
                    className="flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Created
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right text-xs font-medium text-neutral-400">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-neutral-500">
                      <Boxes className="h-8 w-8 mb-2" />
                      <p>No agents match your filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sb) => {
                  const isDocker = isDockerBacked(sb);
                  const connectUrl = getConnectUrl(sb);
                  const trackedJob = poller.getStatus(sb.id);
                  const isProvisioning = poller.isActive(sb.id);
                  const displayStatus = isProvisioning ? "provisioning" : sb.status;
                  const busy = actionInProgress === sb.id || isProvisioning;
                  const canStart =
                    ["stopped", "error", "pending", "disconnected"].includes(displayStatus) &&
                    !busy;
                  const canStop = displayStatus === "running" && !busy;

                  return (
                    <TableRow
                      key={sb.id}
                      className="hover:bg-white/5 transition-colors border-b border-white/5"
                    >
                      {/* Agent name + type badge */}
                      <TableCell>
                        <div className="space-y-1.5">
                          <Link
                            href={`/dashboard/containers/agents/${sb.id}`}
                            className="font-medium text-white hover:text-[#FF5800] transition-colors"
                          >
                            {sb.agent_name ?? "Unnamed Agent"}
                          </Link>
                          <div className="flex items-center gap-1.5">
                            {isDocker ? (
                              <Badge
                                variant="outline"
                                className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px] px-1.5 py-0 flex items-center gap-1"
                              >
                                <Server className="h-2.5 w-2.5" />
                                Docker
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-purple-500/40 text-purple-400 bg-purple-500/10 text-[10px] px-1.5 py-0 flex items-center gap-1"
                              >
                                <Cloud className="h-2.5 w-2.5" />
                                Sandbox
                              </Badge>
                            )}
                            <span className="text-xs text-neutral-600 font-mono truncate max-w-[120px]">
                              {sb.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Badge
                            variant="outline"
                            className={`${statusColor(displayStatus)} text-white border-none w-fit rounded-md text-xs`}
                          >
                            {statusDot(displayStatus)} {displayStatus}
                          </Badge>
                          {isProvisioning && trackedJob && (
                            <span className="text-[10px] text-blue-400 flex items-center gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              Starting, job {trackedJob.jobId.slice(0, 8)}
                            </span>
                          )}
                          {sb.error_message && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-xs text-red-500 truncate max-w-[180px] cursor-help">
                                  {sb.error_message}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs bg-neutral-900 border-white/10">
                                <p>{sb.error_message}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>

                      {/* Runtime */}
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5 text-neutral-300">
                            {isDocker ? (
                              <>
                                <Server className="h-3 w-3 text-blue-400 shrink-0" />
                                <span>Managed runtime</span>
                              </>
                            ) : (
                              <>
                                <Cloud className="h-3 w-3 text-purple-400 shrink-0" />
                                <span>Cloud sandbox</span>
                              </>
                            )}
                          </div>
                          <p className="text-neutral-500">
                            {isDocker
                              ? "Private Milady infrastructure"
                              : sb.sandbox_id
                                ? "Provisioned sandbox"
                                : "No sandbox yet"}
                          </p>
                        </div>
                      </TableCell>

                      {/* Web UI */}
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          {connectUrl && displayStatus === "running" ? (
                            <button
                              onClick={() => openWebUIWithPairing(sb.id)}
                              className="inline-flex items-center gap-1 text-[#FF5800] hover:text-[#FF5800]/80 transition-colors cursor-pointer bg-transparent border-0 p-0 text-xs"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open Web UI
                            </button>
                          ) : displayStatus === "running" ? (
                            <span className="text-neutral-500">Web UI unavailable</span>
                          ) : (
                            <span className="text-neutral-600">Start agent to open</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Created */}
                      <TableCell>
                        <div className="text-sm">
                          <div className="text-white">{formatRelative(sb.created_at)}</div>
                          {sb.last_heartbeat_at && (
                            <div className="text-xs text-neutral-500">
                              Heartbeat {formatRelative(sb.last_heartbeat_at)}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* Details */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link href={`/dashboard/containers/agents/${sb.id}`}>
                                <button className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                                  <FileText className="h-4 w-4" />
                                </button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent className="bg-neutral-900 border-white/10">
                              View details
                            </TooltipContent>
                          </Tooltip>

                          {/* Connect via pairing token */}
                          {connectUrl && displayStatus === "running" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => openWebUIWithPairing(sb.id)}
                                  className="p-2 text-neutral-400 hover:text-[#FF5800] hover:bg-[#FF5800]/10 rounded-lg transition-colors"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-neutral-900 border-white/10">
                                Open Web UI
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Resume */}
                          {canStart && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleProvision(sb.id)}
                                  disabled={busy}
                                  className="p-2 text-neutral-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  <Play className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-neutral-900 border-white/10">
                                Resume agent
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Suspend */}
                          {canStop && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleSuspend(sb.id)}
                                  disabled={busy}
                                  className="p-2 text-neutral-400 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  <Pause className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-neutral-900 border-white/10">
                                Suspend agent (saves snapshot)
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Delete */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => !busy && setDeleteId(sb.id)}
                                disabled={isDeleting || busy}
                                className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-neutral-900 border-white/10">
                              Delete agent
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-neutral-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Agent</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              {deleteTargetBusy
                ? "This agent is still provisioning. Wait for the job to finish before deleting it."
                : "This will delete the agent record and stop any running container. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-white hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && !deleteTargetBusy && handleDelete(deleteId)}
              disabled={isDeleting || deleteTargetBusy}
              className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
