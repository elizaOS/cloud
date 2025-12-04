/**
 * Containers Section Component
 * Displays deployed containers table on dashboard
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
    <div className={cn("space-y-6", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white">Containers</h2>
            <span className="text-lg text-white/40">({containers.length})</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="max-w-[220px] bg-zinc-900 text-white/90 border border-white/10"
              >
                Cloud-hosted ElizaOS instances. Deploy agents to run 24/7 with their own API endpoints.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-white/50 mt-1 text-sm">
            {runningContainers.length > 0
              ? `${runningContainers.length} running — deploy agents to the cloud`
              : "Deploy agents to run 24/7 in the cloud"}
          </p>
        </div>
        {containers.length > 0 && (
          <BrandButton variant="outline" asChild>
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
      <div className="relative z-10 text-center py-12 space-y-4">
        <div className="flex justify-center">
          <div className="p-6 rounded-full bg-blue-500/10 border border-blue-500/20">
            <Server className="h-12 w-12 text-blue-400" />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-2">
            No containers deployed
          </h3>
          <p className="text-white/60 max-w-md mx-auto mb-6">
            Deploy your first ElizaOS container using the CLI to get started
          </p>
        </div>

        {/* CLI Instructions */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-black/60 border border-white/10 p-6 rounded-none font-mono text-sm text-left space-y-3">
            <div className="flex items-center gap-2 text-[#FF5800] mb-4">
              <Terminal className="h-4 w-4" />
              <span className="font-sans font-semibold">Quick Start</span>
            </div>

            <div>
              <div className="text-white/50 mb-1 font-sans text-xs">
                # Install ElizaOS CLI
              </div>
              <div className="text-white">bun install -g @elizaos/cli</div>
            </div>

            <div>
              <div className="text-white/50 mb-1 font-sans text-xs">
                # Deploy your project
              </div>
              <div className="text-white/70">cd your-elizaos-project</div>
              <div className="text-white">elizaos deploy</div>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <BrandButton variant="outline" asChild>
            <Link href="/dashboard/containers">
              <Terminal className="h-4 w-4 mr-2" />
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
