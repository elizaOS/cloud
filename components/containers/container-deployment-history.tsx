"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Cpu,
  HardDrive,
  Network,
} from "lucide-react";

interface Deployment {
  id: string;
  status: "success" | "failed";
  cost: number;
  error?: string;
  metadata: {
    container_id?: string;
    container_name?: string;
    desired_count?: number;
    cpu?: number;
    memory?: number;
    port?: number;
    image_tag?: string;
    ecs_service_arn?: string;
  };
  deployed_at: Date;
  duration_ms?: number;
}

interface DeploymentHistoryProps {
  containerId: string;
  containerName: string;
}

export function ContainerDeploymentHistory({
  containerId,
  containerName,
}: DeploymentHistoryProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeployments() {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/v1/containers/${containerId}/deployments`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch deployment history");
        }

        const data = await response.json();
        if (data.success) {
          setDeployments(data.data.deployments);
        } else {
          setError(data.error || "Failed to load deployments");
        }
      } catch (err) {
        console.error("Error fetching deployments:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load deployments",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchDeployments();
  }, [containerId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
          <CardDescription>Loading deployment history...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
          <CardDescription className="text-red-500">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const successRate =
    deployments.length > 0
      ? (deployments.filter((d) => d.status === "success").length /
          deployments.length) *
        100
      : 0;

  const avgDuration =
    deployments.length > 0 && deployments.some((d) => d.duration_ms)
      ? deployments
          .filter((d) => d.duration_ms)
          .reduce((sum, d) => sum + (d.duration_ms || 0), 0) /
        deployments.filter((d) => d.duration_ms).length
      : null;

  const totalCost = deployments.reduce((sum, d) => sum + d.cost, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Deployment History</CardTitle>
            <CardDescription>
              Past deployments for {containerName}
            </CardDescription>
          </div>
          {deployments.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Success Rate:</span>
                <span className="font-semibold">{successRate.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No deployment history available
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Deployment records will appear here after your first deployment
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Overview */}
            <div className="grid grid-cols-3 gap-4 pb-4 border-b">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">
                  {deployments.filter((d) => d.status === "success").length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Successful</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">
                  {deployments.filter((d) => d.status === "failed").length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-500">
                  ${totalCost.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total Cost</p>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              {deployments.map((deployment, index) => (
                <div
                  key={deployment.id}
                  className="relative pl-8 pb-4 border-l-2 border-muted last:border-l-0 last:pb-0"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-[-9px] top-1">
                    {deployment.status === "success" ? (
                      <div className="p-1 bg-background rounded-full">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                    ) : (
                      <div className="p-1 bg-background rounded-full">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                  </div>

                  {/* Deployment card */}
                  <div className="bg-muted/30 rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            deployment.status === "success"
                              ? "default"
                              : "destructive"
                          }
                          className="font-semibold"
                        >
                          {deployment.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(deployment.deployed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {deployment.duration_ms && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              {(deployment.duration_ms / 1000).toFixed(1)}s
                            </span>
                          </div>
                        )}
                        <span className="font-mono font-semibold">
                          ${Number(deployment.cost).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Network className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Instances:
                        </span>
                        <span className="font-medium">
                          {deployment.metadata.desired_count || 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Cpu className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">CPU:</span>
                        <span className="font-medium">
                          {deployment.metadata.cpu || 256}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Memory:</span>
                        <span className="font-medium">
                          {deployment.metadata.memory || 512}MB
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Network className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Port:</span>
                        <span className="font-medium">
                          {deployment.metadata.port || 3000}
                        </span>
                      </div>
                    </div>

                    {deployment.error && (
                      <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 rounded text-xs text-red-500">
                        <strong>Error:</strong> {deployment.error}
                      </div>
                    )}

                    {deployment.metadata.image_tag && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-mono">
                          Tag: {deployment.metadata.image_tag}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
