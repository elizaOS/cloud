"use client";

import { useState, useRef } from "react";
import { X, Loader2, Camera, ImagePlus } from "lucide-react";
import { uploadCharacterAvatar } from "@/app/actions/characters";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AvatarUploadProps {
  value?: string;
  onChange: (url: string) => void;
  name?: string;
  size?: "sm" | "lg";
}

export function AvatarUpload({ value, onChange, name, size = "lg" }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file type. Please upload an image.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const result = await uploadCharacterAvatar(formData);
      
      if (result.success && result.url) {
        onChange(result.url);
        toast.success("Avatar uploaded! 🔥");
      } else {
        toast.error(result.error || "Failed to upload avatar");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const sizeClasses = size === "lg" ? "h-32 w-32" : "h-20 w-20";
  const iconSize = size === "lg" ? "h-8 w-8" : "h-5 w-5";

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={isUploading}
        className={cn(
          sizeClasses,
          "relative rounded-2xl overflow-hidden transition-all duration-300",
          "border-2 border-dashed",
          isDragging 
            ? "border-[#FF5800] bg-[#FF5800]/10 scale-105" 
            : value 
              ? "border-transparent" 
              : "border-white/20 hover:border-[#FF5800]/50",
          "focus:outline-none focus:ring-2 focus:ring-[#FF5800] focus:ring-offset-2 focus:ring-offset-black",
          isUploading && "animate-pulse"
        )}
      >
        {value ? (
          <>
            <img 
              src={value} 
              alt={name || "Avatar"} 
              className="h-full w-full object-cover"
            />
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </>
        ) : (
          <div className={cn(
            "h-full w-full flex flex-col items-center justify-center gap-2",
            "bg-gradient-to-br from-white/5 to-white/10"
          )}>
            {isUploading ? (
              <Loader2 className={cn(iconSize, "text-[#FF5800] animate-spin")} />
            ) : (
              <>
                <ImagePlus className={cn(iconSize, "text-white/40 group-hover:text-[#FF5800] transition-colors")} />
                {size === "lg" && (
                  <span className="text-[10px] uppercase tracking-wider text-white/30 group-hover:text-white/50 transition-colors">
                    Drop or click
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </button>

      {/* Remove Button */}
      {value && !isUploading && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          className={cn(
            "absolute -top-2 -right-2 p-1.5 rounded-full",
            "bg-rose-500 text-white",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-rose-600 hover:scale-110 transition-transform"
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
