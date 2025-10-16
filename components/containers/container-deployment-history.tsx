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
import { CheckCircle2, XCircle, Clock } from "lucide-react";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment History</CardTitle>
        <CardDescription>Past deployments for {containerName}</CardDescription>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No deployment history available
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deployments.map((deployment) => (
                  <TableRow key={deployment.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deployment.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <Badge
                          variant={
                            deployment.status === "success"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {deployment.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>
                          {new Date(
                            deployment.deployed_at,
                          ).toLocaleDateString()}
                        </div>
                        <div className="text-muted-foreground">
                          {new Date(
                            deployment.deployed_at,
                          ).toLocaleTimeString()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {deployment.duration_ms ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span className="text-sm">
                            {(deployment.duration_ms / 1000).toFixed(1)}s
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">
                        {deployment.cost} credits
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-1">
                        <div>
                          Count: {deployment.metadata.desired_count || 1}
                        </div>
                        <div className="text-muted-foreground">
                          CPU: {deployment.metadata.cpu || 256} / Mem: {deployment.metadata.memory || 512}MB
                        </div>
                        <div className="text-muted-foreground">
                          Port: {deployment.metadata.port || 3000}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {deployment.error && (
                        <div className="text-xs text-red-500 max-w-xs truncate">
                          {deployment.error}
                        </div>
                      )}
                      {deployment.metadata.ecs_service_arn && (
                        <div className="text-xs text-muted-foreground font-mono">
                          ECS: {deployment.metadata.ecs_service_arn.substring(
                            deployment.metadata.ecs_service_arn.lastIndexOf("/") + 1
                          ).substring(0, 12)}...
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
