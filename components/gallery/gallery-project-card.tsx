/**
 * Gallery project card component for displaying community projects.
 * Shows agents, apps, and MCPs in a consistent card format with
 * HUD-style corner brackets and hover effects.
 */
"use client";

import { Bot, AppWindow, Wrench, Eye, Copy, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";
import { LikeButton } from "./like-button";

export type ProjectType = "agent" | "app" | "mcp";

export interface GalleryProject {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  image?: string;
  category?: string;
  tags: string[];
  slug?: string;
  viewCount?: number;
  likeCount?: number;
  cloneCount?: number;
  creatorName?: string;
  creatorAvatar?: string;
  submissionId?: string;
  isLiked?: boolean;
}

interface GalleryProjectCardProps {
  project: GalleryProject;
  className?: string;
  index?: number;
  enableLike?: boolean;
  onAuthRequired?: () => void;
  showFeaturedBadge?: boolean;
}

const typeConfig: Record<
  ProjectType,
  { label: string; icon: typeof Bot; color: string }
> = {
  agent: {
    label: "AGENT",
    icon: Bot,
    color: "#FF5800",
  },
  app: {
    label: "APP",
    icon: AppWindow,
    color: "#0B35F1",
  },
  mcp: {
    label: "MCP",
    icon: Wrench,
    color: "#22C55E",
  },
};

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

export function GalleryProjectCard({
  project,
  className,
  index = 0,
  enableLike = false,
  onAuthRequired,
  showFeaturedBadge = false,
}: GalleryProjectCardProps) {
  const config = typeConfig[project.type];
  const TypeIcon = config.icon;
  const hasInteractiveLike = enableLike && project.submissionId;

  const href =
    project.type === "agent" && project.slug
      ? `/chat/@${project.slug}`
      : `/gallery/${project.id}`;

  return (
    <Link
      href={href}
      className={cn(
        "group relative block bg-black/40 border border-white/10 p-4",
        "transition-all duration-300 ease-out",
        "hover:border-white/30",
        "animate-stagger-fade",
        className
      )}
      style={{
        animationDelay: `${index * 0.05}s`,
        animationFillMode: "both",
      }}
    >
      <CornerBrackets
        size="md"
        color="#E1E1E1"
        hoverColor="#FF5800"
        hoverScale
      />

      <div className="relative aspect-4/3 mb-4 overflow-hidden bg-neutral-900 border border-white/5">
        {project.image ? (
          <Image
            src={project.image}
            alt={project.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <TypeIcon
              className="w-12 h-12 opacity-20"
              style={{ color: config.color }}
            />
          </div>
        )}

        <div
          className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{
            backgroundColor: `${config.color}20`,
            border: `1px solid ${config.color}40`,
            color: config.color,
          }}
        >
          {config.label}
        </div>

        {showFeaturedBadge && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wider bg-[#FF5800]/20 border border-[#FF5800]/40 text-[#FF5800]">
            <Star className="w-3 h-3 fill-current" />
            FEATURED
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-white font-semibold truncate group-hover:text-[#FF5800] transition-colors">
          {project.name}
        </h3>

        <p className="text-white/50 text-sm line-clamp-2 min-h-10">
          {project.description}
        </p>

        {project.category && (
          <div className="text-[10px] text-white/40 uppercase tracking-wider">
            {project.category}
          </div>
        )}

        <div className="flex items-center gap-4 pt-2 text-xs text-white/40">
          {project.viewCount !== undefined && (
            <div className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>{formatCount(project.viewCount)}</span>
            </div>
          )}
          {hasInteractiveLike ? (
            <LikeButton
              submissionId={project.submissionId}
              initialLiked={project.isLiked ?? false}
              initialCount={project.likeCount ?? 0}
              size="sm"
              onAuthRequired={onAuthRequired}
            />
          ) : (
            project.likeCount !== undefined && (
              <LikeButton
                submissionId=""
                initialLiked={false}
                initialCount={project.likeCount}
                size="sm"
                disabled
                showCount
              />
            )
          )}
          {project.cloneCount !== undefined && (
            <div className="flex items-center gap-1">
              <Copy className="w-3.5 h-3.5" />
              <span>{formatCount(project.cloneCount)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function GalleryProjectCardSkeleton() {
  return (
    <div className="relative bg-black/40 border border-white/10 p-4 animate-pulse">
      <CornerBrackets size="md" color="#E1E1E1" />

      <div className="aspect-4/3 mb-4 bg-white/5" />

      <div className="space-y-2">
        <div className="h-5 bg-white/10 w-3/4" />
        <div className="h-4 bg-white/5 w-full" />
        <div className="h-4 bg-white/5 w-2/3" />
        <div className="h-3 bg-white/5 w-1/4 mt-2" />
      </div>
    </div>
  );
}
