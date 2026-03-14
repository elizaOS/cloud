"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useSetPageHeader,
} from "@elizaos/ui";
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Edit,
  Eye,
  FileText,
  HardDrive,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DockerNode {
  id: string;
  nodeId: string;
  hostname: string;
  sshPort: number;
  sshUser: string;
  capacity: number;
  allocatedCount: number;
  availableSlots: number;
  enabled: boolean;
  status: "healthy" | "offline" | "degraded" | "unknown";
  lastHealthCheck: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface DockerContainer {
  id: string;
  sandboxId: string;
  organizationId: string | null;
  userId: string | null;
  agentName: string | null;
  status: string;
  nodeId: string | null;
  containerName: string | null;
  bridgePort: number | null;
  webUiPort: number | null;
  headscaleIp: string | null;
  dockerImage: string | null;
  bridgeUrl: string | null;
  healthUrl: string | null;
  lastHeartbeatAt: string | null;
  errorMessage: string | null;
  errorCount: number | null;
  createdAt: string;
  updatedAt: string;
}

interface VpnNode {
  id: string;
  name: string;
  givenName: string;
  user: string;
  ipAddresses: string[];
  online: boolean;
  lastSeen: string;
  expiry: string;
  createdAt: string;
  tags: string[];
}

interface HeadscaleData {
  serverUrl: string;
  user: string;
  vpnNodes: VpnNode[];
  summary: { total: number; online: number; offline: number };
  queriedAt: string;
}

interface AuditResult {
  nodesChecked: number;
  ghostContainers: Array<{ nodeId: string; hostname: string; names: string[] }>;
  orphanRecords: Array<{ id: string; containerName: string | null }>;
  totalGhostContainers?: number;
  totalOrphanRecords?: number;
  auditedAt?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NodeStatusBadge({ status }: { status: DockerNode["status"] }) {
  const map = {
    healthy: {
      label: "Healthy",
      variant: "default" as const,
      icon: CheckCircle2,
      className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    },
    degraded: {
      label: "Degraded",
      variant: "secondary" as const,
      icon: AlertTriangle,
      className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    },
    offline: {
      label: "Offline",
      variant: "destructive" as const,
      icon: XCircle,
      className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    },
    unknown: { label: "Unknown", variant: "outline" as const, icon: Clock, className: "" },
  };
  const cfg = map[status] ?? map.unknown;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className={`gap-1 ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function ContainerStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; className: string }
  > = {
    running: {
      variant: "default",
      className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    },
    stopped: {
      variant: "secondary",
      className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    },
    error: {
      variant: "destructive",
      className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    },
    provisioning: {
      variant: "outline",
      className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    },
    pending: {
      variant: "outline",
      className: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
    },
    disconnected: {
      variant: "secondary",
      className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    },
  };
  const cfg = map[status] ?? { variant: "outline" as const, className: "" };
  return (
    <Badge variant={cfg.variant} className={cfg.className}>
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InfrastructureDashboard() {
  useSetPageHeader({
    title: "Infrastructure",
    description: "Docker nodes, containers, and Headscale mesh management",
  });

  // ---- Data state ----
  const [nodes, setNodes] = useState<DockerNode[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [headscale, setHeadscale] = useState<HeadscaleData | null>(null);

  // ---- Loading flags ----
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [loadingHeadscale, setLoadingHeadscale] = useState(false);

  // ---- Container filters ----
  const [containerStatusFilter, setContainerStatusFilter] = useState<string>("all");
  const [containerNodeFilter, setContainerNodeFilter] = useState<string>("all");

  // ---- Health check loading per node ----
  const [healthChecking, setHealthChecking] = useState<Record<string, boolean>>({});

  // ---- Add Node dialog ----
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [addNodeForm, setAddNodeForm] = useState({
    nodeId: "",
    hostname: "",
    sshPort: "22",
    capacity: "8",
    sshUser: "root",
  });
  const [addNodeLoading, setAddNodeLoading] = useState(false);

  // ---- Edit Node dialog ----
  const [editNodeOpen, setEditNodeOpen] = useState(false);
  const [editNodeTarget, setEditNodeTarget] = useState<DockerNode | null>(null);
  const [editNodeForm, setEditNodeForm] = useState({
    capacity: "",
    hostname: "",
    sshPort: "",
    enabled: true,
  });
  const [editNodeLoading, setEditNodeLoading] = useState(false);

  // ---- Delete Node confirm ----
  const [deleteNodeTarget, setDeleteNodeTarget] = useState<DockerNode | null>(null);
  const [deleteNodeLoading, setDeleteNodeLoading] = useState(false);

  // ---- Container logs dialog ----
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsTarget, setLogsTarget] = useState<DockerContainer | null>(null);
  const [logsContent, setLogsContent] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);

  // ---- Audit dialog ----
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetchers
  // ---------------------------------------------------------------------------

  const loadNodes = useCallback(async () => {
    setLoadingNodes(true);
    try {
      const res = await fetch("/api/v1/admin/docker-nodes");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setNodes(json.data.nodes);
    } catch (err) {
      toast.error(`Failed to load nodes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingNodes(false);
    }
  }, []);

  const loadContainers = useCallback(async (statusFilter?: string, nodeFilter?: string) => {
    setLoadingContainers(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (nodeFilter && nodeFilter !== "all") params.set("nodeId", nodeFilter);
      const res = await fetch(`/api/v1/admin/docker-containers?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setContainers(json.data.containers);
    } catch (err) {
      toast.error(`Failed to load containers: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingContainers(false);
    }
  }, []);

  const loadHeadscale = useCallback(async () => {
    setLoadingHeadscale(true);
    try {
      const res = await fetch("/api/v1/admin/headscale");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setHeadscale(json.data);
    } catch (err) {
      toast.error(`Failed to load headscale: ${err instanceof Error ? err.message : String(err)}`);
      setHeadscale(null);
    } finally {
      setLoadingHeadscale(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadNodes();
    loadContainers();
    loadHeadscale();
  }, [loadNodes, loadContainers, loadHeadscale]);

  // Re-fetch containers when filters change
  useEffect(() => {
    loadContainers(containerStatusFilter, containerNodeFilter);
  }, [containerStatusFilter, containerNodeFilter, loadContainers]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const runHealthCheck = useCallback(
    async (node: DockerNode) => {
      setHealthChecking((prev) => ({ ...prev, [node.nodeId]: true }));
      try {
        const res = await fetch(`/api/v1/admin/docker-nodes/${node.nodeId}/health-check`, {
          method: "POST",
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        toast.success(`Health check complete: ${node.nodeId} is ${json.data?.status ?? "checked"}`);
        await loadNodes();
      } catch (err) {
        toast.error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setHealthChecking((prev) => ({ ...prev, [node.nodeId]: false }));
      }
    },
    [loadNodes],
  );

  const openEditNode = useCallback((node: DockerNode) => {
    setEditNodeTarget(node);
    setEditNodeForm({
      capacity: String(node.capacity),
      hostname: node.hostname,
      sshPort: String(node.sshPort),
      enabled: node.enabled,
    });
    setEditNodeOpen(true);
  }, []);

  const submitEditNode = useCallback(async () => {
    if (!editNodeTarget) return;
    setEditNodeLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/docker-nodes/${editNodeTarget.nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacity: parseInt(editNodeForm.capacity, 10),
          hostname: editNodeForm.hostname,
          sshPort: parseInt(editNodeForm.sshPort, 10),
          enabled: editNodeForm.enabled,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Node ${editNodeTarget.nodeId} updated`);
      setEditNodeOpen(false);
      await loadNodes();
    } catch (err) {
      toast.error(`Failed to update node: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEditNodeLoading(false);
    }
  }, [editNodeTarget, editNodeForm, loadNodes]);

  const submitDeleteNode = useCallback(async () => {
    if (!deleteNodeTarget) return;
    setDeleteNodeLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/docker-nodes/${deleteNodeTarget.nodeId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Node ${deleteNodeTarget.nodeId} deregistered`);
      setDeleteNodeTarget(null);
      await loadNodes();
    } catch (err) {
      toast.error(`Failed to delete node: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleteNodeLoading(false);
    }
  }, [deleteNodeTarget, loadNodes]);

  const submitAddNode = useCallback(async () => {
    setAddNodeLoading(true);
    try {
      const res = await fetch("/api/v1/admin/docker-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: addNodeForm.nodeId,
          hostname: addNodeForm.hostname,
          sshPort: parseInt(addNodeForm.sshPort, 10),
          capacity: parseInt(addNodeForm.capacity, 10),
          sshUser: addNodeForm.sshUser,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Node ${addNodeForm.nodeId} registered`);
      setAddNodeOpen(false);
      setAddNodeForm({ nodeId: "", hostname: "", sshPort: "22", capacity: "8", sshUser: "root" });
      await loadNodes();
    } catch (err) {
      toast.error(`Failed to register node: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddNodeLoading(false);
    }
  }, [addNodeForm, loadNodes]);

  const viewContainerLogs = useCallback(async (container: DockerContainer) => {
    setLogsTarget(container);
    setLogsContent("");
    setLogsOpen(true);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/docker-containers/${container.id}/logs?lines=200`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setLogsContent(json.data?.logs ?? "(no output)");
    } catch (err) {
      setLogsContent(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditResult(null);
    setAuditOpen(true);
    try {
      const res = await fetch("/api/v1/admin/docker-containers/audit", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setAuditResult(json.data);
    } catch (err) {
      toast.error(`Audit failed: ${err instanceof Error ? err.message : String(err)}`);
      setAuditOpen(false);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Overview stats
  // ---------------------------------------------------------------------------

  const nodesOnline = nodes.filter((n) => n.status === "healthy").length;
  const nodesOffline = nodes.filter(
    (n) => n.status === "offline" || n.status === "degraded",
  ).length;
  const nodesUnknown = nodes.filter((n) => n.status === "unknown").length;
  const totalCapacity = nodes.reduce((s, n) => s + n.capacity, 0);
  const totalAllocated = nodes.reduce((s, n) => s + n.allocatedCount, 0);
  const containersRunning = containers.filter((c) => c.status === "running").length;
  const containersStopped = containers.filter((c) => c.status === "stopped").length;
  const containersError = containers.filter((c) => c.status === "error").length;
  const containersDisconnected = containers.filter((c) => c.status === "disconnected").length;
  const utilizationPct = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0;

  // ---------------------------------------------------------------------------
  // Refresh all
  // ---------------------------------------------------------------------------

  const refreshAll = useCallback(() => {
    loadNodes();
    loadContainers(containerStatusFilter, containerNodeFilter);
    loadHeadscale();
  }, [loadNodes, loadContainers, loadHeadscale, containerStatusFilter, containerNodeFilter]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Infrastructure</h1>
          <p className="text-muted-foreground">
            Docker nodes, containers, and Headscale mesh management
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh All
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Nodes card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Docker Nodes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nodes.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">{nodesOnline} online</span>
              {nodesOffline > 0 && (
                <span className="ml-2 text-red-500">{nodesOffline} offline</span>
              )}
              {nodesUnknown > 0 && (
                <span className="ml-2 text-muted-foreground">{nodesUnknown} unchecked</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Containers card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Containers</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{containers.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">{containersRunning} running</span>
              {containersStopped > 0 && (
                <span className="ml-2 text-yellow-600">{containersStopped} stopped</span>
              )}
              {containersError > 0 && (
                <span className="ml-2 text-red-500">{containersError} error</span>
              )}
              {containersDisconnected > 0 && (
                <span className="ml-2 text-orange-500">{containersDisconnected} disconnected</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Capacity card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capacity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{utilizationPct}%</div>
            <p className="text-xs text-muted-foreground">
              {totalAllocated} / {totalCapacity} slots used
            </p>
            {totalCapacity > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    utilizationPct > 85
                      ? "bg-red-500"
                      : utilizationPct > 60
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${utilizationPct}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Headscale card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mesh (Headscale)</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingHeadscale ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : headscale ? (
              <>
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold">{headscale.summary.total}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{headscale.summary.online} online</span>
                  {headscale.summary.offline > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      {headscale.summary.offline} offline
                    </span>
                  )}{" "}
                  VPN nodes
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Unavailable</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="nodes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="nodes" onClick={loadNodes}>
            <Server className="mr-2 h-4 w-4" />
            Nodes
          </TabsTrigger>
          <TabsTrigger
            value="containers"
            onClick={() => loadContainers(containerStatusFilter, containerNodeFilter)}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            Containers
          </TabsTrigger>
          <TabsTrigger value="mesh" onClick={loadHeadscale}>
            <Network className="mr-2 h-4 w-4" />
            Mesh
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* NODES TAB                                                           */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="nodes" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Docker Nodes</CardTitle>
                <CardDescription>Registered Docker execution nodes</CardDescription>
              </div>
              <Button onClick={() => setAddNodeOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Node
              </Button>
            </CardHeader>
            <CardContent>
              {loadingNodes ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Node ID</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Capacity</TableHead>
                      <TableHead className="text-right">Used / Avail</TableHead>
                      <TableHead>Last Health Check</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nodes.map((node) => (
                      <TableRow key={node.id} className={!node.enabled ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-xs">
                          {node.nodeId}
                          {!node.enabled && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              disabled
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {node.hostname}
                          <span className="ml-1 text-xs text-muted-foreground">
                            :{node.sshPort}
                          </span>
                        </TableCell>
                        <TableCell>
                          <NodeStatusBadge status={node.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {node.capacity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span
                            className={
                              node.allocatedCount > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                            }
                          >
                            {node.allocatedCount}
                          </span>
                          <span className="text-muted-foreground"> / </span>
                          <span
                            className={
                              node.availableSlots === 0
                                ? "text-red-500"
                                : "text-green-600 dark:text-green-400"
                            }
                          >
                            {node.availableSlots}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {formatRelativeTime(node.lastHealthCheck)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Run health check"
                              onClick={() => runHealthCheck(node)}
                              disabled={healthChecking[node.nodeId]}
                            >
                              {healthChecking[node.nodeId] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Activity className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit node"
                              onClick={() => openEditNode(node)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete node"
                              onClick={() => setDeleteNodeTarget(node)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {nodes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No Docker nodes registered. Add one to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* CONTAINERS TAB                                                      */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="containers" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Docker Containers</CardTitle>
                <CardDescription>All Docker-backed agent sandboxes across nodes</CardDescription>
              </div>
              <Button variant="outline" onClick={runAudit}>
                <Bug className="mr-2 h-4 w-4" />
                Run Audit
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Filter:</span>
                </div>
                <Select value={containerStatusFilter} onValueChange={setContainerStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="stopped">Stopped</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="provisioning">Provisioning</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="disconnected">Disconnected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={containerNodeFilter} onValueChange={setContainerNodeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All nodes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All nodes</SelectItem>
                    {nodes.map((n) => (
                      <SelectItem key={n.nodeId} value={n.nodeId}>
                        {n.nodeId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(containerStatusFilter !== "all" || containerNodeFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setContainerStatusFilter("all");
                      setContainerNodeFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {/* Table */}
              {loadingContainers ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Container Name</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Node</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>VPN IP</TableHead>
                      <TableHead>Bridge Port</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">
                          {c.containerName ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.agentName ?? (
                            <span className="text-muted-foreground text-xs">
                              {c.sandboxId.slice(0, 8)}…
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {c.nodeId ?? "—"}
                        </TableCell>
                        <TableCell>
                          <ContainerStatusBadge status={c.status} />
                          {c.errorCount && c.errorCount > 0 ? (
                            <span className="ml-1 text-xs text-red-500">({c.errorCount}x)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.headscaleIp ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.bridgePort ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeTime(c.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View logs"
                            onClick={() => viewContainerLogs(c)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {containers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No containers found
                          {(containerStatusFilter !== "all" || containerNodeFilter !== "all") &&
                            " matching filters"}
                          .
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* MESH TAB                                                            */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="mesh" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Headscale Mesh Network</CardTitle>
                <CardDescription>
                  VPN node connectivity via Tailscale-compatible Headscale
                </CardDescription>
              </div>
              <Button variant="outline" onClick={loadHeadscale} disabled={loadingHeadscale}>
                {loadingHeadscale ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingHeadscale && !headscale ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : headscale ? (
                <>
                  {/* Server status banner */}
                  <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                    <Wifi className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        Headscale server online
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {headscale.serverUrl} · User: {headscale.user} · Queried{" "}
                        {formatRelativeTime(headscale.queriedAt)}
                      </p>
                    </div>
                    <div className="ml-auto flex gap-4 text-sm">
                      <span>
                        <span className="font-semibold text-green-600">
                          {headscale.summary.online}
                        </span>
                        <span className="text-muted-foreground"> online</span>
                      </span>
                      <span>
                        <span className="font-semibold text-muted-foreground">
                          {headscale.summary.offline}
                        </span>
                        <span className="text-muted-foreground"> offline</span>
                      </span>
                    </div>
                  </div>

                  {/* VPN nodes table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Given Name</TableHead>
                        <TableHead>IP Addresses</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {headscale.vpnNodes.map((vpn) => (
                        <TableRow key={vpn.id}>
                          <TableCell className="font-mono text-xs font-medium">
                            {vpn.name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {vpn.givenName !== vpn.name ? vpn.givenName : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {vpn.ipAddresses.join(", ") || "—"}
                          </TableCell>
                          <TableCell>
                            {vpn.online ? (
                              <Badge className="gap-1 bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
                                <Wifi className="h-3 w-3" /> Online
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <WifiOff className="h-3 w-3" /> Offline
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatRelativeTime(vpn.lastSeen)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {vpn.expiry
                              ? new Date(vpn.expiry).getFullYear() > 2099
                                ? "Never"
                                : new Date(vpn.expiry).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {vpn.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {vpn.tags.map((t) => (
                                  <Badge key={t} variant="outline" className="text-xs">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {headscale.vpnNodes.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No VPN nodes registered in Headscale.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-8">
                  <WifiOff className="h-8 w-8 text-red-500" />
                  <p className="font-medium text-red-700 dark:text-red-400">
                    Headscale server unavailable
                  </p>
                  <p className="text-sm text-muted-foreground text-center">
                    Could not reach the Headscale API. Check HEADSCALE_API_KEY and server
                    connectivity.
                  </p>
                  <Button variant="outline" size="sm" onClick={loadHeadscale}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* -------------------------------------------------------------------- */}
      {/* ADD NODE DIALOG                                                       */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={addNodeOpen} onOpenChange={setAddNodeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register Docker Node</DialogTitle>
            <DialogDescription>Add a new Docker execution node to the pool.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nodeId">Node ID</Label>
              <Input
                id="nodeId"
                placeholder="node-01"
                value={addNodeForm.nodeId}
                onChange={(e) => setAddNodeForm((f) => ({ ...f, nodeId: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostname">Hostname / IP</Label>
              <Input
                id="hostname"
                placeholder="192.168.1.100"
                value={addNodeForm.hostname}
                onChange={(e) => setAddNodeForm((f) => ({ ...f, hostname: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sshPort">SSH Port</Label>
                <Input
                  id="sshPort"
                  type="number"
                  min={1}
                  max={65535}
                  value={addNodeForm.sshPort}
                  onChange={(e) => setAddNodeForm((f) => ({ ...f, sshPort: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sshUser">SSH User</Label>
                <Input
                  id="sshUser"
                  placeholder="root"
                  value={addNodeForm.sshUser}
                  onChange={(e) => setAddNodeForm((f) => ({ ...f, sshUser: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Container Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={addNodeForm.capacity}
                onChange={(e) => setAddNodeForm((f) => ({ ...f, capacity: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of containers this node can run.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddNodeOpen(false)}
              disabled={addNodeLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAddNode}
              disabled={addNodeLoading || !addNodeForm.nodeId || !addNodeForm.hostname}
            >
              {addNodeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* EDIT NODE DIALOG                                                      */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={editNodeOpen} onOpenChange={setEditNodeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Node: {editNodeTarget?.nodeId}</DialogTitle>
            <DialogDescription>Update node settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editHostname">Hostname / IP</Label>
              <Input
                id="editHostname"
                value={editNodeForm.hostname}
                onChange={(e) => setEditNodeForm((f) => ({ ...f, hostname: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="editSshPort">SSH Port</Label>
                <Input
                  id="editSshPort"
                  type="number"
                  min={1}
                  max={65535}
                  value={editNodeForm.sshPort}
                  onChange={(e) => setEditNodeForm((f) => ({ ...f, sshPort: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editCapacity">Capacity</Label>
                <Input
                  id="editCapacity"
                  type="number"
                  min={1}
                  value={editNodeForm.capacity}
                  onChange={(e) => setEditNodeForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="editEnabled"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={editNodeForm.enabled}
                onChange={(e) => setEditNodeForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <Label htmlFor="editEnabled">Node enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditNodeOpen(false)}
              disabled={editNodeLoading}
            >
              Cancel
            </Button>
            <Button onClick={submitEditNode} disabled={editNodeLoading}>
              {editNodeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* DELETE NODE CONFIRM DIALOG                                            */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={!!deleteNodeTarget} onOpenChange={(open) => !open && setDeleteNodeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deregister Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to deregister{" "}
              <span className="font-mono font-semibold">{deleteNodeTarget?.nodeId}</span>?
              {deleteNodeTarget && deleteNodeTarget.allocatedCount > 0 && (
                <span className="mt-1 block text-destructive">
                  ⚠ This node has {deleteNodeTarget.allocatedCount} active containers.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteNodeTarget(null)}
              disabled={deleteNodeLoading}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitDeleteNode} disabled={deleteNodeLoading}>
              {deleteNodeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deregister
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* CONTAINER LOGS DIALOG                                                 */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Logs: {logsTarget?.containerName ?? logsTarget?.sandboxId?.slice(0, 12)}
            </DialogTitle>
            <DialogDescription>
              Last 200 lines · Node: {logsTarget?.nodeId ?? "unknown"}
              {logsTarget?.agentName && ` · Agent: ${logsTarget.agentName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[500px] overflow-auto rounded-md bg-muted/60 p-4">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                {logsContent || "(no output)"}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* AUDIT RESULTS DIALOG                                                  */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Container Audit Results
            </DialogTitle>
            <DialogDescription>
              Ghost containers (running on node but not in DB) and orphan records (in DB but not on
              node).
            </DialogDescription>
          </DialogHeader>
          {auditLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : auditResult ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Checked {auditResult.nodesChecked} node{auditResult.nodesChecked !== 1 ? "s" : ""}.
                {auditResult.message && ` ${auditResult.message}`}
              </p>
              {auditResult.auditedAt && (
                <span className="ml-2">· {formatRelativeTime(auditResult.auditedAt)}</span>
              )}

              {/* Ghost containers */}
              <div>
                <h4 className="mb-2 text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Ghost Containers (
                  {auditResult.ghostContainers.reduce((s, n) => s + n.names.length, 0)})
                  <span className="font-normal text-muted-foreground text-xs">
                    — running on node but not tracked in DB
                  </span>
                </h4>
                {auditResult.ghostContainers.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-6">None found ✓</p>
                ) : (
                  <div className="space-y-2">
                    {auditResult.ghostContainers.map((g) => (
                      <div
                        key={g.nodeId}
                        className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3"
                      >
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Node: {g.nodeId} ({g.hostname})
                        </p>
                        {g.names.map((name) => (
                          <Badge key={name} variant="outline" className="mr-1 font-mono text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orphan records */}
              <div>
                <h4 className="mb-2 text-sm font-medium flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Orphan DB Records ({auditResult.orphanRecords.length})
                  <span className="font-normal text-muted-foreground text-xs">
                    — in DB but not running on node
                  </span>
                </h4>
                {auditResult.orphanRecords.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-6">None found ✓</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {auditResult.orphanRecords.map((r) => (
                      <Badge
                        key={r.id}
                        variant="outline"
                        className="font-mono text-xs text-red-600"
                      >
                        {r.containerName ?? r.id.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
