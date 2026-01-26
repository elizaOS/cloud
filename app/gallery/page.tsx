/**
 * Public Community Gallery Page
 *
 * Displays public projects (agents, apps, MCPs) from the Discovery API.
 * This page is publicly accessible without authentication.
 *
 * @route GET /gallery
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import {
  CommunityGalleryPageClient,
  CommunityGalleryPageSkeleton,
} from "@/components/gallery/community-gallery-page-client";
import type {
  GalleryProject,
  ProjectType,
} from "@/components/gallery/gallery-project-card";

export const metadata: Metadata = {
  title: "Community Gallery | Eliza Cloud",
  description:
    "Discover AI agents, apps, and MCP services built by the Eliza Cloud community. Clone and customize for your own projects.",
  openGraph: {
    title: "Community Gallery | Eliza Cloud",
    description:
      "Discover AI agents, apps, and MCP services built by the Eliza Cloud community.",
    type: "website",
  },
};

interface DiscoveredService {
  id: string;
  name: string;
  description: string;
  type: "agent" | "mcp" | "a2a" | "app";
  image?: string;
  category?: string;
  tags: string[];
  slug?: string;
}

interface DiscoveryResponse {
  services: DiscoveredService[];
  total: number;
  hasMore: boolean;
}

async function getGalleryProjects(): Promise<GalleryProject[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const response = await fetch(
    `${baseUrl}/api/v1/discovery?types=agent,app,mcp&limit=100`,
    {
      next: { revalidate: 60 }, // Cache for 60 seconds
    }
  );

  if (!response.ok) {
    console.error("Failed to fetch discovery data:", response.statusText);
    return [];
  }

  const data: DiscoveryResponse = await response.json();

  // Transform discovery services to gallery projects
  return data.services
    .filter((service) => service.type !== "a2a") // Filter out a2a type
    .map((service): GalleryProject => ({
      id: service.id,
      name: service.name,
      description: service.description,
      type: service.type as ProjectType,
      image: service.image,
      category: service.category,
      tags: service.tags,
      slug: service.slug,
      // Stats will be added in Phase 3
      viewCount: 0,
      likeCount: 0,
      cloneCount: 0,
    }));
}

export default async function GalleryPage() {
  const projects = await getGalleryProjects();

  return (
    <Suspense fallback={<CommunityGalleryPageSkeleton />}>
      <CommunityGalleryPageClient initialProjects={projects} />
    </Suspense>
  );
}
