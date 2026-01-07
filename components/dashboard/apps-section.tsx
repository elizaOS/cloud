/**
 * Apps section component displaying user's applications on the dashboard.
 * Shows up to 4 apps with a "View all" link if more exist.
 *
 * @param props - Apps section configuration
 * @param props.apps - Array of app objects to display
 * @param props.className - Additional CSS classes
 */

"use client";

import * as React from "react";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Grid3x3,
  Plus,
  HelpCircle,
  Activity,
  Users,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface App {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  app_url: string;
  logo_url: string | null;
  is_active: boolean;
  total_users: number;
  total_requests: number;
  last_used_at: Date | null;
  created_at: Date;
}

// Generate a consistent gradient based on app name
function getAppGradient(name: string): string {
  const gradients = [
    "from-cyan-500 to-blue-600",
    "from-violet-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600",
    "from-indigo-500 to-blue-600",
    "from-fuchsia-500 to-pink-600",
    "from-lime-500 to-green-600",
    "from-sky-500 to-cyan-600",
    "from-red-500 to-rose-600",
  ];
  const index =
    name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    gradients.length;
  return gradients[index];
}

interface AppsSectionProps {
  apps: App[];
  className?: string;
}

export function AppsSection({ apps = [], className }: AppsSectionProps) {
  // Show max 4 apps on dashboard
  const displayApps = apps.slice(0, 4);
  const hasMore = apps.length > 4;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/apps"
              className="text-xl font-semibold text-white transition-colors duration-200 hover:text-orange-500"
            >
              Apps
            </Link>
            <span className="text-sm text-white/30">({apps.length})</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-white/20 hover:text-white/50 transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="max-w-[180px] text-xs bg-zinc-900 text-white/80 border border-white/10"
              >
                Third-party applications that integrate with Eliza Cloud.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {apps.length > 0 && (
          <BrandButton variant="outline" asChild size="sm" className="h-8 text-xs">
            <Link href="/dashboard/apps">View All</Link>
          </BrandButton>
        )}
      </div>

      {/* Apps Content */}
      {apps.length === 0 ? (
        <AppsEmptyState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>

          {/* View All Link */}
          {hasMore && (
            <div className="flex justify-center">
              <BrandButton
                variant="ghost"
                asChild
                size="sm"
                className="text-xs h-8"
              >
                <Link href="/dashboard/apps">View all ({apps.length})</Link>
              </BrandButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Individual App Card
function AppCard({ app }: { app: App }) {
  return (
    <Link href={`/dashboard/apps/${app.id}`} className="block h-full">
      <div className="group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1">
        <div className="pointer-events-none absolute inset-0 z-10">
          <CornerBrackets size="md" color="#E1E1E1" />
        </div>

        {/* Header with logo */}
        <div className="relative p-4 pb-3">
          <div className="flex items-start gap-3">
            {/* App Logo */}
            {app.logo_url ? (
              <Image
                src={app.logo_url}
                alt={app.name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getAppGradient(app.name)} flex items-center justify-center flex-shrink-0`}>
                <span className="text-white font-bold text-lg">
                  {app.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Status badge */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                  {app.name}
                </h3>
              </div>
              {app.is_active ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                  Active
                </Badge>
              ) : (
                <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30 text-[10px] px-1.5 py-0">
                  Inactive
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-4 pb-3">
          <p className="text-xs text-white/50 line-clamp-2 leading-relaxed min-h-[2rem]">
            {app.description || "No description"}
          </p>
        </div>

        {/* Stats */}
        <div className="px-4 pb-4 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-white/40">
                <Users className="h-3 w-3 text-blue-400" />
                <span>{app.total_users.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1 text-white/40">
                <Activity className="h-3 w-3 text-purple-400" />
                <span>{app.total_requests.toLocaleString()}</span>
              </div>
            </div>
            <span className="text-white/30">
              {app.last_used_at
                ? formatDistanceToNow(new Date(app.last_used_at), {
                    addSuffix: true,
                  })
                : `Created ${formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}`}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Empty State
function AppsEmptyState() {
  return (
    <BrandCard className="relative border-dashed">
      <div className="relative z-10 text-center py-6 space-y-3">
        <div className="flex justify-center">
          <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Grid3x3 className="h-6 w-6 text-cyan-400" />
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium text-white mb-1">No apps yet</h3>
          <p className="text-xs text-white/50 max-w-xs mx-auto">
            Create apps to integrate with Eliza Cloud services
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <BrandButton asChild size="sm" className="h-8 text-xs">
            <Link href="/dashboard/apps/create">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Build with AI
            </Link>
          </BrandButton>
          <BrandButton variant="outline" asChild size="sm" className="h-8 text-xs">
            <Link href="/dashboard/apps">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create App
            </Link>
          </BrandButton>
        </div>
      </div>
    </BrandCard>
  );
}

// Skeleton Loader
export function AppsSectionSkeleton() {
  return (
    <div className="space-y-4">
      {/* Section Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-16 bg-white/10 animate-pulse rounded" />
          <div className="h-5 w-8 bg-white/10 animate-pulse rounded" />
        </div>
        <div className="h-8 w-20 bg-white/10 animate-pulse rounded" />
      </div>

      {/* Apps Grid Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="relative border border-white/10 bg-black/40 overflow-hidden"
          >
            <div className="pointer-events-none absolute inset-0 z-10">
              <CornerBrackets size="md" color="#E1E1E1" />
            </div>
            {/* Header skeleton */}
            <div className="p-4 pb-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-24 bg-white/10 animate-pulse rounded" />
                  <div className="h-4 w-14 bg-white/10 animate-pulse rounded" />
                </div>
              </div>
            </div>
            {/* Description skeleton */}
            <div className="px-4 pb-3 space-y-1.5">
              <div className="h-3 w-full bg-white/10 animate-pulse rounded" />
              <div className="h-3 w-2/3 bg-white/10 animate-pulse rounded" />
            </div>
            {/* Stats skeleton */}
            <div className="px-4 pb-4 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-10 bg-white/10 animate-pulse rounded" />
                  <div className="h-3 w-10 bg-white/10 animate-pulse rounded" />
                </div>
                <div className="h-3 w-16 bg-white/10 animate-pulse rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
