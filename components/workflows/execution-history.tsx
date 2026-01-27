"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
  History,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Execution {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  executionTimeMs: number | null;
  inputParams: Record<string, unknown>;
  outputResult: {
    success: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  } | null;
  errorMessage: string | null;
}

interface ExecutionHistoryProps {
  executions: Execution[];
  isLoading?: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "running":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
  }
}

function ExecutionDetail({ execution }: { execution: Execution }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2">
          <Eye className="h-3 w-3 mr-1" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Execution Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Status and timing */}
          <div className="flex items-center justify-between">
            {getStatusBadge(execution.status)}
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}
            </span>
          </div>

          {/* Execution time */}
          {execution.executionTimeMs && (
            <div className="text-sm">
              <span className="text-muted-foreground">Duration: </span>
              <span className="font-mono">{execution.executionTimeMs}ms</span>
            </div>
          )}

          {/* Input params */}
          {Object.keys(execution.inputParams).length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Input Parameters</label>
              <ScrollArea className="h-24 border rounded p-2 bg-muted/50">
                <pre className="text-xs font-mono">
                  {JSON.stringify(execution.inputParams, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}

          {/* Output result */}
          {execution.outputResult && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Output</label>
              <ScrollArea className="h-32 border rounded p-2 bg-muted/50">
                <pre className="text-xs font-mono">
                  {JSON.stringify(execution.outputResult, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}

          {/* Error message */}
          {execution.errorMessage && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-400">Error</label>
              <div className="border border-red-500/30 rounded p-2 bg-red-500/10">
                <pre className="text-xs font-mono text-red-400 whitespace-pre-wrap">
                  {execution.errorMessage}
                </pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExecutionSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-7 w-14" /></TableCell>
    </TableRow>
  );
}

export function ExecutionHistory({
  executions,
  isLoading = false,
}: ExecutionHistoryProps) {
  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <ExecutionSkeleton key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed">
        <History className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground font-medium">No executions yet</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Run this workflow to see execution history here.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg" data-testid="execution-history">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((execution) => (
            <TableRow key={execution.id} data-testid="execution-row">
              <TableCell>{getStatusBadge(execution.status)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(execution.startedAt), {
                  addSuffix: true,
                })}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {execution.executionTimeMs
                  ? `${execution.executionTimeMs}ms`
                  : "-"}
              </TableCell>
              <TableCell className="text-right">
                <ExecutionDetail execution={execution} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
