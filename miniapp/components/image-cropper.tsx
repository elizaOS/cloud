"use client";

import { Check, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";

export interface ImageCropperProps {
  image: string;
  aspectRatio?: number;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Creates a canvas element and draws the cropped portion of the image
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  canvas.width = safeArea;
  canvas.height = safeArea;

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-safeArea / 2, -safeArea / 2);

  ctx.drawImage(
    image,
    safeArea / 2 - image.width * 0.5,
    safeArea / 2 - image.height * 0.5
  );

  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas is empty"));
      }
    }, "image/jpeg", 0.9);
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

export function ImageCropper({
  image,
  aspectRatio = 1,
  onCrop,
  onCancel,
  minZoom = 1,
  maxZoom = 3,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleCrop = async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    const croppedBlob = await getCroppedImg(image, croppedAreaPixels, rotation);
    onCrop(croppedBlob);
    setIsProcessing(false);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, maxZoom));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, minZoom));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="relative flex h-full w-full max-w-2xl flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
            <span>Cancel</span>
          </button>
          <span className="text-sm font-medium text-white">Crop Image</span>
          <button
            type="button"
            onClick={handleCrop}
            disabled={isProcessing}
            className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>Apply</span>
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative flex-1 bg-black">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            cropShape="rect"
            showGrid
            classes={{
              containerClassName: "!bg-black",
              cropAreaClassName: "!border-brand !border-2",
            }}
          />
        </div>

        {/* Controls */}
        <div className="border-t border-white/10 bg-black/50 px-4 py-4">
          {/* Zoom Slider */}
          <div className="mb-4 flex items-center gap-4">
            <button
              type="button"
              onClick={handleZoomOut}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-brand"
            />
            <button
              type="button"
              onClick={handleZoomIn}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
          </div>

          {/* Rotate Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleRotate}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Rotate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageCropper;

