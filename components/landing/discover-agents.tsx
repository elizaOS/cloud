/**
 * Discover agents section for the landing page.
 * Fetches real public agents from the Discovery API and displays them.
 * Falls back to showing a "View Gallery" prompt if no agents are available.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Bot } from "lucide-react";
import { CornerBrackets } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";

// Static keys for skeleton loaders to satisfy linter
const SKELETON_KEYS = [
  "skel-a",
  "skel-b",
  "skel-c",
  "skel-d",
  "skel-e",
  "skel-f",
  "skel-g",
  "skel-h",
];

interface DiscoveredAgent {
  id: string;
  name: string;
  description: string;
  type: string;
  image?: string;
  category?: string;
  tags: string[];
  slug?: string;
}

interface DiscoveryResponse {
  services: DiscoveredAgent[];
  total: number;
}

function AgentCard({
  agent,
  index,
}: {
  agent: DiscoveredAgent;
  index: number;
}) {
  const href = agent.slug ? `/chat/@${agent.slug}` : `/gallery/${agent.id}`;

  return (
    <Link
      href={href}
      className="group block relative bg-black/40 border border-white/10 p-3 transition-all duration-300 hover:border-white/30 animate-stagger-fade"
      style={{
        animationDelay: `${index * 0.05}s`,
        animationFillMode: "both",
      }}
    >
      <CornerBrackets
        size="sm"
        color="#E1E1E1"
        hoverColor="#FF5800"
        hoverScale
      />

      {/* Image container */}
      <div className="relative aspect-4/3 overflow-hidden bg-neutral-900 border border-white/5 mb-3">
        {agent.image ? (
          <Image
            src={agent.image}
            alt={agent.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Bot className="w-10 h-10 text-[#FF5800] opacity-20" />
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold tracking-wider bg-[#FF580020] border border-[#FF5800]/40 text-[#FF5800]">
          AGENT
        </div>
      </div>

      {/* Agent info */}
      <div className="space-y-1">
        <h3 className="text-white font-medium truncate group-hover:text-[#FF5800] transition-colors">
          {agent.name}
        </h3>
        <p className="text-white/50 text-sm line-clamp-2 min-h-10">
          {agent.description}
        </p>
        {agent.category && (
          <p className="text-[10px] text-white/40 uppercase tracking-wider">
            {agent.category}
          </p>
        )}
      </div>
    </Link>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="relative bg-black/40 border border-white/10 p-3 animate-pulse">
      <CornerBrackets size="sm" color="#E1E1E1" />
      <div className="aspect-4/3 bg-white/5 mb-3" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4 bg-white/10" />
        <Skeleton className="h-4 w-full bg-white/5" />
        <Skeleton className="h-4 w-2/3 bg-white/5" />
      </div>
    </div>
  );
}

export default function DiscoverAgents() {
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await fetch(
          "/api/v1/discovery?types=agent&limit=8&activeOnly=true"
        );
        if (response.ok) {
          const data: DiscoveryResponse = await response.json();
          setAgents(data.services);
        }
      } catch (error) {
        console.error("Failed to fetch agents:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAgents();
  }, []);

  // Don't render section if no agents and not loading
  if (!isLoading && agents.length === 0) {
    return null;
  }

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24 bg-black">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">
              Discover agents
            </h2>
            <p className="text-white/50 mt-1">
              Explore AI agents built by the community
            </p>
          </div>
          <Link
            href="/gallery"
            className="flex items-center gap-1 text-white/70 hover:text-[#FF5800] transition-colors text-sm sm:text-base"
          >
            View all
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading
            ? SKELETON_KEYS.map((key) => <AgentCardSkeleton key={key} />)
            : agents.map((agent, index) => (
                <AgentCard key={agent.id} agent={agent} index={index} />
              ))}
        </div>
      </div>
    </section>
  );
}
