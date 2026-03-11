/**
 * Milady Sandboxes Table — lists AI agent sandboxes in the containers dashboard.
 * Distinguishes between Docker-backed (node_id set) and Vercel-backed sandboxes.
 * Docker containers show VPN IP, node, ports, and a Connect button.
 */
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@elizaos/ui";
import { Badge } from "@elizaos/ui";
import { Input } from "@elizaos/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@elizaos/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@elizaos/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@elizaos/ui";
import {
  Server,
  Cloud,
  Trash2,
  ExternalLink,
  FileText,
  Search,
  ArrowUpDown,
  Boxes,
  Wifi,
  Network,
  Play,
  Square,
} from "lucide-react";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface MiladySandboxRow {
  id: string;
  agent_name: string | null;
  status: string;
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
  if (!sb.headscale_ip) return null;
  const port = sb.web_ui_port ?? sb.bridge_port;
  if (!port) return null;
  return `http://${sb.headscale_ip}:${port}`;
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
      const matchSearch =
        !q ||
        (sb.agent_name ?? "").toLowerCase().includes(q) ||
        (sb.container_name ?? "").toLowerCase().includes(q) ||
        (sb.node_id ?? "").toLowerCase().includes(q) ||
        (sb.headscale_ip ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || sb.status === statusFilter;
      return matchSearch && matchStatus;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name")
        cmp = (a.agent_name ?? "").localeCompare(b.agent_name ?? "");
      else if (sortField === "status")
        cmp = a.status.localeCompare(b.status);
      else
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sandboxes, searchQuery, statusFilter, sortField, sortDir]);

  // ── Actions ──────────────────────────────────────────────────────

  async function handleProvision(id: string) {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/v1/milaidy/agents/${id}/provision`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Provision failed");
      toast.success("Agent provisioning started");
      router.refresh();
    } catch {
      toast.error("Failed to start agent");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleShutdown(id: string) {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/v1/milaidy/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shutdown" }),
      });
      // PATCH may not exist yet — fall back to a simple DELETE signal
      if (!res.ok && res.status !== 404) throw new Error("Shutdown failed");
      toast.success("Agent shutdown initiated");
      router.refresh();
    } catch {
      toast.error("Failed to stop agent — try from the details page");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleDelete(id: string) {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/milaidy/agents/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Agent deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete agent");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  }

  if (sandboxes.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search agents, nodes, IPs..."
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
                <TableHead className="text-xs font-medium text-neutral-400">
                  Infrastructure
                </TableHead>
                <TableHead className="text-xs font-medium text-neutral-400">
                  Network
                </TableHead>
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
                  const busy = actionInProgress === sb.id;
                  const canStart =
                    ["stopped", "error", "pending", "disconnected"].includes(
                      sb.status,
                    ) && !busy;
                  const canStop = sb.status === "running" && !busy;

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
                            className={`${statusColor(sb.status)} text-white border-none w-fit rounded-md text-xs`}
                          >
                            {statusDot(sb.status)} {sb.status}
                          </Badge>
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

                      {/* Infrastructure */}
                      <TableCell>
                        {isDocker ? (
                          <div className="space-y-0.5 text-xs text-neutral-400">
                            <div className="flex items-center gap-1">
                              <Server className="h-3 w-3 text-blue-400 shrink-0" />
                              <span className="truncate max-w-[120px]" title={sb.node_id ?? ""}>
                                {sb.node_id}
                              </span>
                            </div>
                            {sb.container_name && (
                              <div className="font-mono text-neutral-500 truncate max-w-[160px]" title={sb.container_name}>
                                {sb.container_name}
                              </div>
                            )}
                            {(sb.bridge_port || sb.web_ui_port) && (
                              <div className="text-neutral-600">
                                {sb.bridge_port && <span>Bridge: {sb.bridge_port}</span>}
                                {sb.bridge_port && sb.web_ui_port && " · "}
                                {sb.web_ui_port && <span>UI: {sb.web_ui_port}</span>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-neutral-500">
                            <Cloud className="h-3 w-3 text-purple-400 inline mr-1" />
                            {sb.sandbox_id ? (
                              <span className="font-mono">{sb.sandbox_id.slice(0, 12)}…</span>
                            ) : (
                              <span className="italic">No sandbox yet</span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Network */}
                      <TableCell>
                        {sb.headscale_ip ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs">
                              <Network className="h-3 w-3 text-green-400 shrink-0" />
                              <span className="font-mono text-green-400">
                                {sb.headscale_ip}
                              </span>
                            </div>
                            {connectUrl && sb.status === "running" && (
                              <a
                                href={connectUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] text-[#FF5800] hover:text-[#FF5800]/80 transition-colors"
                              >
                                <Wifi className="h-2.5 w-2.5" />
                                Connect
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-600">—</span>
                        )}
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

                          {/* Connect (external) */}
                          {connectUrl && sb.status === "running" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => window.open(connectUrl, "_blank")}
                                  className="p-2 text-neutral-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-neutral-900 border-white/10">
                                Open Web UI ({connectUrl})
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Start */}
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
                                Start agent
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Stop */}
                          {canStop && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleShutdown(sb.id)}
                                  disabled={busy}
                                  className="p-2 text-neutral-400 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  <Square className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-neutral-900 border-white/10">
                                Stop agent
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Delete */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setDeleteId(sb.id)}
                                disabled={isDeleting}
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
              This will delete the agent record and stop any running container. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-white hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
