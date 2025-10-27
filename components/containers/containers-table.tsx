"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trash2,
  ExternalLink,
  FileText,
  Search,
  ArrowUpDown,
  Server,
  Boxes,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

interface Container {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ecs_service_arn: string | null;
  load_balancer_url: string | null;
  port: number;
  desired_count: number;
  cpu: number;
  memory: number;
  last_deployed_at: Date | null;
  created_at: Date;
  error_message: string | null;
}

interface ContainersTableProps {
  containers: Container[];
}

const STATUS_COLORS = {
  running: "bg-green-500 hover:bg-green-600",
  pending: "bg-yellow-500 hover:bg-yellow-600",
  building: "bg-yellow-500 hover:bg-yellow-600",
  deploying: "bg-blue-500 hover:bg-blue-600",
  failed: "bg-red-500 hover:bg-red-600",
  stopped: "bg-gray-500 hover:bg-gray-600",
  deleting: "bg-orange-500 hover:bg-orange-600",
} as const;

const STATUS_ICONS = {
  running: "🟢",
  pending: "🟡",
  building: "🔨",
  deploying: "🚀",
  failed: "🔴",
  stopped: "⚫",
  deleting: "🗑️",
} as const;

type SortField = "name" | "status" | "deployed" | "cpu" | "memory";
type SortDirection = "asc" | "desc";

export function ContainersTable({ containers }: ContainersTableProps) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("deployed");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const getStatusColor = (status: string): string => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-500";
  };

  const getStatusIcon = (status: string): string => {
    return STATUS_ICONS[status as keyof typeof STATUS_ICONS] || "⚪";
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredAndSortedContainers = useMemo(() => {
    let filtered = containers.filter((container) => {
      const matchesSearch =
        searchQuery === "" ||
        container.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        container.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || container.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "deployed":
          const aDate = a.last_deployed_at
            ? new Date(a.last_deployed_at).getTime()
            : 0;
          const bDate = b.last_deployed_at
            ? new Date(b.last_deployed_at).getTime()
            : 0;
          comparison = aDate - bDate;
          break;
        case "cpu":
          comparison = a.cpu - b.cpu;
          break;
        case "memory":
          comparison = a.memory - b.memory;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [containers, searchQuery, statusFilter, sortField, sortDirection]);

  const handleDelete = async (id: string) => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/v1/containers/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete container");
      }

      toast.success("Container deleted successfully");
      router.refresh();
    } catch (error) {
      console.error("Error deleting container:", error);
      toast.error("Failed to delete container");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return "Never";
    const now = new Date();
    const deployDate = new Date(date);
    const diffMs = now.getTime() - deployDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return deployDate.toLocaleDateString();
  };

  if (containers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="rounded-full bg-muted p-6 mb-6">
          <Server className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-2xl font-semibold mb-2">No containers deployed</h3>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Get started by deploying your first ElizaOS container using the CLI
        </p>
        <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2 max-w-lg w-full">
          <div className="text-muted-foreground"># Install ElizaOS CLI</div>
          <div className="text-foreground">bun install -g @elizaos/cli</div>
          <div className="text-muted-foreground mt-3"># Deploy your project</div>
          <div className="text-foreground">cd your-elizaos-project</div>
          <div className="text-foreground">elizaos deploy</div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search containers by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="building">Building</SelectItem>
              <SelectItem value="deploying">Deploying</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results Count */}
        {(searchQuery || statusFilter !== "all") && (
          <div className="text-sm text-muted-foreground">
            Showing {filteredAndSortedContainers.length} of {containers.length}{" "}
            containers
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("name")}
                    className="hover:bg-muted"
                  >
                    Container
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("status")}
                    className="hover:bg-muted"
                  >
                    Status
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("cpu")}
                    className="hover:bg-muted"
                  >
                    Resources
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Instances</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("deployed")}
                    className="hover:bg-muted"
                  >
                    Deployed
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedContainers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Boxes className="h-8 w-8 mb-2" />
                      <p>No containers match your filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedContainers.map((container) => (
                  <TableRow
                    key={container.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <Link
                          href={`/dashboard/containers/${container.id}`}
                          className="font-medium hover:underline"
                        >
                          {container.name}
                        </Link>
                        {container.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {container.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Port: {container.port}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Badge
                          variant="outline"
                          className={`${getStatusColor(container.status)} text-white border-none w-fit`}
                        >
                          <span className="mr-1">{getStatusIcon(container.status)}</span>
                          {container.status}
                        </Badge>
                        {container.error_message && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-red-500 truncate max-w-[200px] cursor-help">
                                {container.error_message}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>{container.error_message}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">CPU:</span>
                          <span className="font-medium">{container.cpu}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">RAM:</span>
                          <span className="font-medium">{container.memory}MB</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Server className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{container.desired_count}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">
                          {formatDate(container.last_deployed_at)}
                        </div>
                        {container.last_deployed_at && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(container.last_deployed_at).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={`/dashboard/containers/${container.id}`}>
                              <Button variant="ghost" size="sm">
                                <FileText className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>View details & logs</TooltipContent>
                        </Tooltip>

                        {container.load_balancer_url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  window.open(container.load_balancer_url!, "_blank");
                                }}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open container URL</TooltipContent>
                          </Tooltip>
                        )}

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteId(container.id)}
                              disabled={isDeleting}
                              className="hover:bg-red-50 dark:hover:bg-red-950"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete container</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Container</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this container? This action cannot
              be undone and will remove the container from AWS ECS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
