"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface AppsTableProps {
  apps: App[];
}

export function AppsTable({ apps }: AppsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
                  <Link href={`/dashboard/apps/${app.id}`}>
                    <Settings className="h-4 w-4 mr-2" />
                    Manage App
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/apps/${app.id}?tab=api-key`}>
                    <Key className="h-4 w-4 mr-2" />
                    View API Key
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-400 focus:text-red-400">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete App
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}

