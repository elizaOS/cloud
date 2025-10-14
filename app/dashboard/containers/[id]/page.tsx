import { requireAuth } from "@/lib/auth";
import { getContainer } from "@/lib/services";
import { redirect } from "next/navigation";
import { ContainerDeploymentHistory } from "@/components/containers/container-deployment-history";
import { ContainerLogsViewer } from "@/components/containers/container-logs-viewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = 'force-dynamic';

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
        {container.cloudflare_url && (
          <Button asChild>
            <a href={container.cloudflare_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Container
            </a>
          </Button>
        )}
      </div>

      {/* Container Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Container Status</CardTitle>
          <CardDescription>Current deployment information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <Badge className={`${getStatusColor(container.status)} text-white`}>
                {container.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Port</p>
              <p className="text-lg font-semibold">{container.port}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Max Instances</p>
              <p className="text-lg font-semibold">{container.max_instances}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Last Deployed</p>
              <p className="text-sm">
                {container.last_deployed_at
                  ? new Date(container.last_deployed_at).toLocaleDateString()
                  : "Never"}
              </p>
            </div>
          </div>

          {container.error_message && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">
                <strong>Error:</strong> {container.error_message}
              </p>
            </div>
          )}

          {container.cloudflare_worker_id && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">Cloudflare Worker ID:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {container.cloudflare_worker_id}
                </code>
              </div>
              {container.cloudflare_url && (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">URL:</p>
                  <a
                    href={container.cloudflare_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {container.cloudflare_url}
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deployment History */}
      <ContainerDeploymentHistory containerId={container.id} containerName={container.name} />

      {/* Container Logs */}
      <ContainerLogsViewer containerId={container.id} containerName={container.name} />
    </div>
  );
}

