/**
 * Gallery Detail Client Component
 *
 * Client-side component for displaying detailed gallery submission info.
 * Supports interactive like button and clone functionality.
 */
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  AppWindow,
  Wrench,
  Eye,
  Copy,
  ArrowLeft,
  ExternalLink,
  Calendar,
  Loader2,
  Star,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandButton, BrandCard, CornerBrackets } from "@/components/brand";
import { LikeButton } from "./like-button";
import { cloneGalleryProject } from "@/app/actions/community-gallery";
import type { GalleryProjectType } from "@/db/schemas/gallery-submissions";

interface GalleryDetailSubmission {
  id: string;
  title: string;
  description: string;
  projectType: GalleryProjectType;
  projectId: string;
  previewImageUrl?: string;
  category?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  cloneCount: number;
  status: string;
  createdAt: string;
  projectSlug?: string;
  projectAvatar?: string;
}

interface GalleryDetailClientProps {
  submission: GalleryDetailSubmission;
  isLiked: boolean;
  isAuthenticated: boolean;
  tryItUrl?: string;
}

const typeConfig: Record<
  GalleryProjectType,
  { label: string; icon: typeof Bot; color: string; description: string }
> = {
  agent: {
    label: "AI Agent",
    icon: Bot,
    color: "#FF5800",
    description: "An AI agent built with ElizaOS",
  },
  app: {
    label: "Web App",
    icon: AppWindow,
    color: "#0B35F1",
    description: "A web application built on Eliza Cloud",
  },
  mcp: {
    label: "MCP Service",
    icon: Wrench,
    color: "#22C55E",
    description: "A Model Context Protocol service",
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

export function GalleryDetailClient({
  submission,
  isLiked,
  isAuthenticated,
  tryItUrl,
}: GalleryDetailClientProps) {
  const router = useRouter();
  const [isCloning, setIsCloning] = useState(false);
  const [cloneCount, setCloneCount] = useState(submission.cloneCount);

  const config = typeConfig[submission.projectType];
  const TypeIcon = config.icon;

  const handleClone = async () => {
    if (!isAuthenticated) {
      router.push(`/login?intent=signup&redirect=/gallery/${submission.id}`);
      return;
    }

    setIsCloning(true);

    try {
      const result = await cloneGalleryProject(submission.id);
      setCloneCount((prev) => prev + 1);

      toast.success("Project cloned successfully!");

      // Redirect to the cloned project
      if (result.redirectUrl) {
        router.push(result.redirectUrl);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clone project";
      toast.error(message);
    } finally {
      setIsCloning(false);
    }
  };

  const handleAuthRequired = () => {
    router.push(`/login?intent=signup&redirect=/gallery/${submission.id}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/gallery"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Preview & Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Preview Image */}
            <BrandCard hover={false} corners cornerSize="lg" className="p-0 overflow-hidden">
              <div className="relative aspect-video bg-neutral-900">
                {submission.previewImageUrl ? (
                  <Image
                    src={submission.previewImageUrl}
                    alt={submission.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 66vw"
                    priority
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <TypeIcon
                      className="w-24 h-24 opacity-20"
                      style={{ color: config.color }}
                    />
                  </div>
                )}

                {/* Featured Badge */}
                {submission.status === "featured" && (
                  <div className="absolute top-4 right-4 px-3 py-1.5 bg-[#FF5800] text-white text-sm font-bold flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-current" />
                    FEATURED
                  </div>
                )}

                {/* Type Badge */}
                <div
                  className="absolute top-4 left-4 px-3 py-1.5 text-sm font-bold tracking-wider flex items-center gap-2"
                  style={{
                    backgroundColor: `${config.color}20`,
                    border: `1px solid ${config.color}40`,
                    color: config.color,
                  }}
                >
                  <TypeIcon className="w-4 h-4" />
                  {config.label.toUpperCase()}
                </div>
              </div>
            </BrandCard>

            {/* Description */}
            <BrandCard hover={false} corners cornerSize="md">
              <h2 className="text-lg font-semibold text-white mb-3">
                Description
              </h2>
              <p className="text-white/70 leading-relaxed whitespace-pre-wrap">
                {submission.description}
              </p>
            </BrandCard>

            {/* Tags */}
            {submission.tags.length > 0 && (
              <BrandCard hover={false} corners cornerSize="md">
                <h2 className="text-lg font-semibold text-white mb-3">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {submission.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-white/5 border border-white/10 text-white/70 text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </BrandCard>
            )}
          </div>

          {/* Right Column - Info & Actions */}
          <div className="space-y-6">
            {/* Title & Actions */}
            <BrandCard hover={false} corners cornerSize="md">
              <h1 className="text-2xl font-bold text-white mb-2">
                {submission.title}
              </h1>

              {submission.category && (
                <p className="text-white/50 text-sm uppercase tracking-wider mb-4">
                  {submission.category}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                {tryItUrl && (
                  <BrandButton
                    variant="primary"
                    size="lg"
                    className="w-full"
                    asChild
                  >
                    <Link href={tryItUrl}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Try It
                    </Link>
                  </BrandButton>
                )}

                <BrandButton
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={handleClone}
                  disabled={isCloning}
                >
                  {isCloning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cloning...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Clone Project
                    </>
                  )}
                </BrandButton>
              </div>
            </BrandCard>

            {/* Stats */}
            <BrandCard hover={false} corners cornerSize="md">
              <h2 className="text-lg font-semibold text-white mb-4">Stats</h2>
              <div className="space-y-3">
                {/* Views */}
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <div className="flex items-center gap-2 text-white/60">
                    <Eye className="w-4 h-4" />
                    <span>Views</span>
                  </div>
                  <span className="text-white font-medium">
                    {formatCount(submission.viewCount)}
                  </span>
                </div>

                {/* Likes */}
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <div className="flex items-center gap-2 text-white/60">
                    <span>Likes</span>
                  </div>
                  <LikeButton
                    submissionId={submission.id}
                    initialLiked={isLiked}
                    initialCount={submission.likeCount}
                    size="md"
                    onAuthRequired={handleAuthRequired}
                    requireAuth={!isAuthenticated}
                  />
                </div>

                {/* Clones */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-white/60">
                    <Copy className="w-4 h-4" />
                    <span>Clones</span>
                  </div>
                  <span className="text-white font-medium">
                    {formatCount(cloneCount)}
                  </span>
                </div>
              </div>
            </BrandCard>

            {/* Info */}
            <BrandCard hover={false} corners cornerSize="md">
              <h2 className="text-lg font-semibold text-white mb-4">Info</h2>
              <div className="space-y-3">
                {/* Type */}
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-white/60">Type</span>
                  <div
                    className="flex items-center gap-2"
                    style={{ color: config.color }}
                  >
                    <TypeIcon className="w-4 h-4" />
                    <span className="font-medium">{config.label}</span>
                  </div>
                </div>

                {/* Category */}
                {submission.category && (
                  <div className="flex items-center justify-between py-2 border-b border-white/10">
                    <span className="text-white/60">Category</span>
                    <span className="text-white font-medium">
                      {submission.category}
                    </span>
                  </div>
                )}

                {/* Created */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-white/60">Submitted</span>
                  <div className="flex items-center gap-2 text-white">
                    <Calendar className="w-4 h-4 text-white/60" />
                    <span className="font-medium">
                      {format(new Date(submission.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
              </div>
            </BrandCard>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GalleryDetailSkeleton() {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header Skeleton */}
      <div className="border-b border-white/10 bg-black/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="h-6 w-32 bg-white/10 animate-pulse" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="aspect-video bg-white/5 animate-pulse" />
            <div className="space-y-3 p-6 border border-white/10">
              <div className="h-6 w-32 bg-white/10 animate-pulse" />
              <div className="h-4 w-full bg-white/5 animate-pulse" />
              <div className="h-4 w-3/4 bg-white/5 animate-pulse" />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <div className="p-6 border border-white/10 space-y-4">
              <div className="h-8 w-48 bg-white/10 animate-pulse" />
              <div className="h-12 w-full bg-white/5 animate-pulse" />
              <div className="h-12 w-full bg-white/5 animate-pulse" />
            </div>
            <div className="p-6 border border-white/10 space-y-3">
              <div className="h-6 w-24 bg-white/10 animate-pulse" />
              <div className="h-8 w-full bg-white/5 animate-pulse" />
              <div className="h-8 w-full bg-white/5 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
