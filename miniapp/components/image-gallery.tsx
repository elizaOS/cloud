"use client";

import { Check, Plus, Star, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface GalleryImage {
  id: string;
  url: string;
  isPrimary?: boolean;
  thumbnailUrl?: string;
  createdAt?: string;
}

export interface ImageGalleryProps {
  images: GalleryImage[];
  onImagesChange: (images: GalleryImage[]) => void;
  onSelectPrimary: (imageId: string) => void;
  onDeleteImage: (imageId: string) => void;
  onAddImage: () => void;
  maxImages?: number;
  disabled?: boolean;
}

function GalleryImageItem({
  image,
  isPrimary,
  isSelected,
  onSelect,
  onDelete,
  onSetPrimary,
  disabled,
}: {
  image: GalleryImage;
  isPrimary: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  disabled?: boolean;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
        isPrimary
          ? "border-brand ring-brand/30 ring-2"
          : isSelected
            ? "border-white/40"
            : "border-white/10 hover:border-white/20"
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <Image
        src={image.thumbnailUrl || image.url}
        alt="Gallery image"
        fill
        className="object-cover"
        sizes="(max-width: 768px) 25vw, 120px"
      />

      {/* Primary Badge */}
      {isPrimary && (
        <div className="bg-brand absolute top-1 left-1 rounded-full px-1.5 py-0.5">
          <Star className="h-3 w-3 fill-white text-white" />
        </div>
      )}

      {/* Selected Check */}
      {isSelected && !isPrimary && (
        <div className="absolute top-1 left-1 rounded-full bg-white/90 p-0.5">
          <Check className="h-3 w-3 text-black" />
        </div>
      )}

      {/* Actions Overlay */}
      <div
        className={`absolute inset-0 flex items-center justify-center gap-2 bg-black/60 transition-opacity ${
          showActions || isSelected ? "opacity-100" : "opacity-0"
        }`}
      >
        {!isPrimary && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetPrimary();
            }}
            disabled={disabled}
            className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30 disabled:opacity-50"
            title="Set as primary"
          >
            <Star className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={disabled}
          className="rounded-lg bg-red-500/80 p-2 text-white hover:bg-red-500 disabled:opacity-50"
          title="Delete image"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ImageGallery({
  images,
  onSelectPrimary,
  onDeleteImage,
  onAddImage,
  maxImages = 10,
  disabled = false,
}: ImageGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const primaryImage = useMemo(
    () => images.find((img) => img.isPrimary) || images[0],
    [images],
  );

  const canAddMore = images.length < maxImages;

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  // Clear selection when images change
  useEffect(() => {
    if (selectedId && !images.find((img) => img.id === selectedId)) {
      setSelectedId(null);
    }
  }, [images, selectedId]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/2 p-8 text-center">
        <Plus className="mb-2 h-8 w-8 text-white/30" />
        <p className="text-sm text-white/50">No images yet</p>
        <button
          type="button"
          onClick={onAddImage}
          disabled={disabled}
          className="bg-brand/20 text-brand hover:bg-brand/30 mt-4 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add First Image
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">
          Image Gallery ({images.length}/{maxImages})
        </p>
        {canAddMore && (
          <button
            type="button"
            onClick={onAddImage}
            disabled={disabled}
            className="text-brand hover:text-brand-400 flex items-center gap-1 text-xs disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add More
          </button>
        )}
      </div>

      {/* Primary Image Display */}
      {primaryImage && (
        <div className="border-brand relative aspect-square w-full max-w-[200px] overflow-hidden rounded-xl border-2 bg-white/5">
          <Image
            src={primaryImage.url}
            alt="Primary avatar"
            fill
            className="object-cover"
            sizes="200px"
          />
          <div className="bg-brand/90 absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white">
            <Star className="h-3 w-3 fill-white" />
            Primary
          </div>
        </div>
      )}

      {/* Gallery Grid */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
        {images.map((image) => (
          <GalleryImageItem
            key={image.id}
            image={image}
            isPrimary={image.id === primaryImage?.id || !!image.isPrimary}
            isSelected={selectedId === image.id}
            onSelect={() => handleSelect(image.id)}
            onDelete={() => onDeleteImage(image.id)}
            onSetPrimary={() => onSelectPrimary(image.id)}
            disabled={disabled}
          />
        ))}

        {/* Add Button */}
        {canAddMore && (
          <button
            type="button"
            onClick={onAddImage}
            disabled={disabled}
            className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-white/2 text-white/30 transition-all hover:border-white/20 hover:bg-white/5 hover:text-white/50 disabled:opacity-50"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Selection Info */}
      {selectedId && (
        <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
          <span className="text-white/70">1 image selected</span>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-white/50 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact gallery view for inline usage
 */
export function CompactImageGallery({
  images,
  primaryImageId,
  onSelectPrimary,
  onDeleteImage,
  disabled = false,
}: {
  images: GalleryImage[];
  primaryImageId?: string;
  onSelectPrimary: (id: string) => void;
  onDeleteImage: (id: string) => void;
  disabled?: boolean;
}) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto py-1">
      {images.map((image) => {
        const isPrimary = image.id === primaryImageId || image.isPrimary;
        return (
          <div
            key={image.id}
            className={`group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border ${
              isPrimary ? "border-brand" : "border-white/10"
            }`}
          >
            <Image
              src={image.thumbnailUrl || image.url}
              alt="Gallery thumbnail"
              fill
              className="object-cover"
              sizes="48px"
            />
            {isPrimary && (
              <div className="bg-brand/20 absolute inset-0 flex items-center justify-center">
                <Star className="fill-brand text-brand h-3 w-3" />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
              {!isPrimary && (
                <button
                  type="button"
                  onClick={() => onSelectPrimary(image.id)}
                  disabled={disabled}
                  className="rounded bg-white/20 p-1 text-white hover:bg-white/30"
                  title="Set as primary"
                >
                  <Star className="h-2.5 w-2.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDeleteImage(image.id)}
                disabled={disabled}
                className="rounded bg-red-500/80 p-1 text-white hover:bg-red-500"
                title="Delete"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ImageGallery;
