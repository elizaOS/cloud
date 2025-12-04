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
    <div className={cn("space-y-6", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white">Agents</h2>
            <span className="text-lg text-white/40">({agents.length})</span>
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
                AI characters with unique personalities. Chat with them, deploy them, or integrate via API.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-white/50 mt-1 text-sm">
            {agents.length > 0 ? "Test, edit, or view analytics for your agents" : "Create AI characters to chat, customize, and deploy"}
          </p>
        </div>
        <LockOnButton
          onClick={() => (window.location.href = "/dashboard/my-agents")}
          icon={<Plus className="h-4 w-4" />}
        >
          New Agent
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
            <div className="flex justify-center pt-2">
              <BrandButton variant="ghost" asChild>
                <Link href="/dashboard/my-agents">
                  View all {agents.length} agents
                  <Sparkles className="ml-2 h-4 w-4" />
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
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/chat?characterId=${agent.id}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#FF5800]/20 border border-[#FF5800]/40 text-[#FF5800] hover:bg-[#FF5800]/30 transition-colors"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Test
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 text-white/90 border border-white/10">
                  Chat with this agent
                </TooltipContent>
              </Tooltip>
            </Link>
            <Link href={`/dashboard/character-creator?id=${agent.id}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 text-white/90 border border-white/10">
                  Edit agent settings
                </TooltipContent>
              </Tooltip>
            </Link>
            <Link href="/dashboard/analytics">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <BarChart3 className="h-3 w-3" />
                    Stats
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 text-white/90 border border-white/10">
                  View usage analytics
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
      <CornerBrackets size="md" className="opacity-50" />
      <div className="relative z-10 text-center py-12 space-y-4">
        <div className="flex justify-center">
          <div className="p-6 rounded-full bg-[#FF5800]/10 border border-[#FF5800]/20">
            <Bot className="h-12 w-12 text-[#FF5800]" />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-2">
            No agents created yet
          </h3>
          <p className="text-white/60 max-w-md mx-auto">
            Create your first AI agent to get started. Choose from templates in
            the marketplace or build your own custom character.
          </p>
        </div>
        <div className="flex gap-3 justify-center pt-4">
          <BrandButton
            onClick={() =>
              (window.location.href = "/dashboard/character-creator")
            }
          >
            <Plus className="h-4 w-4" />
            Create Agent
          </BrandButton>
          <BrandButton
            onClick={() => (window.location.href = "/marketplace")}
            variant="outline"
          >
            <Sparkles className="h-4 w-4" />
            Browse Marketplace
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
