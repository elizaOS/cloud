"use client";

import { AlertCircle, ImagePlus, Loader2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import { ImageCropper } from "./image-cropper";

// Constants for validation
const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB raw
const MAX_COMPRESSED_SIZE = 1 * 1024 * 1024; // 1MB compressed
const MIN_DIMENSION = 256;

export interface ImageUploaderProps {
  onUpload: (blob: Blob, previewUrl: string) => void;
  onCancel?: () => void;
  currentImage?: string | null;
  aspectRatio?: number;
  enableCropping?: boolean;
  showPreview?: boolean;
  className?: string;
  compact?: boolean;
}

interface ValidationError {
  type: "size" | "format" | "dimension";
  message: string;
}

/**
 * Validates an image file before processing
 */
async function validateImage(file: File): Promise<ValidationError | null> {
  // Check format
  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    return {
      type: "format",
      message: `Invalid format. Supported: JPG, PNG, WebP, GIF`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      type: "size",
      message: `File too large (${sizeMB}MB). Maximum: 5MB`,
    };
  }

  // Check dimensions
  const dimensions = await getImageDimensions(file);
  if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
    return {
      type: "dimension",
      message: `Image too small (${dimensions.width}x${dimensions.height}). Minimum: ${MIN_DIMENSION}x${MIN_DIMENSION}`,
    };
  }

  return null;
}

/**
 * Get image dimensions from a file
 */
function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

/**
 * Compress an image blob to target size
 */
async function compressImage(
  blob: Blob,
  targetSize: number = MAX_COMPRESSED_SIZE,
): Promise<Blob> {
  if (blob.size <= targetSize) return blob;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(blob);
        return;
      }

      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      const ratio = Math.sqrt(targetSize / blob.size);

      // Only downscale if needed
      if (ratio < 1) {
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      // Ensure minimum dimensions
      width = Math.max(width, MIN_DIMENSION);
      height = Math.max(height, MIN_DIMENSION);

      canvas.width = width;
      canvas.height = height;

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels to hit target size
      const tryQuality = (quality: number) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              if (result.size <= targetSize || quality <= 0.5) {
                resolve(result);
              } else {
                tryQuality(quality - 0.1);
              }
            } else {
              resolve(blob);
            }
          },
          "image/jpeg",
          quality,
        );
      };

      tryQuality(0.9);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    img.src = url;
  });
}

export function ImageUploader({
  onUpload,
  onCancel,
  currentImage,
  aspectRatio = 1,
  enableCropping = true,
  showPreview = true,
  className = "",
  compact = false,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    currentImage || null,
  );
  const [cropImage, setCropImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);
      setProgress(10);

      // Validate
      const validationError = await validateImage(file);
      if (validationError) {
        setError(validationError.message);
        setIsProcessing(false);
        setProgress(0);
        return;
      }

      setProgress(30);

      // Create preview URL
      const url = URL.createObjectURL(file);

      if (enableCropping) {
        // Show cropper
        setCropImage(url);
        setIsProcessing(false);
        setProgress(0);
      } else {
        // Process directly without cropping
        setProgress(50);

        // Compress if needed
        const compressed = await compressImage(file, MAX_COMPRESSED_SIZE);
        setProgress(80);

        const finalUrl = URL.createObjectURL(compressed);
        setPreviewUrl(finalUrl);
        setProgress(100);

        onUpload(compressed, finalUrl);
        setIsProcessing(false);
        setTimeout(() => setProgress(0), 500);
      }
    },
    [enableCropping, onUpload],
  );

  const handleCrop = useCallback(
    async (croppedBlob: Blob) => {
      setIsProcessing(true);
      setProgress(50);

      // Compress the cropped image
      const compressed = await compressImage(croppedBlob, MAX_COMPRESSED_SIZE);
      setProgress(80);

      const finalUrl = URL.createObjectURL(compressed);
      setPreviewUrl(finalUrl);
      setCropImage(null);
      setProgress(100);

      onUpload(compressed, finalUrl);
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 500);
    },
    [onUpload],
  );

  const handleCropCancel = useCallback(() => {
    if (cropImage) {
      URL.revokeObjectURL(cropImage);
    }
    setCropImage(null);
  }, [cropImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [handleFile],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemove = useCallback(() => {
    if (previewUrl && previewUrl !== currentImage) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
    onCancel?.();
  }, [previewUrl, currentImage, onCancel]);

  // Cropper modal
  if (cropImage) {
    return (
      <ImageCropper
        image={cropImage}
        aspectRatio={aspectRatio}
        onCrop={handleCrop}
        onCancel={handleCropCancel}
      />
    );
  }

  // Compact mode with preview
  if (compact && showPreview && previewUrl) {
    return (
      <div className={`relative ${className}`}>
        <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10">
          <Image src={previewUrl} alt="Preview" fill className="object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white/80 hover:bg-black/80 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // Main upload UI
  return (
    <div className={className}>
      {/* Preview with remove option */}
      {showPreview && previewUrl && (
        <div className="relative mx-auto mb-3 max-w-[176px]">
          <div className="relative aspect-square overflow-hidden rounded-xl border-2 border-white/10">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              className="object-cover"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/80 hover:bg-black/80 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-2 text-sm text-white/70 hover:bg-white/10"
          >
            Change Image
          </button>
        </div>
      )}

      {/* Drop zone */}
      {(!showPreview || !previewUrl) && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => e.key === "Enter" && handleClick()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
            isDragging
              ? "border-brand bg-brand/10"
              : "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/5"
          } ${compact ? "h-20 w-20" : "mx-auto h-44 w-full max-w-[176px]"}`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="text-brand h-6 w-6 animate-spin" />
              {progress > 0 && (
                <div className="w-16 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="bg-brand h-1 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          ) : compact ? (
            <ImagePlus className="h-6 w-6 text-white/30" />
          ) : (
            <>
              <Upload className="mb-2 h-8 w-8 text-white/30" />
              <p className="text-sm text-white/50">
                {isDragging ? "Drop image here" : "Drag & drop or click"}
              </p>
              <p className="mt-1 text-xs text-white/30">
                JPG, PNG, WebP, GIF • Max 5MB
              </p>
            </>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={VALID_IMAGE_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

/**
 * Simple inline image upload button with preview
 */
export function InlineImageUploader({
  onUpload,
  currentImage,
  className = "",
}: {
  onUpload: (blob: Blob, previewUrl: string) => void;
  currentImage?: string | null;
  className?: string;
}) {
  return (
    <ImageUploader
      onUpload={onUpload}
      currentImage={currentImage}
      aspectRatio={1}
      enableCropping={true}
      showPreview={true}
      compact={true}
      className={className}
    />
  );
}

export default ImageUploader;
