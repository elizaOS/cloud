"use client";

import { useState } from "react";
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
import { Trash2, ExternalLink, FileText } from "lucide-react";
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

export function ContainersTable({ containers }: ContainersTableProps) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      case "deleting":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

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

  if (containers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">No containers deployed yet</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Deploy your first ElizaOS project using the CLI:{" "}
          <code className="bg-muted px-2 py-1 rounded">elizaos deploy</code>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Port</TableHead>
              <TableHead>Instances</TableHead>
              <TableHead>Deployed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {containers.map((container) => (
              <TableRow key={container.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{container.name}</p>
                    {container.description && (
                      <p className="text-sm text-muted-foreground">
                        {container.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(container.status)} text-white`}
                  >
                    {container.status}
                  </Badge>
                  {container.error_message && (
                    <p className="text-xs text-red-500 mt-1">
                      {container.error_message}
                    </p>
                  )}
                </TableCell>
                <TableCell>{container.port}</TableCell>
                <TableCell>{container.desired_count}</TableCell>
                <TableCell>
                  {container.last_deployed_at ? (
                    <span className="text-sm">
                      {new Date(
                        container.last_deployed_at,
                      ).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Not deployed
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/containers/${container.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View details, logs & history"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </Link>
                    {container.load_balancer_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          window.open(container.load_balancer_url!, "_blank");
                        }}
                        title="Open container URL"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(container.id)}
                      disabled={isDeleting}
                      title="Delete container"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </>
  );
}
