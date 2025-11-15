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
import { cn } from "@/lib/utils";
import { Bot, MessageSquare, Plus, Sparkles } from "lucide-react";
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
  // Show max 5 agents on dashboard (3-column grid, 2 rows)
  const displayAgents = agents.slice(0, 5);
  const hasMore = agents.length > 5;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-bold text-white flex items-center gap-2"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontSize: "24px",
              lineHeight: "32px",
              fontWeight: 700,
            }}
          >
            Agents
            <span
              className="text-lg text-white/40"
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontSize: "16px",
                fontWeight: 400,
              }}
            >
              ({agents.length})
            </span>
          </h2>
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {/* View All Link */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <BrandButton variant="ghost" asChild>
                <Link
                  href="/dashboard/my-agents"
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontSize: "14px",
                  }}
                >
                  View All
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
    <Link href={`/dashboard/chat?characterId=${agent.id}`}>
      <BrandCard
        corners={false}
        hover
        className="group transition-all duration-300 hover:border-white/30 overflow-hidden p-0 bg-[#161616]"
      >
        <div className="relative h-[320px] w-full overflow-hidden bg-gradient-to-br from-white/5 to-white/10">
          {agent.avatarUrl ? (
            <Image
              src={agent.avatarUrl}
              alt={agent.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Bot className="h-20 w-20 text-white/20" />
            </div>
          )}

          {/* Status badge overlay */}
          {agent.category && (
            <div className="absolute top-3 right-3">
              <Badge
                variant="outline"
                className="text-xs bg-black/60 backdrop-blur-sm border-white/20 text-white"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontSize: "10px",
                }}
              >
                {agent.category}
              </Badge>
            </div>
          )}
        </div>

        {/* Agent Info */}
        <div className="p-4 space-y-2">
          <h3
            className="font-semibold text-white group-hover:text-[#FF5800] transition-colors truncate"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontSize: "16px",
              lineHeight: "20px",
              fontWeight: 600,
            }}
          >
            {agent.name}
          </h3>
          <p
            className="text-sm text-white/60 line-clamp-2"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontSize: "12px",
              lineHeight: "16px",
            }}
          >
            {truncatedBio}
          </p>
        </div>
      </BrandCard>
    </Link>
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
