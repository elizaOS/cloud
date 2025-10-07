"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GalleryGrid, GalleryGridSkeleton } from "./gallery-grid";
import { listUserMedia, getUserMediaStats } from "@/app/actions/gallery";
import type { GalleryItem } from "@/app/actions/gallery";
import { ImageIcon, VideoIcon, LayoutGridIcon } from "lucide-react";
import { toast } from "sonner";

export function GalleryPageClient() {
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
  }, []);

  const handleItemDeleted = () => {
    loadItems();
    loadStats();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Gallery</h1>
        <p className="text-muted-foreground mt-2">
          View and manage your AI-generated images and videos
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoadingStats ? (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </Card>
          </>
        ) : stats ? (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-500/10 p-2">
                  <ImageIcon className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalImages}</p>
                  <p className="text-sm text-muted-foreground">Images</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-500/10 p-2">
                  <VideoIcon className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalVideos}</p>
                  <p className="text-sm text-muted-foreground">Videos</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500/10 p-2">
                  <LayoutGridIcon className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {(stats.totalSize / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <p className="text-sm text-muted-foreground">Total Size</p>
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "all" | "image" | "video")}
      >
        <TabsList>
          <TabsTrigger value="all">All Media</TabsTrigger>
          <TabsTrigger value="image">Images</TabsTrigger>
          <TabsTrigger value="video">Videos</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <GalleryGridSkeleton />
          ) : (
            <GalleryGrid items={items} onItemDeleted={handleItemDeleted} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

