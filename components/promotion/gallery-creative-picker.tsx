"use client";

/**
 * Gallery Creative Picker
 *
 * Allows users to select media from their collections for use in ad creatives.
 * Supports both AI-generated images and uploaded media.
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Image as ImageIcon,
  Video,
  FolderOpen,
  Sparkles,
  Upload,
  Check,
  Search,
} from "lucide-react";

interface MediaItem {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  title?: string;
  sourceType: "generation" | "upload";
  createdAt: Date;
}

interface MediaCollection {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  coverImageUrl?: string;
}

interface GalleryCreativePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (items: MediaItem[]) => void;
  maxSelections?: number;
  allowedTypes?: Array<"image" | "video">;
  selectedIds?: string[];
}

export function GalleryCreativePicker({
  open,
  onOpenChange,
  onSelect,
  maxSelections = 5,
  allowedTypes = ["image", "video"],
  selectedIds = [],
}: GalleryCreativePickerProps) {
  const [tab, setTab] = useState<"collections" | "generations" | "uploads">(
    "collections",
  );
  const [collections, setCollections] = useState<MediaCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch collections on mount
  useEffect(() => {
    if (!open) return;

    const fetchCollections = async () => {
      setIsLoading(true);
      const response = await fetch("/api/v1/media/collections");
      if (response.ok) {
        const data = await response.json();
        setCollections(data.collections || []);
      }
      setIsLoading(false);
    };

    fetchCollections();
  }, [open]);

  // Fetch items when collection or tab changes
  useEffect(() => {
    if (!open) return;

    const fetchItems = async () => {
      setIsLoading(true);
      let url = "";

      if (tab === "collections" && selectedCollection) {
        url = `/api/v1/media/collections/${selectedCollection}/items`;
      } else if (tab === "generations") {
        url = "/api/v1/generations?type=image&limit=50";
      } else if (tab === "uploads") {
        url = "/api/v1/media/uploads?limit=50";
      } else {
        setIsLoading(false);
        return;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();

        // Normalize the data structure
        const normalizedItems: MediaItem[] = (
          data.items ||
          data.generations ||
          data.uploads ||
          []
        ).map((item: Record<string, unknown>) => ({
          id: item.id as string,
          type: ((item.type as string) || "image") as "image" | "video",
          url: (item.url || item.storage_url || item.output_url) as string,
          thumbnailUrl: (item.thumbnailUrl || item.thumbnail_url) as
            | string
            | undefined,
          title: (item.title || item.filename || item.prompt) as
            | string
            | undefined,
          sourceType: (item.sourceType ||
            (tab === "generations" ? "generation" : "upload")) as
            | "generation"
            | "upload",
          createdAt: new Date(
            (item.createdAt as string) ||
              (item.created_at as string) ||
              (item.addedAt as string),
          ),
        }));

        // Filter by allowed types
        const filtered = normalizedItems.filter((item) =>
          allowedTypes.includes(item.type),
        );

        setItems(filtered);
      }
      setIsLoading(false);
    };

    fetchItems();
  }, [open, tab, selectedCollection, allowedTypes]);

  const toggleSelection = (itemId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else if (newSelected.size < maxSelections) {
      newSelected.add(itemId);
    }
    setSelected(newSelected);
  };

  const handleConfirm = () => {
    const selectedItems = items.filter((item) => selected.has(item.id));
    onSelect(selectedItems);
    onOpenChange(false);
  };

  const filteredItems = searchQuery
    ? items.filter(
        (item) =>
          item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.id.includes(searchQuery),
      )
    : items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Select Media for Creative
          </DialogTitle>
          <DialogDescription>
            Choose images or videos from your gallery to use in your ad creative
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="w-full"
        >
          <TabsList className="w-full justify-start">
            <TabsTrigger
              value="collections"
              className="flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Collections
            </TabsTrigger>
            <TabsTrigger
              value="generations"
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              AI Generated
            </TabsTrigger>
            <TabsTrigger value="uploads" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Uploads
            </TabsTrigger>
          </TabsList>

          {/* Search bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Collections Tab */}
          <TabsContent value="collections" className="mt-4">
            {!selectedCollection ? (
              <ScrollArea className="h-[400px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : collections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mb-2" />
                    <p>No collections yet</p>
                    <p className="text-sm">
                      Collections are created automatically when you deploy apps
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {collections.map((collection) => (
                      <button
                        key={collection.id}
                        onClick={() => setSelectedCollection(collection.id)}
                        className="p-4 rounded-lg border hover:border-primary transition-colors text-left"
                      >
                        <div className="aspect-video bg-muted rounded mb-2 flex items-center justify-center overflow-hidden relative">
                          {collection.coverImageUrl ? (
                            <Image
                              src={collection.coverImageUrl}
                              alt={collection.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <FolderOpen className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <h4 className="font-medium truncate">
                          {collection.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {collection.itemCount} items
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCollection(null)}
                  className="mb-4"
                >
                  ← Back to collections
                </Button>
                <MediaGrid
                  items={filteredItems}
                  selected={selected}
                  onToggle={toggleSelection}
                  isLoading={isLoading}
                  maxSelections={maxSelections}
                />
              </>
            )}
          </TabsContent>

          {/* Generations Tab */}
          <TabsContent value="generations" className="mt-4">
            <MediaGrid
              items={filteredItems}
              selected={selected}
              onToggle={toggleSelection}
              isLoading={isLoading}
              maxSelections={maxSelections}
            />
          </TabsContent>

          {/* Uploads Tab */}
          <TabsContent value="uploads" className="mt-4">
            <MediaGrid
              items={filteredItems}
              selected={selected}
              onToggle={toggleSelection}
              isLoading={isLoading}
              maxSelections={maxSelections}
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {selected.size} of {maxSelections} selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>
              Use Selected ({selected.size})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Sub-component for the media grid
function MediaGrid({
  items,
  selected,
  onToggle,
  isLoading,
  maxSelections,
}: {
  items: MediaItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  isLoading: boolean;
  maxSelections: number;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
        <ImageIcon className="h-12 w-12 mb-2" />
        <p>No media found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="grid grid-cols-4 gap-3">
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          const canSelect = isSelected || selected.size < maxSelections;

          return (
            <button
              key={item.id}
              onClick={() => canSelect && onToggle(item.id)}
              disabled={!canSelect}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary/30"
                  : canSelect
                    ? "border-transparent hover:border-muted-foreground/30"
                    : "border-transparent opacity-50 cursor-not-allowed"
              }`}
            >
              {item.type === "video" ? (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Video className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : (
                <Image
                  src={item.thumbnailUrl || item.url}
                  alt={item.title || "Media item"}
                  fill
                  className="object-cover"
                />
              )}

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <div className="bg-primary text-primary-foreground rounded-full p-1">
                    <Check className="h-4 w-4" />
                  </div>
                </div>
              )}

              {/* Type badge */}
              <Badge
                variant="secondary"
                className="absolute bottom-1 left-1 text-xs"
              >
                {item.sourceType === "generation" ? (
                  <Sparkles className="h-3 w-3 mr-1" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                {item.type}
              </Badge>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
