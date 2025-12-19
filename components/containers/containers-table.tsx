/**
 * Containers table component displaying deployed containers with filtering and sorting.
 * Supports search, status filtering, deletion, and navigation to container logs.
 */

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
import { BrandCard, BrandButton } from "@/components/brand";
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
import { useSetPageHeader } from "@/components/layout/page-header-context";

import type { Container } from "@/db/repositories/containers";

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

interface TableFilters {
  searchQuery: string;
  statusFilter: string;
  sortField: SortField;
  sortDirection: SortDirection;
}

const DEFAULT_FILTERS: TableFilters = {
  searchQuery: "",
  statusFilter: "all",
  sortField: "deployed",
  sortDirection: "desc",
};

export function ContainersTable({ containers }: ContainersTableProps) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Consolidated filter and sort state
  const [filters, setFilters] = useState<TableFilters>(DEFAULT_FILTERS);

  useSetPageHeader({
    title: "Containers",
    description: "Deploy and manage your containerized ElizaOS applications",
  });

  const getStatusColor = (status: string): string => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-500";
  };

  const getStatusIcon = (status: string): string => {
    return STATUS_ICONS[status as keyof typeof STATUS_ICONS] || "⚪";
  };

  const handleSort = (field: SortField) => {
    setFilters((prev) => ({
      ...prev,
      sortField: field,
      sortDirection:
        prev.sortField === field && prev.sortDirection === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const filteredAndSortedContainers = useMemo(() => {
    let filtered = containers.filter((container) => {
      const matchesSearch =
        filters.searchQuery === "" ||
        container.name
          .toLowerCase()
          .includes(filters.searchQuery.toLowerCase()) ||
        container.description
          ?.toLowerCase()
          .includes(filters.searchQuery.toLowerCase());

      const matchesStatus =
        filters.statusFilter === "all" ||
        container.status === filters.statusFilter;

      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (filters.sortField) {
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

      return filters.sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [containers, filters]);

  const handleDelete = async (id: string) => {
    setIsDeleting(true);

    const response = await fetch(`/api/v1/containers/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete container");
    }

    toast.success("Container deleted successfully");
    router.refresh();
    setIsDeleting(false);
    setDeleteId(null);
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
          <div className="text-muted-foreground mt-3">
            # Deploy your project
          </div>
          <div className="text-foreground">cd your-elizaos-project</div>
          <div className="text-foreground">elizaos deploy</div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <BrandCard className="relative shadow-lg shadow-black/50" cornerSize="sm">
        <div className="relative z-10 space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
              <Input
                placeholder="Search containers by name or description..."
                value={filters.searchQuery}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    searchQuery: e.target.value,
                  }))
                }
                className="pl-9 rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus-visible:ring-[#FF5800]/50"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              />
            </div>
            <Select
              value={filters.statusFilter}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, statusFilter: value }))
              }
            >
              <SelectTrigger
                className="w-full sm:w-[180px] rounded-none border-white/10 bg-black/40"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-white/10 bg-[#0A0A0A]">
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
          {(filters.searchQuery || filters.statusFilter !== "all") && (
            <div
              className="text-sm text-white/60"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Showing {filteredAndSortedContainers.length} of{" "}
              {containers.length} containers
            </div>
          )}

          {/* Table */}
          <div className="rounded-none border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-black/40 border-b border-white/10">
                  <TableHead>
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("name")}
                      className="hover:bg-white/5"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Container
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead>
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("status")}
                      className="hover:bg-white/5"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Status
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead>
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("cpu")}
                      className="hover:bg-white/5"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Resources
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead style={{ fontFamily: "var(--font-roboto-mono)" }}>
                    Instances
                  </TableHead>
                  <TableHead>
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("deployed")}
                      className="hover:bg-white/5"
                      style={{ fontFamily: "var(--font-roboto-mono)" }}
                    >
                      Deployed
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead
                    className="text-right"
                    style={{ fontFamily: "var(--font-roboto-mono)" }}
                  >
                    Actions
                  </TableHead>
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
                      className="hover:bg-white/5 transition-colors border-b border-white/10"
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
                            className={`${getStatusColor(container.status)} text-white border-none w-fit rounded-none`}
                            style={{ fontFamily: "var(--font-roboto-mono)" }}
                          >
                            <span className="mr-1">
                              {getStatusIcon(container.status)}
                            </span>
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
                            <span className="font-medium">
                              {container.memory}MB
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Server className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">
                            {container.desired_count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {formatDate(container.last_deployed_at)}
                          </div>
                          {container.last_deployed_at && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(
                                container.last_deployed_at,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/dashboard/containers/${container.id}`}
                              >
                                <BrandButton variant="ghost" size="sm">
                                  <FileText className="h-4 w-4" />
                                </BrandButton>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>View details & logs</TooltipContent>
                          </Tooltip>

                          {container.load_balancer_url && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <BrandButton
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    window.open(
                                      container.load_balancer_url!,
                                      "_blank",
                                    );
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </BrandButton>
                              </TooltipTrigger>
                              <TooltipContent>
                                Open container URL
                              </TooltipContent>
                            </Tooltip>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <BrandButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteId(container.id)}
                                disabled={isDeleting}
                                className="hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </BrandButton>
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
      </BrandCard>

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
