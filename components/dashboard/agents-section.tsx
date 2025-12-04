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
import { Bot, Plus, Sparkles, HelpCircle, MessageSquare, Pencil, BarChart3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Agent {
  id: string;
  name: string;
  bio: string | string[];
  avatarUrl: string | null;
  category: string | null;
  isPublic: boolean;
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
          <div className="grid gap-4 md:grid-cols-2">
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
  const truncatedBio =
    bioText.length > 80 ? `${bioText.substring(0, 80)}...` : bioText;

  return (
    <BrandCard
      corners={true}
      cornerSize="sm"
      className="group transition-all duration-300 hover:border-[#FF5800]/50"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative h-14 w-14 flex-shrink-0 rounded-sm overflow-hidden bg-gradient-to-br from-[#FF5800]/20 to-orange-600/20 border border-white/10 flex items-center justify-center">
          {agent.avatarUrl ? (
            <Image
              src={agent.avatarUrl}
              alt={agent.name}
              fill
              className="object-cover"
            />
          ) : (
            <Bot className="h-7 w-7 text-white/40" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white truncate">
              {agent.name}
            </h3>
            {agent.category && (
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {agent.category}
              </Badge>
            )}
          </div>
          <p className="text-xs text-white/50 line-clamp-1 mb-3">{truncatedBio}</p>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <Link href={`/dashboard/chat?characterId=${agent.id}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[#FF5800]/15 border border-[#FF5800]/30 text-[#FF5800] hover:bg-[#FF5800]/25 transition-colors rounded-sm"
                  >
                    <MessageSquare className="h-2.5 w-2.5" />
                    Test
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs bg-zinc-900 text-white/80 border border-white/10">
                  Chat
                </TooltipContent>
              </Tooltip>
            </Link>
            <Link href={`/dashboard/character-creator?id=${agent.id}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors rounded-sm"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                    Edit
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs bg-zinc-900 text-white/80 border border-white/10">
                  Edit
                </TooltipContent>
              </Tooltip>
            </Link>
            <Link href="/dashboard/analytics">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors rounded-sm"
                  >
                    <BarChart3 className="h-2.5 w-2.5" />
                    Stats
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs bg-zinc-900 text-white/80 border border-white/10">
                  Analytics
                </TooltipContent>
              </Tooltip>
            </Link>
          </div>
        </div>
      </div>
    </BrandCard>
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
            Create an agent or browse the marketplace
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
            Create
          </BrandButton>
          <BrandButton
            onClick={() => (window.location.href = "/marketplace")}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Marketplace
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
          <div className="h-8 w-48 bg-white/10 animate-pulse rounded" />
          <div className="h-4 w-64 bg-white/10 animate-pulse rounded mt-2" />
        </div>
        <div className="h-10 w-32 bg-white/10 animate-pulse rounded" />
      </div>

      {/* Agents Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, index) => (
          <BrandCard key={index} corners={true} cornerSize="sm">
            <div className="flex items-center gap-4">
              {/* Avatar skeleton */}
              <div className="h-16 w-16 flex-shrink-0 rounded-sm bg-white/10 animate-pulse" />

              {/* Content skeleton */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-24 bg-white/10 animate-pulse rounded" />
                  <div className="h-4 w-16 bg-white/10 animate-pulse rounded" />
                </div>
                {/* Bio skeleton */}
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-white/10 animate-pulse rounded" />
                  <div className="h-3 w-3/4 bg-white/10 animate-pulse rounded" />
                </div>
              </div>
            </div>
          </BrandCard>
        ))}
      </div>
    </div>
  );
}
