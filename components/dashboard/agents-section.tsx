/**
 * Agents Section Component
 * Displays user's agents in a card grid layout
 */

"use client";

import * as React from "react";
import {
  BrandCard,
  CornerBrackets,
  BrandButton,
  LockOnButton,
} from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Bot, Plus, HelpCircle, MessageSquare, Clock, Rocket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface AgentStats {
  roomCount: number;
  messageCount: number;
  deploymentStatus: "deployed" | "stopped" | "draft";
  lastActiveAt: Date | null;
}

interface Agent {
  id: string;
  name: string;
  bio: string | string[];
  avatarUrl: string | null;
  category: string | null;
  isPublic: boolean;
  stats?: AgentStats;
}

interface AgentsSectionProps {
  agents: Agent[];
  className?: string;
}

export function AgentsSection({ agents, className }: AgentsSectionProps) {
  // Show max 4 agents on dashboard (2x2 grid)
  const displayAgents = agents.slice(0, 4);
  const hasMore = agents.length > 4;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Agents</h2>
            <span className="text-sm text-white/30">({agents.length})</span>
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
                Your AI characters. Chat, deploy, or integrate via API.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-white/40 mt-0.5 text-xs">
            {agents.length > 0 ? "Manage your agents" : "Create your first agent"}
          </p>
        </div>
        <LockOnButton
          onClick={() => (window.location.href = "/dashboard/my-agents")}
          icon={<Plus className="h-4 w-4" />}
        >
          New
        </LockOnButton>
      </div>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <AgentsEmptyState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 auto-rows-fr">
            {displayAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {/* View All Link */}
          {hasMore && (
            <div className="flex justify-center">
              <BrandButton variant="ghost" asChild size="sm" className="text-xs h-8">
                <Link href="/dashboard/my-agents">
                  View all ({agents.length})
                </Link>
              </BrandButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Individual Agent Card
function AgentCard({ agent }: { agent: Agent }) {
  const bioText = Array.isArray(agent.bio) ? agent.bio[0] : agent.bio;
  const isDeployed = agent.stats?.deploymentStatus === "deployed";
  const isStopped = agent.stats?.deploymentStatus === "stopped";

  return (
    <Link href={`/dashboard/chat?characterId=${agent.id}`} className="block h-full">
      <div className="group relative h-full overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 transition-all duration-300 hover:border-[#FF5800]/50 hover:shadow-lg hover:shadow-[#FF5800]/10 p-4">
        <div className="flex items-start gap-4 h-full">
          {/* Avatar - Left side icon */}
          <div className="relative h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-[#FF5800]/20 to-zinc-800 border border-zinc-700/50">
            {agent.avatarUrl ? (
              <Image
                src={agent.avatarUrl}
                alt={agent.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-110"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Bot className="h-8 w-8 text-white/40" />
              </div>
            )}
            {/* Status indicator dot */}
            {isDeployed && (
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 border-2 border-black" />
            )}
          </div>

          {/* Content - Right side */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Name & Status */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-white truncate group-hover:text-[#FF5800] transition-colors">
                {agent.name}
              </h3>
              {isDeployed && (
                <Badge className="bg-green-600/80 text-[10px] px-1.5 py-0 h-4">
                  <Rocket className="h-2.5 w-2.5 mr-0.5" />
                  Live
                </Badge>
              )}
              {isStopped && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-600/30 text-yellow-400/80">
                  Stopped
                </Badge>
              )}
            </div>
            
            {/* Bio - Fixed 1 line to make room for stats */}
            <p className="text-xs text-white/50 line-clamp-1 leading-relaxed">
              {bioText}
            </p>
            
            {/* Stats row - Always at bottom */}
            <div className="flex items-center gap-3 mt-auto pt-2 text-[11px] text-white/40">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {agent.stats?.roomCount ?? 0} chats
              </span>
              {agent.stats?.lastActiveAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(agent.stats.lastActiveAt), { addSuffix: true })}
                </span>
              )}
              {agent.category && (
                <span className="flex items-center gap-1 ml-auto text-white/30">
                  {agent.category}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Corner accent */}
        <div className="absolute top-0 right-0 w-6 h-6 overflow-hidden">
          <div className="absolute -top-3 -right-3 w-6 h-6 bg-gradient-to-bl from-[#FF5800]/20 to-transparent rotate-45" />
        </div>
      </div>
    </Link>
  );
}

// Empty State
function AgentsEmptyState() {
  return (
    <BrandCard className="relative border-dashed">
      <CornerBrackets size="md" className="opacity-30" />
      <div className="relative z-10 text-center py-8 space-y-3">
        <div className="flex justify-center">
          <div className="p-4 rounded-lg bg-[#FF5800]/10 border border-[#FF5800]/20">
            <Bot className="h-8 w-8 text-[#FF5800]" />
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium text-white mb-1">
            No agents yet
          </h3>
          <p className="text-xs text-white/50 max-w-xs mx-auto">
            Create your first AI agent to get started
          </p>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <BrandButton
            onClick={() =>
              (window.location.href = "/dashboard/character-creator")
            }
            size="sm"
            className="h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Agent
          </BrandButton>
        </div>
      </div>
    </BrandCard>
  );
}

// Skeleton Loader
export function AgentsSectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Section Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-zinc-800 animate-pulse rounded" />
          <div className="h-4 w-64 bg-zinc-800 animate-pulse rounded mt-2" />
        </div>
        <div className="h-10 w-32 bg-zinc-800 animate-pulse rounded" />
      </div>

      {/* Agents Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 auto-rows-fr">
        {[...Array(4)].map((_, index) => (
          <div 
            key={index} 
            className="rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-4 h-[120px]"
          >
            <div className="flex items-start gap-4">
              {/* Avatar skeleton */}
              <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-zinc-800 animate-pulse" />
              
              {/* Content skeleton */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-24 bg-zinc-800 animate-pulse rounded" />
                  <div className="h-4 w-16 bg-zinc-800 animate-pulse rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-zinc-800 animate-pulse rounded" />
                  <div className="h-3 w-3/4 bg-zinc-800 animate-pulse rounded" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-3 w-3 bg-zinc-800 animate-pulse rounded" />
                  <div className="h-2 w-16 bg-zinc-800 animate-pulse rounded" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
