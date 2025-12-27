/**
 * Gallery page client component displaying user's AI-generated and uploaded media.
 * Supports filtering by type and source, displays stats, upload, and collection management.
 */
"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { GalleryGrid, GalleryGridSkeleton } from "./gallery-grid";
import { uploadMedia } from "@/app/actions/gallery";
import type { GalleryItem } from "@/app/actions/gallery";
import {
  ImageIcon,
  VideoIcon,
  LayoutGridIcon,
  Upload,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import {
  BrandTabsResponsive,
  BrandTabsContent,
  BrandCard,
  BrandButton,
} from "@/components/brand";
import type { TabItem } from "@/components/brand";
import { CollectionsTab } from "@/components/collections/collections-tab";
import {
  useGalleryData,
  invalidateGalleryItems,
} from "@/lib/hooks/use-gallery-data";

type SourceFilter = "all" | "generation" | "upload";
type TypeFilter = "all" | "image" | "video" | "collections";

export function GalleryPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get initial tab from URL query param
  const initialTab = useMemo(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "image" || tabParam === "video" || tabParam === "collections") {
      return tabParam;
    }
    return "all";
  }, [searchParams]);

  useSetPageHeader({
    title: "Gallery",
    description: "View and manage your AI-generated images and uploads",
  });

  const [activeTab, setActiveTab] = useState<TypeFilter>(initialTab);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use deduplicated gallery data hook
  const galleryOptions = useMemo(
    () => ({
      type:
        activeTab === "collections"
          ? undefined
          : activeTab === "all"
            ? undefined
            : activeTab,
      source: sourceFilter === "all" ? undefined : sourceFilter,
      limit: 100,
      skipItems: activeTab === "collections",
    }),
    [activeTab, sourceFilter],
  );

  const {
    items,
    stats,
    collections,
    isLoadingItems,
    isLoadingStats,
    refetchItems,
    refetchStats,
  } = useGalleryData(galleryOptions);

  // Update URL when tab changes
  const handleTabChange = useCallback((tab: TypeFilter) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "all") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const galleryTabs: TabItem[] = useMemo(
    () => [
      {
        value: "all",
        label: "All Media",
        icon: <LayoutGridIcon className="h-4 w-4" />,
      },
      {
        value: "image",
        label: stats ? `Images (${stats.totalImages})` : "Images",
        icon: <ImageIcon className="h-4 w-4" />,
      },
      {
        value: "video",
        label: stats ? `Videos (${stats.totalVideos})` : "Videos",
        icon: <VideoIcon className="h-4 w-4" />,
      },
      {
        value: "collections",
        label: "Collections",
        icon: <FolderOpen className="h-4 w-4" />,
      },
    ],
    [stats],
  );

  const refreshData = async () => {
    invalidateGalleryItems();
    await Promise.all([refetchItems(), refetchStats()]);
  };

  const handleItemDeleted = () => {
    void refreshData();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadPromises: Promise<GalleryItem>[] = [];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      uploadPromises.push(uploadMedia(formData));
    }

    const results = await Promise.allSettled(uploadPromises);
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.filter((r) => r.status === "rejected").length;

    if (successCount > 0) {
      toast.success(
        `Uploaded ${successCount} file${successCount > 1 ? "s" : ""}`,
      );
    }
    if (failCount > 0) {
      toast.error(
        `Failed to upload ${failCount} file${failCount > 1 ? "s" : ""}`,
      );
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setIsUploading(false);
    void refreshData();
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*"
        multiple
        onChange={handleFileSelect}
      />

      {/* Stats Row - hide for collections tab */}
      {activeTab !== "collections" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {isLoadingStats ? (
            <>
              <BrandCard corners={false} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              </BrandCard>
              <BrandCard corners={false} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              </BrandCard>
              <BrandCard corners={false} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              </BrandCard>
              <BrandCard corners={false} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              </BrandCard>
            </>
          ) : stats ? (
            <>
              <BrandCard corners={false} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500/20 border border-blue-500/40 p-2">
                    <ImageIcon className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">
                      {stats.totalImages}
                    </p>
                    <p className="text-xs text-white/50 uppercase tracking-wide">
                      Images
                    </p>
                  </div>
                </div>
              </BrandCard>

              <BrandCard corners={false} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-purple-500/20 border border-purple-500/40 p-2">
                    <VideoIcon className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">
                      {stats.totalVideos}
                    </p>
                    <p className="text-xs text-white/50 uppercase tracking-wide">
                      Videos
                    </p>
                  </div>
                </div>
              </BrandCard>

              <BrandCard corners={false} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-cyan-500/20 border border-cyan-500/40 p-2">
                    <Upload className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">
                      {stats.totalUploads}
                    </p>
                    <p className="text-xs text-white/50 uppercase tracking-wide">
                      Uploads
                    </p>
                  </div>
                </div>
              </BrandCard>

              <BrandCard corners={false} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-500/20 border border-green-500/40 p-2">
                    <LayoutGridIcon className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">
                      {(stats.totalSize / 1024 / 1024).toFixed(1)} MB
                    </p>
                    <p className="text-xs text-white/50 uppercase tracking-wide">
                      Total Size
                    </p>
                  </div>
                </div>
              </BrandCard>
            </>
          ) : null}
        </div>
      )}

      {/* Source filter and Upload button - hide for collections tab */}
      {activeTab !== "collections" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/50">Source:</span>
            <div className="flex gap-1">
              {(["all", "generation", "upload"] as const).map((source) => (
                <button
                  key={source}
                  onClick={() => setSourceFilter(source)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    sourceFilter === source
                      ? "bg-[#FF5800] text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {source === "all" && "All"}
                  {source === "generation" && (
                    <>
                      <Sparkles className="w-3 h-3 inline mr-1" />
                      AI Generated
                    </>
                  )}
                  {source === "upload" && (
                    <>
                      <Upload className="w-3 h-3 inline mr-1" />
                      Uploads
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
          <BrandButton
            variant="outline"
            onClick={handleUploadClick}
            disabled={isUploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? "Uploading..." : "Upload"}
          </BrandButton>
        </div>
      )}

      <BrandTabsResponsive
        id="gallery-tabs"
        tabs={galleryTabs}
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as TypeFilter)}
      >
        <BrandTabsContent value={activeTab} className="mt-6">
          {activeTab === "collections" ? (
            <CollectionsTab />
          ) : isLoadingItems ? (
            <GalleryGridSkeleton />
          ) : (
            <GalleryGrid
              items={items}
              collections={collections}
              onItemDeleted={handleItemDeleted}
            />
          )}
        </BrandTabsContent>
      </BrandTabsResponsive>
    </div>
  );
}
