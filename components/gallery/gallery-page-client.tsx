"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GalleryGrid, GalleryGridSkeleton } from "./gallery-grid";
import { listUserMedia, getUserMediaStats } from "@/app/actions/gallery";
import type { GalleryItem } from "@/app/actions/gallery";
import { ImageIcon, VideoIcon, LayoutGridIcon } from "lucide-react";
import { toast } from "sonner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
} from "@/components/brand";

export function GalleryPageClient() {
  useSetPageHeader({
    title: "Gallery",
    description: "View and manage your AI-generated images and videos",
  });

  const [activeTab, setActiveTab] = useState<"all" | "image" | "video">("all");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [stats, setStats] = useState<{
    totalImages: number;
    totalVideos: number;
    totalSize: number;
  } | null>(null);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const type = activeTab === "all" ? undefined : activeTab;
      const data = await listUserMedia({ type, limit: 100 });
      setItems(data);
    } catch (error) {
      console.error("Failed to load gallery:", error);
      toast.error("Failed to load gallery items");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const data = await getUserMediaStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleItemDeleted = () => {
    loadItems();
    loadStats();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoadingStats ? (
          <>
            <BrandCard corners={false} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </BrandCard>
            <BrandCard corners={false} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </BrandCard>
            <BrandCard corners={false} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </BrandCard>
          </>
        ) : stats ? (
          <>
            <BrandCard corners={false} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-500/20 border border-blue-500/40 p-2">
                  <ImageIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalImages}</p>
                  <p className="text-sm text-white/50 uppercase tracking-wide">Images</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-500/20 border border-purple-500/40 p-2">
                  <VideoIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalVideos}</p>
                  <p className="text-sm text-white/50 uppercase tracking-wide">Videos</p>
                </div>
              </div>
            </BrandCard>

            <BrandCard corners={false} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500/20 border border-green-500/40 p-2">
                  <LayoutGridIcon className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {(stats.totalSize / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <p className="text-sm text-white/50 uppercase tracking-wide">Total Size</p>
                </div>
              </div>
            </BrandCard>
          </>
        ) : null}
      </div>

      <BrandTabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "all" | "image" | "video")}
      >
        <BrandTabsList>
          <BrandTabsTrigger value="all">All Media</BrandTabsTrigger>
          <BrandTabsTrigger value="image">Images</BrandTabsTrigger>
          <BrandTabsTrigger value="video">Videos</BrandTabsTrigger>
        </BrandTabsList>

        <BrandTabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <GalleryGridSkeleton />
          ) : (
            <GalleryGrid items={items} onItemDeleted={handleItemDeleted} />
          )}
        </BrandTabsContent>
      </BrandTabs>
    </div>
  );
}
