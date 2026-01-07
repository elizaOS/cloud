/**
 * Apps table component displaying user's applications with actions.
 * Shows app details, status, and provides actions for settings, API keys, and deletion.
 * Supports copying app IDs to clipboard.
 *
 * @param props - Apps table configuration
 * @param props.apps - Array of app objects to display
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { App } from "@/db/schemas";
import {
  Activity,
  Users,
  ExternalLink,
  MoreVertical,
  Settings,
  Trash2,
  Key,
  Copy,
  Check,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface AppsTableProps {
  apps: App[];
}

export function AppsTable({ apps }: AppsTableProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<App | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteClick = (app: App) => {
    setAppToDelete(app);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!appToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/apps/${appToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete app");
      }

      toast.success("App deleted successfully");
      router.refresh();
    } catch (error) {
      console.error("Error deleting app:", error);
      toast.error("Failed to delete app", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setAppToDelete(null);
    }
  };

  if (apps.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-4">
          <Activity className="h-8 w-8 text-white/40" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No apps yet</h3>
        <p className="text-white/60 mb-4">
          Create your first app to start integrating with Eliza Cloud
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {apps.map((app) => (
        <div
          key={app.id}
          className="group relative flex items-center justify-between p-4 bg-white/5 hover:bg-white/[0.07] rounded-lg border border-white/10 hover:border-white/20 transition-all"
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* App Icon/Logo */}
            <div className="flex-shrink-0">
              {app.logo_url ? (
                <Image
                  src={app.logo_url}
                  alt={app.name}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FF5800] to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {app.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* App Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Link
                  href={`/dashboard/apps/${app.id}`}
                  className="text-white font-semibold hover:text-[#FF5800] transition-colors truncate"
                >
                  {app.name}
                </Link>
                {app.is_active ? (
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-400 border-green-500/20"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-red-500/10 text-red-400 border-red-500/20"
                  >
                    Inactive
                  </Badge>
                )}
                {app.affiliate_code && (
                  <Badge
                    variant="outline"
                    className="bg-purple-500/10 text-purple-400 border-purple-500/20"
                  >
                    Affiliate
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-white/60">
                <span className="truncate">{app.app_url}</span>
                {app.website_url && (
                  <a
                    href={app.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="text-white/80">
                  {app.total_users.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-400" />
                <span className="text-white/80">
                  {app.total_requests.toLocaleString()}
                </span>
              </div>
              <div className="text-white/60 text-xs">
                {app.last_used_at
                  ? formatDistanceToNow(new Date(app.last_used_at), {
                      addSuffix: true,
                    })
                  : "Never used"}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(app.slug, app.id)}
              className="text-white/60 hover:text-white hover:bg-white/10"
            >
              {copiedId === app.id ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/apps/create?appId=${app.id}`}
                    className="text-[#FF5800] focus:text-[#FF5800]"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Continue Building
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/apps/${app.id}`}>
                    <Settings className="h-4 w-4 mr-2" />
                    Manage App
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/apps/${app.id}?tab=settings`}>
                    <Key className="h-4 w-4 mr-2" />
                    View API Key
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400"
                  onClick={() => handleDeleteClick(app)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete App
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete App?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the app
              <strong className="text-white"> {appToDelete?.name}</strong> and
              remove all associated data including analytics and user tracking.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete App"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
