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
import { Eye, X, LayoutGridIcon } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
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
        <div className="rounded-none bg-white/5 border border-white/10 p-6 mb-4">
          <LayoutGridIcon className="w-12 h-12 text-white/40" />
        </div>
        <h3
          className="text-xl font-semibold mb-2 text-white"
          style={{
            fontFamily: "var(--font-roboto-mono)",
            fontSize: "20px",
            lineHeight: "28px",
          }}
        >
          No media yet
        </h3>
        <p
          className="text-white/60 max-w-md"
          style={{
            fontFamily: "var(--font-roboto-mono)",
            fontSize: "14px",
            lineHeight: "20px",
          }}
        >
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
                <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="absolute top-2 right-2 text-xs rounded-none bg-white/10 border border-white/20 px-2 py-0.5 uppercase tracking-wide text-white/80" style={{ fontFamily: "var(--font-roboto-mono)", fontSize: "10px" }}>
                {item.type}
              </span>
            </div>
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2 mb-2 text-white" style={{ fontFamily: "var(--font-roboto-mono)", fontSize: "13px", lineHeight: "18px" }}>
                {item.prompt}
              </p>
              <div className="flex items-center justify-between text-xs text-white/60" style={{ fontFamily: "var(--font-roboto-mono)", fontSize: "12px" }}>
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3 text-white/40" />
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
        <DialogContent
          className="!max-w-[99vw] !max-h-[99vh] !w-[99vw] !h-[99vh] p-0 bg-black/80 border-white/10 sm:!max-w-[99vw] md:!max-w-[99vw] lg:!max-w-[99vw]"
          showCloseButton={false}
        >
          {selectedItem && (
            <div className="relative w-full h-full flex items-center justify-center p-1">
              {/* Main Content */}
              <div className="relative w-full h-full flex items-center justify-center">
                {selectedItem.type === "image" ? (
                  <Image
                    src={selectedItem.url}
                    alt={selectedItem.prompt}
                    width={3000}
                    height={3000}
                    className="object-contain max-w-full max-h-full w-auto h-auto"
                    unoptimized
                    priority
                  />
                ) : (
                  <video
                    src={selectedItem.url}
                    controls
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>

              {/* Close button */}
              <DialogClose className="absolute top-4 right-4 z-50 rounded-none border border-white/20 bg-black/60 p-2 hover:bg-white/10 hover:border-white/30 transition-colors">
                <X className="h-5 w-5 text-white" />
              </DialogClose>

              {/* Info overlay at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 space-y-3">
                {/* Prompt */}
                <p className="text-sm text-white/90 leading-relaxed max-w-4xl">
                  {selectedItem.prompt}
                </p>

                {/* Details - Inline compact layout */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white/50 uppercase tracking-wide">
                      Model:
                    </span>
                    <span className="text-white font-medium">
                      {selectedItem.model}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-white/50 uppercase tracking-wide">
                      Type:
                    </span>
                    <span className="rounded-none bg-white/10 border border-white/20 px-2 py-0.5 text-white/80 uppercase" style={{ fontFamily: "var(--font-roboto-mono)", fontSize: "10px" }}>
                      {selectedItem.type}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-white/50 uppercase tracking-wide">
                      Created:
                    </span>
                    <span className="text-white font-medium">
                      {format(new Date(selectedItem.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>

                  {selectedItem.dimensions && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-white/50 uppercase tracking-wide">
                        Dimensions:
                      </span>
                      <span className="text-white font-medium">
                        {selectedItem.dimensions.width} ×{" "}
                        {selectedItem.dimensions.height}
                      </span>
                    </div>
                  )}

                  {selectedItem.fileSize && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-white/50 uppercase tracking-wide">
                        Size:
                      </span>
                      <span className="text-white font-medium">
                        {(Number(selectedItem.fileSize) / 1024 / 1024).toFixed(
                          2,
                        )}{" "}
                        MB
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <BrandButton
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(selectedItem)}
                  >
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    Download
                  </BrandButton>
                  <BrandButton
                    variant="outline"
                    size="sm"
                    className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                    onClick={() => {
                      setDeleteConfirmItem(selectedItem);
                      setSelectedItem(null);
                    }}
                  >
                    <TrashIcon className="w-4 h-4 mr-2" />
                    Delete
                  </BrandButton>
                </div>
              </div>
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
