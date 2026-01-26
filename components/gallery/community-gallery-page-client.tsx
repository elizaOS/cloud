/**
 * Community Gallery page client component.
 * Displays public projects (agents, apps, MCPs) from the Discovery API.
 * Supports filtering by type, sorting, and featured projects carousel.
 */
"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Bot,
  AppWindow,
  Wrench,
  LayoutGrid,
  Search,
  ArrowUpDown,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  GalleryProjectCard,
  GalleryProjectCardSkeleton,
  type GalleryProject,
} from "./gallery-project-card";
import {
  BrandTabsResponsive,
  BrandTabsContent,
  BrandCard,
  HUDContainer,
  CornerBrackets,
} from "@/components/brand";
import type { TabItem } from "@/components/brand";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

type TabType = "all" | "agent" | "app" | "mcp";
type SortOption = "newest" | "popular" | "most_cloned" | "trending";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Popular" },
  { value: "most_cloned", label: "Most Cloned" },
  { value: "trending", label: "Trending" },
];

interface CommunityGalleryPageClientProps {
  initialProjects: GalleryProject[];
  featuredProjects?: GalleryProject[];
}

export function CommunityGalleryPageClient({
  initialProjects,
  featuredProjects = [],
}: CommunityGalleryPageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const carouselRef = useRef<HTMLDivElement>(null);

  const initialTab = useMemo(() => {
    const tabParam = searchParams.get("type");
    if (
      tabParam === "agent" ||
      tabParam === "app" ||
      tabParam === "mcp"
    ) {
      return tabParam;
    }
    return "all";
  }, [searchParams]);

  const initialSort = useMemo(() => {
    const sortParam = searchParams.get("sort");
    if (
      sortParam === "newest" ||
      sortParam === "popular" ||
      sortParam === "most_cloned" ||
      sortParam === "trending"
    ) {
      return sortParam;
    }
    return "newest";
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [sortBy, setSortBy] = useState<SortOption>(initialSort);
  const [searchQuery, setSearchQuery] = useState("");

  const handleTabChange = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      const url = new URL(window.location.href);
      if (tab === "all") {
        url.searchParams.delete("type");
      } else {
        url.searchParams.set("type", tab);
      }
      router.replace(url.pathname + url.search, { scroll: false });
    },
    [router]
  );

  const handleSortChange = useCallback(
    (sort: SortOption) => {
      setSortBy(sort);
      const url = new URL(window.location.href);
      if (sort === "newest") {
        url.searchParams.delete("sort");
      } else {
        url.searchParams.set("sort", sort);
      }
      router.replace(url.pathname + url.search, { scroll: false });
    },
    [router]
  );

  const scrollCarousel = useCallback((direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const scrollAmount = 320;
    carouselRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  const galleryTabs: TabItem[] = useMemo(() => {
    const agentCount = initialProjects.filter((p) => p.type === "agent").length;
    const appCount = initialProjects.filter((p) => p.type === "app").length;
    const mcpCount = initialProjects.filter((p) => p.type === "mcp").length;

    return [
      {
        value: "all",
        label: `All (${initialProjects.length})`,
        icon: <LayoutGrid className="h-4 w-4" />,
      },
      {
        value: "agent",
        label: `Agents (${agentCount})`,
        icon: <Bot className="h-4 w-4" />,
      },
      {
        value: "app",
        label: `Apps (${appCount})`,
        icon: <AppWindow className="h-4 w-4" />,
      },
      {
        value: "mcp",
        label: `MCPs (${mcpCount})`,
        icon: <Wrench className="h-4 w-4" />,
      },
    ];
  }, [initialProjects]);

  const filteredProjects = useMemo(() => {
    let projects = [...initialProjects];

    if (activeTab !== "all") {
      projects = projects.filter((p) => p.type === activeTab);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query) ||
          p.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    projects.sort((a, b) => {
      switch (sortBy) {
        case "popular":
          return (b.likeCount ?? 0) - (a.likeCount ?? 0);
        case "most_cloned":
          return (b.cloneCount ?? 0) - (a.cloneCount ?? 0);
        case "trending": {
          const aScore = (a.viewCount ?? 0) + (a.likeCount ?? 0) * 2;
          const bScore = (b.viewCount ?? 0) + (b.likeCount ?? 0) * 2;
          return bScore - aScore;
        }
        case "newest":
          return 0;
      }
    });

    return projects;
  }, [initialProjects, activeTab, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/10 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Community Gallery
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mb-8">
            Discover agents, apps, and MCP services built by the Eliza Cloud
            community. Clone and customize for your own projects.
          </p>

          <HUDContainer
            cornerSize="md"
            cornerColor="#E1E1E1"
            className="max-w-xl"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-transparent border-0 text-white placeholder:text-white/40 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </HUDContainer>
        </div>
      </div>

      {featuredProjects.length > 0 && (
        <div className="border-b border-white/10 bg-linear-to-b from-[#FF5800]/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#FF5800]/20 border border-[#FF5800]/40">
                  <Star className="w-5 h-5 text-[#FF5800]" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Featured Projects</h2>
                  <p className="text-sm text-white/50">Handpicked by the community</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollCarousel("left")}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollCarousel("right")}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
            >
              {featuredProjects.map((project, index) => (
                <div
                  key={project.id}
                  className="shrink-0 w-[300px] snap-start"
                >
                  <div className="relative">
                    <CornerBrackets
                      size="lg"
                      color="#FF5800"
                      className="absolute inset-0 z-10 pointer-events-none"
                    />
                    <GalleryProjectCard
                      project={project}
                      index={index}
                      showFeaturedBadge
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-white/50" />
            <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortOption)}>
              <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <BrandTabsResponsive
          id="gallery-type-tabs"
          tabs={galleryTabs}
          value={activeTab}
          onValueChange={(v) => handleTabChange(v as TabType)}
        >
          <BrandTabsContent value={activeTab} className="mt-6">
            {filteredProjects.length === 0 ? (
              <BrandCard corners={false} className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-4 mb-4">
                    <Search className="w-8 h-8 text-[#FF5800]" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No projects found
                  </h3>
                  <p className="text-white/50 max-w-md">
                    {searchQuery
                      ? `No projects match "${searchQuery}". Try a different search term.`
                      : "No projects available in this category yet."}
                  </p>
                </div>
              </BrandCard>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProjects.map((project, index) => (
                  <GalleryProjectCard
                    key={project.id}
                    project={project}
                    index={index}
                  />
                ))}
              </div>
            )}
          </BrandTabsContent>
        </BrandTabsResponsive>
      </div>
    </div>
  );
}

export function CommunityGalleryPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="border-b border-white/10 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="h-12 bg-white/10 w-80 mb-4 animate-pulse" />
          <div className="h-6 bg-white/5 w-96 max-w-full mb-8 animate-pulse" />
          <div className="h-12 bg-white/5 w-96 max-w-full animate-pulse" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-10 bg-white/5 w-full max-w-md mb-8 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {SKELETON_KEYS.map((key) => (
            <GalleryProjectCardSkeleton key={key} />
          ))}
        </div>
      </div>
    </div>
  );
}
