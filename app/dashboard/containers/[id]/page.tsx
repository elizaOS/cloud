import { requireAuth } from "@/lib/auth";
import { getContainer } from "@/lib/services";
import { redirect } from "next/navigation";
import { ContainerDeploymentHistory } from "@/components/containers/container-deployment-history";
import { ContainerLogsViewer } from "@/components/containers/container-logs-viewer";
import { ContainerMetrics } from "@/components/containers/container-metrics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  ArrowLeft,
  Server,
  Cpu,
  HardDrive,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContainerDetailsPage({ params }: PageProps) {
  const user = await requireAuth();
  const { id } = await params;

  const container = await getContainer(id, user.organization_id);

  if (!container) {
    redirect("/dashboard/containers");
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-500";
      case "pending":
      case "building":
      case "deploying":
        return "bg-yellow-500";
      case "failed":
        return "bg-red-500";
      case "stopped":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/containers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Containers
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{container.name}</h1>
            {container.description && (
              <p className="text-muted-foreground">{container.description}</p>
            )}
          </div>
        </div>
        {container.load_balancer_url && (
          <Button asChild>
            <a
              href={container.load_balancer_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Container
            </a>
          </Button>
        )}
      </div>

      {/* Container Status Card */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-md bg-blue-500/10">
                <Server className="h-5 w-5 text-blue-500" />
              </div>
              <Badge
                className={`${getStatusColor(container.status)} text-white`}
              >
                {container.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Status
              </p>
              <p className="text-2xl font-bold mt-1 capitalize">
                {container.status}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-md bg-purple-500/10">
                <Cpu className="h-5 w-5 text-purple-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">CPU</p>
              <p className="text-2xl font-bold mt-1">{container.cpu}</p>
              <p className="text-xs text-muted-foreground mt-1">vCPU units</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-md bg-emerald-500/10">
                <HardDrive className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Memory
              </p>
              <p className="text-2xl font-bold mt-1">{container.memory} MB</p>
              <p className="text-xs text-muted-foreground mt-1">
                RAM allocated
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-md bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Last Deployed
              </p>
              <p className="text-lg font-bold mt-1">
                {container.last_deployed_at
                  ? new Date(container.last_deployed_at).toLocaleDateString()
                  : "Never"}
              </p>
              {container.last_deployed_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(container.last_deployed_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deployment Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Deployment Configuration</CardTitle>
          <CardDescription>
            Current container configuration and endpoint details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Server className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Port</p>
                  <p className="text-lg font-semibold">{container.port}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Server className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Instances</p>
                  <p className="text-lg font-semibold">
                    {container.desired_count}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">
                    {new Date(container.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {container.error_message && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-1 bg-red-500/10 rounded">
                    <svg
                      className="h-5 w-5 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-red-600 dark:text-red-400 mb-1">
                      Deployment Error
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {container.error_message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {container.ecs_service_arn && (
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3">
                  <p className="text-sm font-medium text-muted-foreground min-w-[120px]">
                    ECS Service ARN:
                  </p>
                  <code className="text-xs bg-muted px-3 py-1.5 rounded font-mono flex-1">
                    {container.ecs_service_arn}
                  </code>
                </div>
                {container.load_balancer_url && (
                  <div className="flex items-start gap-3">
                    <p className="text-sm font-medium text-muted-foreground min-w-[120px]">
                      Load Balancer URL:
                    </p>
                    <a
                      href={container.load_balancer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1 flex-1"
                    >
                      {container.load_balancer_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Container Metrics */}
      {container.status === "running" && container.ecs_service_arn && (
        <ContainerMetrics
          containerId={container.id}
          containerName={container.name}
        />
      )}

      {/* Deployment History */}
      <ContainerDeploymentHistory
        containerId={container.id}
        containerName={container.name}
      />

      {/* Container Logs */}
      <ContainerLogsViewer
        containerId={container.id}
        containerName={container.name}
      />
    </div>
  );
}
