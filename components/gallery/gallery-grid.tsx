"use client";

import { useState } from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DownloadIcon, TrashIcon, CalendarIcon } from "@radix-ui/react-icons";
import { Eye } from "lucide-react";
import type { GalleryItem } from "@/app/actions/gallery";
import { deleteMedia } from "@/app/actions/gallery";
import { toast } from "sonner";
import { format } from "date-fns";
import { BrandCard, BrandButton } from "@/components/brand";

interface GalleryGridProps {
  items: GalleryItem[];
  onItemDeleted?: () => void;
}

export function GalleryGrid({ items, onItemDeleted }: GalleryGridProps) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] =
    useState<GalleryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (item: GalleryItem) => {
    setIsDeleting(true);
    try {
      await deleteMedia(item.id);
      toast.success("Media deleted successfully");
      setDeleteConfirmItem(null);
      onItemDeleted?.();
    } catch (error) {
      console.error("Failed to delete media:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete media",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (item: GalleryItem) => {
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.type}-${item.id}.${item.mimeType?.split("/")[1] || "file"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download started");
    } catch (error) {
      console.error("Failed to download:", error);
      toast.error("Failed to download media");
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4">
          <Eye className="w-12 h-12 text-[#FF5800]" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-white">No media yet</h3>
        <p className="text-white/60 max-w-md">
          Generate some images or videos to see them appear in your gallery
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => (
          <BrandCard
            key={item.id}
            corners={false}
            hover
            className="overflow-hidden group cursor-pointer p-0"
            onClick={() => setSelectedItem(item)}
          >
            <div className="aspect-video relative bg-black/60">
              {item.type === "image" ? (
                <Image
                  src={item.url}
                  alt={item.prompt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : (
                <video
                  src={item.url}
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <Eye className="w-8 h-8 text-[#FF5800] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="absolute top-2 right-2 text-xs rounded-none bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0.5 font-bold uppercase tracking-wide text-[#FF5800]">
                {item.type}
              </span>
            </div>
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2 mb-2 text-white">
                {item.prompt}
              </p>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3 text-[#FF5800]" />
                  {format(new Date(item.createdAt), "MMM d, yyyy")}
                </span>
                <span className="truncate max-w-[100px]">{item.model}</span>
              </div>
            </div>
          </BrandCard>
        ))}
      </div>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      >
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Media Details</DialogTitle>
            <DialogDescription>
              View and manage your generated media
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              <div className="flex-1 relative bg-black/60 rounded-none overflow-hidden">
                {selectedItem.type === "image" ? (
                  <Image
                    src={selectedItem.url}
                    alt={selectedItem.prompt}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 1024px, 1536px"
                    priority
                  />
                ) : (
                  <video
                    src={selectedItem.url}
                    controls
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              <div className="flex-shrink-0 grid grid-cols-3 gap-4 text-sm">
                <div className="col-span-3">
                  <p className="text-white/70 line-clamp-2">
                    {selectedItem.prompt}
                  </p>
                </div>

                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wide">Model</p>
                  <p className="font-medium truncate text-white">{selectedItem.model}</p>
                </div>

                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wide">Type</p>
                  <span className="mt-0.5 rounded-none bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#FF5800]">
                    {selectedItem.type}
                  </span>
                </div>

                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wide">Created</p>
                  <p className="font-medium text-white">
                    {format(new Date(selectedItem.createdAt), "MMM d, yyyy")}
                  </p>
                </div>

                {selectedItem.dimensions && (
                  <div>
                    <p className="text-white/50 text-xs uppercase tracking-wide">Dimensions</p>
                    <p className="font-medium text-white">
                      {selectedItem.dimensions.width} ×{" "}
                      {selectedItem.dimensions.height}
                    </p>
                  </div>
                )}

                {selectedItem.fileSize && (
                  <div>
                    <p className="text-white/50 text-xs uppercase tracking-wide">File Size</p>
                    <p className="font-medium text-white">
                      {(Number(selectedItem.fileSize) / 1024 / 1024).toFixed(2)}{" "}
                      MB
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-shrink-0 gap-2">
                <BrandButton
                  variant="outline"
                  onClick={() => handleDownload(selectedItem)}
                >
                  <DownloadIcon className="w-4 h-4 mr-2" />
                  Download
                </BrandButton>
                <BrandButton
                  variant="outline"
                  className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                  onClick={() => {
                    setDeleteConfirmItem(selectedItem);
                    setSelectedItem(null);
                  }}
                >
                  <TrashIcon className="w-4 h-4 mr-2" />
                  Delete
                </BrandButton>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmItem}
        onOpenChange={(open) => !open && setDeleteConfirmItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Media</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this media? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          {deleteConfirmItem && (
            <div className="py-4">
              <p className="text-sm text-white/70 line-clamp-3">
                {deleteConfirmItem.prompt}
              </p>
            </div>
          )}

          <DialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setDeleteConfirmItem(null)}
              disabled={isDeleting}
            >
              Cancel
            </BrandButton>
            <BrandButton
              variant="primary"
              onClick={() =>
                deleteConfirmItem && handleDelete(deleteConfirmItem)
              }
              disabled={isDeleting}
              className="bg-rose-500 hover:bg-rose-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GalleryGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <BrandCard key={i} corners={false} className="overflow-hidden p-0">
          <Skeleton className="aspect-video w-full bg-white/10" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-full bg-white/10" />
            <Skeleton className="h-3 w-2/3 bg-white/10" />
          </div>
        </BrandCard>
      ))}
    </div>
  );
}
