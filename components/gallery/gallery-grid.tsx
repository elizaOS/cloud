/**
 * Gallery grid component displaying media items in a responsive grid layout.
 * Supports image/video preview, deletion, download, and collection management.
 */

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DownloadIcon, TrashIcon, CalendarIcon } from "@radix-ui/react-icons";
import { Eye, X, FolderPlus, Upload, Sparkles } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import type { GalleryItem, CollectionSummary } from "@/app/actions/gallery";
import { deleteMedia, addToCollection } from "@/app/actions/gallery";
import { toast } from "sonner";
import { format } from "date-fns";
import { BrandCard, BrandButton } from "@/components/brand";

interface GalleryGridProps {
  items: GalleryItem[];
  collections?: CollectionSummary[];
  onItemDeleted?: (itemId?: string, itemType?: "image" | "video") => void;
  onAddToCollection?: (
    itemId: string,
    source: "generation" | "upload",
    collectionId: string,
  ) => void;
  selectionMode?: boolean;
  selectedItems?: Set<string>;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
}

export function GalleryGrid({
  items,
  collections = [],
  onItemDeleted,
  onAddToCollection,
  selectionMode = false,
  selectedItems = new Set(),
  onSelectionChange,
}: GalleryGridProps) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] =
    useState<GalleryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState<string | null>(
    null,
  );

  const handleDelete = async (item: GalleryItem) => {
    setIsDeleting(true);
    await deleteMedia(item.id, item.source);
    toast.success("Media deleted successfully");
    setDeleteConfirmItem(null);
    onItemDeleted?.(item.id, item.type as "image" | "video");
    setIsDeleting(false);
  };

  const handleDownload = async (item: GalleryItem) => {
    const response = await fetch(item.url);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = item.filename || `${item.type}-${item.id}`;
    a.download = `${filename}.${item.mimeType?.split("/")[1] || "file"}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success("Download started");
  };

  const handleAddToCollection = async (
    item: GalleryItem,
    collectionId: string,
  ) => {
    setAddingToCollection(item.id);
    if (onAddToCollection) {
      onAddToCollection(item.id, item.source, collectionId);
    } else {
      await addToCollection(collectionId, [
        { id: item.id, source: item.source },
      ]);
      toast.success("Added to collection");
    }
    setAddingToCollection(null);
  };

  const getItemTitle = (item: GalleryItem) => {
    if (item.source === "upload" && item.filename) {
      return item.filename;
    }
    return item.prompt || "Untitled";
  };

  const getItemSubtitle = (item: GalleryItem) => {
    if (item.source === "upload") {
      return "Uploaded";
    }
    return item.model || "AI Generated";
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4">
          <Eye className="w-12 h-12 text-[#FF5800]" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-white">No media yet</h3>
        <p className="text-white/60 max-w-md">
          Generate images/videos or upload files to see them in your gallery
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
            className={`overflow-hidden group cursor-pointer p-0 ${
              selectionMode && selectedItems.has(item.id)
                ? "ring-2 ring-[#FF5800]"
                : ""
            }`}
            onClick={() => {
              if (selectionMode && onSelectionChange) {
                onSelectionChange(item.id, !selectedItems.has(item.id));
              } else {
                setSelectedItem(item);
              }
            }}
          >
            <div className="aspect-video relative bg-black/60">
              {item.type === "image" ? (
                <Image
                  src={item.url}
                  alt={getItemTitle(item)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : item.type === "video" ? (
                <video
                  src={item.url}
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/80">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-2xl">🎵</span>
                    </div>
                    <span className="text-xs text-white/60">Audio</span>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <Eye className="w-8 h-8 text-[#FF5800] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Badges */}
              <div className="absolute top-2 left-2 flex gap-1">
                <span
                  className={`text-xs rounded-none px-2 py-0.5 font-bold uppercase tracking-wide ${
                    item.source === "upload"
                      ? "bg-blue-500/20 border border-blue-500/40 text-blue-400"
                      : "bg-purple-500/20 border border-purple-500/40 text-purple-400"
                  }`}
                >
                  {item.source === "upload" ? (
                    <Upload className="w-3 h-3 inline mr-1" />
                  ) : (
                    <Sparkles className="w-3 h-3 inline mr-1" />
                  )}
                  {item.source === "upload" ? "Upload" : "AI"}
                </span>
              </div>
              <span className="absolute top-2 right-2 text-xs rounded-none bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0.5 font-bold uppercase tracking-wide text-[#FF5800]">
                {item.type}
              </span>

              {/* Quick actions on hover */}
              {collections.length > 0 && (
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="p-1.5 bg-black/60 border border-white/20 hover:border-[#FF5800]/40 hover:bg-[#FF580020] transition-colors">
                        <FolderPlus className="w-4 h-4 text-white" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[160px]">
                      <div className="px-2 py-1.5 text-xs font-semibold text-white/50">
                        Add to Collection
                      </div>
                      <DropdownMenuSeparator />
                      {collections.map((collection) => (
                        <DropdownMenuItem
                          key={collection.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToCollection(item, collection.id);
                          }}
                          disabled={addingToCollection === item.id}
                        >
                          {collection.name}
                          <span className="ml-auto text-xs text-white/50">
                            {collection.itemCount}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2 mb-2 text-white">
                {getItemTitle(item)}
              </p>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3 text-[#FF5800]" />
                  {format(new Date(item.createdAt), "MMM d, yyyy")}
                </span>
                <span className="truncate max-w-[100px]">
                  {getItemSubtitle(item)}
                </span>
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
          <DialogTitle className="sr-only">Media Preview</DialogTitle>
          <DialogDescription className="sr-only">
            View and manage your media file
          </DialogDescription>
          {selectedItem && (
            <div className="relative w-full h-full flex items-center justify-center p-1">
              {/* Main Content */}
              <div className="relative w-full h-full flex items-center justify-center">
                {selectedItem.type === "image" ? (
                  <Image
                    src={selectedItem.url}
                    alt={getItemTitle(selectedItem)}
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
              <DialogClose className="absolute top-4 right-4 z-50 rounded-none border border-white/20 bg-black/60 p-2 hover:bg-[#FF580020] hover:border-[#FF5800]/40 transition-colors">
                <X className="h-5 w-5 text-white" />
              </DialogClose>

              {/* Info overlay at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-8 space-y-4">
                {/* Title/Prompt */}
                <p className="text-sm text-white/90 leading-relaxed max-w-4xl">
                  {getItemTitle(selectedItem)}
                </p>

                {/* Details - Inline compact layout */}
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-white/50 uppercase tracking-wide">
                      Source:
                    </span>
                    <span
                      className={`rounded-none px-2 py-0.5 font-bold uppercase ${
                        selectedItem.source === "upload"
                          ? "bg-blue-500/20 border border-blue-500/40 text-blue-400"
                          : "bg-purple-500/20 border border-purple-500/40 text-purple-400"
                      }`}
                    >
                      {selectedItem.source === "upload"
                        ? "Upload"
                        : "AI Generated"}
                    </span>
                  </div>

                  {selectedItem.model && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-white/50 uppercase tracking-wide">
                        Model:
                      </span>
                      <span className="text-white font-medium">
                        {selectedItem.model}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-white/50 uppercase tracking-wide">
                      Type:
                    </span>
                    <span className="rounded-none bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0.5 text-[#FF5800] font-bold uppercase">
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

                  {collections.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <BrandButton variant="outline" size="sm">
                          <FolderPlus className="w-4 h-4 mr-2" />
                          Add to Collection
                        </BrandButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {collections.map((collection) => (
                          <DropdownMenuItem
                            key={collection.id}
                            onClick={() =>
                              handleAddToCollection(selectedItem, collection.id)
                            }
                          >
                            {collection.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

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
                {getItemTitle(deleteConfirmItem)}
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
