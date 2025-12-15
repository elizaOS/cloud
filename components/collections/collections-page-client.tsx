"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import {
  FolderOpen,
  MoreVertical,
  ImageIcon,
  ArrowLeft,
  X,
} from "lucide-react";
import {
  listCollections,
  createCollection,
  deleteCollection,
  removeFromCollection,
} from "@/app/actions/gallery";
import type { CollectionSummary } from "@/app/actions/gallery";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { BrandCard, BrandButton } from "@/components/brand";

interface CollectionItem {
  id: string;
  sourceType: "generation" | "upload";
  sourceId: string;
  url: string;
  thumbnailUrl?: string;
  type: string;
  prompt?: string;
  filename?: string;
}

export function CollectionsPageClient() {
  useSetPageHeader({
    title: "Collections",
    description: "Organize your media into collections for campaigns and apps",
  });

  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state for create dialog
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPurpose, setNewPurpose] = useState<
    "advertising" | "app_assets" | "general"
  >("general");

  // Selected collection view
  const [selectedCollection, setSelectedCollection] =
    useState<CollectionSummary | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const refreshCollections = async () => {
    const data = await listCollections();
    setCollections(data);
  };

  const refreshCollectionItems = async (collectionId: string) => {
    setIsLoadingItems(true);
    const response = await fetch(`/api/v1/collections/${collectionId}`);
    if (response.ok) {
      const data = await response.json();
      setCollectionItems(data.items || []);
    }
    setIsLoadingItems(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const data = await listCollections();
      if (!cancelled) {
        setCollections(data);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCollection) return;
    let cancelled = false;
    void (async () => {
      await refreshCollectionItems(selectedCollection.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCollection]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsCreating(true);
    const collection = await createCollection({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      purpose: newPurpose,
    });

    toast.success("Collection created");
    setShowCreateDialog(false);
    setNewName("");
    setNewDescription("");
    setNewPurpose("general");
    setIsCreating(false);
    void refreshCollections();
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    await deleteCollection(id);
    toast.success("Collection deleted");
    setDeleteConfirmId(null);
    setIsDeleting(false);
    if (selectedCollection?.id === id) {
      setSelectedCollection(null);
    }
    void refreshCollections();
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!selectedCollection) return;
    await removeFromCollection(selectedCollection.id, [itemId]);
    toast.success("Item removed from collection");
    void refreshCollectionItems(selectedCollection.id);
    void refreshCollections();
  };

  // Collection detail view
  if (selectedCollection) {
    return (
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <BrandButton
            variant="outline"
            size="sm"
            onClick={() => setSelectedCollection(null)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </BrandButton>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              {selectedCollection.name}
            </h2>
            {selectedCollection.description && (
              <p className="text-sm text-white/60">
                {selectedCollection.description}
              </p>
            )}
          </div>
          <span className="text-sm text-white/50">
            {selectedCollection.itemCount} items
          </span>
        </div>

        {/* Items Grid */}
        {isLoadingItems ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square bg-white/10" />
            ))}
          </div>
        ) : collectionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4">
              <ImageIcon className="w-12 h-12 text-[#FF5800]" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-white">
              No items yet
            </h3>
            <p className="text-white/60 max-w-md mb-4">
              Add media from your gallery to this collection
            </p>
            <Link href="/dashboard/gallery">
              <BrandButton variant="primary">Go to Gallery</BrandButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {collectionItems.map((item) => (
              <BrandCard
                key={item.id}
                corners={false}
                className="overflow-hidden group p-0 relative"
              >
                <div className="aspect-square relative bg-black/60">
                  {item.type === "image" ? (
                    <Image
                      src={item.url}
                      alt={item.prompt || item.filename || "Media"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    />
                  ) : item.type === "video" ? (
                    <video
                      src={item.url}
                      className="w-full h-full object-cover"
                      preload="metadata"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">🎵</span>
                    </div>
                  )}

                  {/* Remove button on hover */}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 border border-white/20 hover:border-rose-500/40 hover:bg-rose-500/20 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </BrandCard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Collections list view
  return (
    <div className="flex flex-col gap-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/60">
            {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </p>
        </div>
        <BrandButton
          variant="primary"
          onClick={() => setShowCreateDialog(true)}
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          New Collection
        </BrandButton>
      </div>

      {/* Collections Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <BrandCard key={i} corners={false} className="p-4">
              <Skeleton className="aspect-video w-full mb-3 bg-white/10" />
              <Skeleton className="h-5 w-3/4 mb-2 bg-white/10" />
              <Skeleton className="h-4 w-1/2 bg-white/10" />
            </BrandCard>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4">
            <FolderOpen className="w-12 h-12 text-[#FF5800]" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-white">
            No collections yet
          </h3>
          <p className="text-white/60 max-w-md mb-4">
            Create collections to organize your media for advertising campaigns
            and app assets
          </p>
          <BrandButton
            variant="primary"
            onClick={() => setShowCreateDialog(true)}
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Create Collection
          </BrandButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {collections.map((collection) => (
            <BrandCard
              key={collection.id}
              corners={false}
              hover
              className="overflow-hidden cursor-pointer p-0"
              onClick={() => setSelectedCollection(collection)}
            >
              {/* Placeholder cover image */}
              <div className="aspect-video relative bg-gradient-to-br from-[#FF5800]/20 to-purple-500/20 flex items-center justify-center">
                <FolderOpen className="w-12 h-12 text-white/30" />
                <span className="absolute top-2 right-2 text-xs bg-black/40 px-2 py-0.5 text-white/80">
                  {collection.itemCount} items
                </span>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {collection.name}
                    </h3>
                    {collection.description && (
                      <p className="text-sm text-white/60 line-clamp-2 mt-1">
                        {collection.description}
                      </p>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="p-1 hover:bg-white/10 transition-colors">
                        <MoreVertical className="w-4 h-4 text-white/60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCollection(collection);
                        }}
                      >
                        View Items
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(collection.id);
                        }}
                        className="text-rose-400 focus:text-rose-400"
                      >
                        <TrashIcon className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-xs text-white/40 mt-2">
                  Created{" "}
                  {format(new Date(collection.createdAt), "MMM d, yyyy")}
                </p>
              </div>
            </BrandCard>
          ))}
        </div>
      )}

      {/* Create Collection Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Collection</DialogTitle>
            <DialogDescription>
              Create a new collection to organize your media for campaigns or
              apps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Name</label>
              <Input
                placeholder="My Collection"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white">
                Description (optional)
              </label>
              <Textarea
                placeholder="What is this collection for?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Purpose</label>
              <Select
                value={newPurpose}
                onValueChange={(v) =>
                  setNewPurpose(v as "advertising" | "app_assets" | "general")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="advertising">Advertising</SelectItem>
                  <SelectItem value="app_assets">App Assets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancel
            </BrandButton>
            <BrandButton
              variant="primary"
              onClick={handleCreate}
              disabled={isCreating || !newName.trim()}
            >
              {isCreating ? "Creating..." : "Create"}
            </BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this collection? The media items
              will not be deleted.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              disabled={isDeleting}
            >
              Cancel
            </BrandButton>
            <BrandButton
              variant="primary"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={isDeleting}
              className="bg-rose-500 hover:bg-rose-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
