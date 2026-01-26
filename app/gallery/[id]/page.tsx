/**
 * Gallery Detail Page
 *
 * Shows detailed information about a gallery submission.
 * Includes project info, stats, and clone functionality.
 *
 * @route GET /gallery/[id]
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { galleryService } from "@/lib/services/gallery";
import { charactersService } from "@/lib/services/characters";
import { appsService } from "@/lib/services/apps";
import { userMcpsService } from "@/lib/services/user-mcps";
import { getCurrentUser } from "@/lib/auth";
import {
  GalleryDetailClient,
  GalleryDetailSkeleton,
} from "@/components/gallery/gallery-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;

  // Validate UUID format before querying
  if (!isValidUUID(id)) {
    return {
      title: "Project Not Found | Eliza Cloud",
    };
  }

  const submission = await galleryService.getById(id);

  if (!submission) {
    return {
      title: "Project Not Found | Eliza Cloud",
    };
  }

  return {
    title: `${submission.title} | Eliza Cloud Gallery`,
    description: submission.description,
    openGraph: {
      title: submission.title,
      description: submission.description,
      type: "website",
      images: submission.preview_image_url
        ? [{ url: submission.preview_image_url }]
        : undefined,
    },
  };
}

async function getProjectDetails(
  projectType: string,
  projectId: string
): Promise<{
  name: string;
  slug?: string;
  avatar?: string;
  creatorName?: string;
} | null> {
  switch (projectType) {
    case "agent": {
      const character = await charactersService.getById(projectId);
      if (!character) return null;
      return {
        name: character.name,
        slug: character.username ?? undefined,
        avatar: character.avatar_url ?? undefined,
      };
    }
    case "app": {
      const app = await appsService.getById(projectId);
      if (!app) return null;
      return {
        name: app.name,
        slug: app.slug,
        avatar: app.logo_url ?? undefined,
      };
    }
    case "mcp": {
      const mcp = await userMcpsService.getById(projectId);
      if (!mcp) return null;
      return {
        name: mcp.name,
        slug: mcp.slug,
      };
    }
    default:
      return null;
  }
}

export default async function GalleryDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Validate UUID format before querying
  if (!isValidUUID(id)) {
    notFound();
  }

  // Fetch submission
  const submission = await galleryService.getById(id);

  if (!submission) {
    notFound();
  }

  // Only show approved/featured submissions
  if (submission.status !== "approved" && submission.status !== "featured") {
    notFound();
  }

  // Get current user for like status
  const user = await getCurrentUser();
  const isLiked = user
    ? await galleryService.hasLiked(submission.id, user.id)
    : false;

  // Get additional project details
  const projectDetails = await getProjectDetails(
    submission.project_type,
    submission.project_id
  );

  // Increment view count (fire and forget)
  void galleryService.incrementViews(submission.id);

  // Determine action URLs based on project type
  const tryItUrl =
    submission.project_type === "agent" && projectDetails?.slug
      ? `/chat/@${projectDetails.slug}`
      : submission.project_type === "app" && projectDetails?.slug
        ? `/apps/${projectDetails.slug}`
        : undefined;

  return (
    <Suspense fallback={<GalleryDetailSkeleton />}>
      <GalleryDetailClient
        submission={{
          id: submission.id,
          title: submission.title,
          description: submission.description,
          projectType: submission.project_type,
          projectId: submission.project_id,
          previewImageUrl: submission.preview_image_url ?? undefined,
          category: submission.category ?? undefined,
          tags: submission.tags,
          viewCount: submission.view_count,
          likeCount: submission.like_count,
          cloneCount: submission.clone_count,
          status: submission.status,
          createdAt: submission.created_at.toISOString(),
          projectSlug: projectDetails?.slug,
          projectAvatar: projectDetails?.avatar,
        }}
        isLiked={isLiked}
        isAuthenticated={!!user}
        tryItUrl={tryItUrl}
      />
    </Suspense>
  );
}
