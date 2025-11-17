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
        container.description
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase());

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
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 30) return `${diffDays}d`;
    if (diffMonths < 12) return `${diffMonths}mo`;
    return `${Math.floor(diffMonths / 12)}y`;
  };

  if (containers.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <BrandCard className="relative shadow-lg shadow-black/50" cornerSize="sm">
        <div className="relative z-10 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-2 pb-4 border-b border-white/10">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h2
              className="text-xl font-normal text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Container List
            </h2>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
              <Input
                placeholder="Search containers by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus-visible:ring-[#FF5800]/50"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
          {(searchQuery || statusFilter !== "all") && (
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
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "12px",
                        fontWeight: 500,
                        textTransform: "uppercase",
                      }}
                    >
                      SERVICE NAME
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead>
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("status")}
                      className="hover:bg-white/5"
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "12px",
                        fontWeight: 500,
                        textTransform: "uppercase",
                      }}
                    >
                      STATUS
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "12px",
                      fontWeight: 500,
                      textTransform: "uppercase",
                    }}
                  >
                    RUNTIME
                  </TableHead>
                  <TableHead
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "12px",
                      fontWeight: 500,
                      textTransform: "uppercase",
                    }}
                  >
                    REGION
                  </TableHead>
                  <TableHead>
                    <BrandButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("deployed")}
                      className="hover:bg-white/5"
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "12px",
                        fontWeight: 500,
                        textTransform: "uppercase",
                      }}
                    >
                      UPDATED
                      <ArrowUpDown className="ml-2 h-3 w-3" />
                    </BrandButton>
                  </TableHead>
                  <TableHead
                    className="text-right"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "12px",
                      fontWeight: 500,
                    }}
                  >
                    ...
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
                        <div className="flex items-center gap-3">
                          <Server
                            className="h-4 w-4 text-white/40"
                            style={{ flexShrink: 0 }}
                          />
                          <Link
                            href={`/dashboard/containers/${container.id}`}
                            className="font-medium hover:underline text-white"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "14px",
                            }}
                          >
                            {container.name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {container.status === "running" && (
                            <span className="text-green-500">✓</span>
                          )}
                          <span
                            className="text-white"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "14px",
                              textTransform: "capitalize",
                            }}
                          >
                            {container.status === "running"
                              ? "Deployed"
                              : container.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-white/80"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "14px",
                          }}
                        >
                          Node
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-white/80"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "14px",
                          }}
                        >
                          Frankfurt
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-white/80"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "14px",
                          }}
                        >
                          {formatDate(container.last_deployed_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <BrandButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(container.id)}
                          disabled={isDeleting}
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "16px",
                            fontWeight: 700,
                          }}
                        >
                          ...
                        </BrandButton>
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
