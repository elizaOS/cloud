/**
 * Containers section component displaying deployed containers table on dashboard.
 * Shows container count and provides link to full containers page.
 *
 * @param props - Containers section configuration
 * @param props.containers - Array of container objects
 * @param props.className - Additional CSS classes
 */

"use client";

import * as React from "react";
import { BrandCard, BrandButton } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Terminal, Server, HelpCircle } from "lucide-react";
import Link from "next/link";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";

import type { Container } from "@/db/repositories/containers";

interface ContainersSectionProps {
  containers: Container[];
  className?: string;
}

export function ContainersSection({
  containers,
  className,
}: ContainersSectionProps) {
  const runningContainers = containers.filter((c) => c.status === "running");

  return (
    <div className={cn("space-y-4", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Containers</h2>
            <span className="text-sm text-white/30">({containers.length})</span>
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
                Cloud-hosted ElizaOS instances running 24/7.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {containers.length > 0 && (
          <BrandButton variant="outline" asChild size="sm" className="h-8 text-xs">
            <Link href="/dashboard/containers">View All</Link>
          </BrandButton>
        )}
      </div>

      {/* Containers Content */}
      {containers.length === 0 ? (
        <ContainersEmptyState />
      ) : (
        <ContainersTable containers={containers} />
      )}
    </div>
  );
}

// Empty State
function ContainersEmptyState() {
  return (
    <BrandCard className="relative border-dashed">
      <div className="relative z-10 text-center py-6 space-y-3">
        <div className="flex justify-center">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Server className="h-6 w-6 text-blue-400" />
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium text-white mb-1">
            No containers
          </h3>
          <p className="text-xs text-white/50 max-w-xs mx-auto">
            Deploy via CLI
          </p>
        </div>

        {/* CLI Instructions */}
        <div className="max-w-md mx-auto">
          <div className="bg-black/40 border border-white/10 p-3 rounded-lg font-mono text-xs text-left space-y-1.5">
            <div className="text-white/40">$ bun install -g @elizaos/cli</div>
            <div className="text-white/70">$ elizaos deploy</div>
          </div>
        </div>

        <div className="pt-1">
          <BrandButton variant="outline" asChild size="sm" className="h-8 text-xs">
            <Link href="/dashboard/containers">
              <Terminal className="h-3.5 w-3.5 mr-1.5" />
              Learn More
            </Link>
          </BrandButton>
        </div>
      </div>
    </BrandCard>
  );
}

// Skeleton Loader
export function ContainersSectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Section Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-white/10 animate-pulse rounded" />
          <div className="h-4 w-64 bg-white/10 animate-pulse rounded mt-2" />
        </div>
        <div className="h-10 w-24 bg-white/10 animate-pulse rounded" />
      </div>

      {/* Table Skeleton */}
      <ContainersSkeleton />
    </div>
  );
}
