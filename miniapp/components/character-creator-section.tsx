"use client";

import { Loader2, Sparkles, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/button";
import { ImageCropper } from "@/components/image-cropper";
import { useRenderTracking } from "@/lib/dev/render-tracking";
import { getAuthToken } from "@/lib/use-auth";

// Image validation constants
const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const CACHE_KEY = "miniapp_character_creator_draft";

interface CachedFormData {
  name: string;
  backstory: string;
  personality: string;
  imageTab: "generate" | "upload";
  imagePrompt: string;
  generatedImageUrl: string | null;
  isEditingImagePrompt: boolean;
  savedAt: number;
}

interface FormState {
  name: string;
  backstory: string;
  personality: string;
  imageTab: "generate" | "upload";
  imagePrompt: string;
  generatedImageUrl: string | null;
  isEditingImagePrompt: boolean;
}

const initialFormState: FormState = {
  name: "",
  backstory: "",
  personality: "",
  imageTab: "generate",
  imagePrompt: "",
  generatedImageUrl: null,
  isEditingImagePrompt: true,
};

function loadCachedData(): Partial<CachedFormData> | null {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;
  const data = JSON.parse(cached) as CachedFormData;
  // Expire cache after 24 hours
  if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
  return data;
}

function saveCachedData(data: Omit<CachedFormData, "savedAt">) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ ...data, savedAt: Date.now() }),
  );
}

function clearCachedData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_KEY);
}

function CharacterCreatorSection() {
  // Development: Track renders for this complex component
  useRenderTracking("CharacterCreatorSection", { threshold: 8 });

  const router = useRouter();

  const [formState, setFormState] = useState<FormState>(initialFormState);
  const {
    name,
    backstory,
    personality,
    imageTab,
    imagePrompt,
    generatedImageUrl,
    isEditingImagePrompt,
  } = formState;

  const updateFormState = useCallback((updates: Partial<FormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
  }, []);

  const [photo, setPhoto] = useState<File | null>(null);
  const [croppedPhotoBlob, setCroppedPhotoBlob] = useState<Blob | null>(null);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Memoize photo object URL to avoid memory leaks
  const photoObjectUrl = useMemo(() => {
    if (croppedPhotoBlob) {
      return URL.createObjectURL(croppedPhotoBlob);
    }
    if (photo) {
      return URL.createObjectURL(photo);
    }
    return null;
  }, [photo, croppedPhotoBlob]);

  // Clean up object URL when photo changes
  useEffect(() => {
    return () => {
      if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
      }
    };
  }, [photoObjectUrl]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [error, setError] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const isHydratedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cached data on mount
  useEffect(() => {
    const cached = loadCachedData();
    if (cached) {
      const { savedAt: _savedAt, ...formData } = cached as CachedFormData;
      void _savedAt;
      // Defer state update to avoid cascading renders
      queueMicrotask(() => {
        setFormState((prev) => ({ ...prev, ...formData }));
      });
    }
    isHydratedRef.current = true;
  }, []);

  const saveToCache = useCallback(() => {
    if (!isHydratedRef.current) return;
    saveCachedData({
      name,
      backstory,
      personality,
      imageTab,
      imagePrompt,
      generatedImageUrl,
      isEditingImagePrompt,
    });
  }, [
    name,
    backstory,
    personality,
    imageTab,
    imagePrompt,
    generatedImageUrl,
    isEditingImagePrompt,
  ]);

  useEffect(() => {
    saveToCache();
  }, [saveToCache]);

  const validateAndOpenCropper = useCallback((file: File) => {
    setError("");

    // Validate format
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      setError("Invalid format. Only JPG, PNG, WebP, and GIF are supported.");
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setError(`File too large (${sizeMB}MB). Maximum: 5MB`);
      return;
    }

    // Open cropper
    const url = URL.createObjectURL(file);
    setPhoto(file);
    setCropImageUrl(url);
  }, []);

  const handlePhotoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        validateAndOpenCropper(file);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [validateAndOpenCropper],
  );

  const handleCrop = useCallback(
    (blob: Blob) => {
      setCroppedPhotoBlob(blob);
      if (cropImageUrl) {
        URL.revokeObjectURL(cropImageUrl);
      }
      setCropImageUrl(null);
    },
    [cropImageUrl],
  );

  const handleCropCancel = useCallback(() => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
    }
    setCropImageUrl(null);
    setPhoto(null);
  }, [cropImageUrl]);

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
        validateAndOpenCropper(files[0]);
      }
    },
    [validateAndOpenCropper],
  );

  const handleRemovePhoto = useCallback(() => {
    if (photoObjectUrl && croppedPhotoBlob) {
      URL.revokeObjectURL(photoObjectUrl);
    }
    setPhoto(null);
    setCroppedPhotoBlob(null);
  }, [photoObjectUrl, croppedPhotoBlob]);

  const handleGenerateField = async (
    fieldName: "name" | "personality" | "backstory",
  ) => {
    if (generatingField || isGeneratingImage) return;

    setGeneratingField(fieldName);
    setError("");

    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fieldName,
        currentValue:
          fieldName === "name"
            ? name
            : fieldName === "personality"
              ? personality
              : backstory,
        context: {
          name,
          personality,
          backstory,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to generate");
      setGeneratingField(null);
      return;
    }

    const result = await response.json();
    if (result.success && result.value) {
      updateFormState({ [fieldName]: result.value });
    } else {
      setError(result.error || "Failed to generate");
    }
    setGeneratingField(null);
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage || generatingField) return;

    setIsGeneratingImage(true);
    updateFormState({ generatedImageUrl: null }); // Clear old image when generating new one
    setError("");

    const response = await fetch("/api/generate-photo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: imagePrompt,
        name,
        personality,
        backstory,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to generate image");
      setIsGeneratingImage(false);
      return;
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.type === "image" && data.imageUrl) {
              updateFormState({
                generatedImageUrl: data.imageUrl,
                isEditingImagePrompt: false,
              });
            } else if (data.type === "complete" && data.imageUrl) {
              updateFormState({
                generatedImageUrl: data.imageUrl,
                isEditingImagePrompt: false,
              });
            } else if (data.type === "error") {
              setError(data.error || "Generation failed");
              setIsGeneratingImage(false);
              return;
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim() && buffer.startsWith("data: ")) {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === "complete" && data.imageUrl) {
          updateFormState({
            generatedImageUrl: data.imageUrl,
            isEditingImagePrompt: false,
          });
        } else if (data.type === "error") {
          setError(data.error || "Generation failed");
        }
      }
    } else {
      // Fallback for non-streaming response
      const result = await response.json();
      if (result.success && result.imageUrl) {
        updateFormState({
          generatedImageUrl: result.imageUrl,
          isEditingImagePrompt: false,
        });
      } else {
        setError(result.error || "Failed to generate image");
      }
    }

    setIsGeneratingImage(false);
  };

  const handleGeneratePrompt = async () => {
    if (isGeneratingPrompt || generatingField || isGeneratingImage) return;

    setIsGeneratingPrompt(true);
    setError("");

    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fieldName: "imagePrompt",
        currentValue: imagePrompt,
        context: {
          name,
          personality,
          backstory,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to generate");
      setIsGeneratingPrompt(false);
      return;
    }

    const result = await response.json();
    if (result.success && result.value) {
      updateFormState({ imagePrompt: result.value });
    } else {
      setError(result.error || "Failed to generate");
    }
    setIsGeneratingPrompt(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a name or nickname");
      return;
    }

    if (!personality.trim()) {
      setError("Please enter a personality description");
      return;
    }

    if (!backstory.trim()) {
      setError("Please enter how you know each other");
      return;
    }

    setIsSubmitting(true);

    let avatarBase64: string | undefined;
    let imageUrls: string[] = [];
    let imageBase64s: string[] = [];

    // Use cropped photo if available, then fall back to original photo, then generated image
    let imageToUpload: File | Blob | null = croppedPhotoBlob || photo;

    if (!imageToUpload && generatedImageUrl) {
      // Convert generated image URL to File
      setIsUploadingImages(true);
      let response: Response;
      const directFetch = await fetch(generatedImageUrl, {
        mode: "cors",
      }).catch(() => null);
      if (directFetch && directFetch.ok) {
        response = directFetch;
      } else {
        // If CORS fails, proxy through upload API
        const uploadResponse = await fetch("/api/upload-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: [{ type: "url", data: generatedImageUrl }],
          }),
        });
        if (!uploadResponse.ok) {
          setError("Failed to fetch generated image");
          setIsSubmitting(false);
          setIsUploadingImages(false);
          return;
        }
        const uploadResult = await uploadResponse.json();
        if (uploadResult.images && uploadResult.images.length > 0) {
          response = await fetch(uploadResult.images[0].url);
        } else {
          setError("Failed to fetch generated image");
          setIsSubmitting(false);
          setIsUploadingImages(false);
          return;
        }
      }
      const blob = await response.blob();
      imageToUpload = new File([blob], `generated-${Date.now()}.png`, {
        type: blob.type || "image/png",
      });
    }

    if (imageToUpload) {
      setIsUploadingImages(true);

      const formData = new FormData();
      // Handle both File and Blob types
      if (imageToUpload instanceof File) {
        formData.append("images", imageToUpload);
      } else {
        formData.append("images", imageToUpload, `avatar-${Date.now()}.jpg`);
      }
      formData.append("type", "avatar");

      const uploadResponse = await fetch("/api/upload-images", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        setError(errorData.error || "Image upload failed");
        setIsSubmitting(false);
        setIsUploadingImages(false);
        return;
      }

      const uploadResult = await uploadResponse.json();

      if (uploadResult.images && uploadResult.images.length > 0) {
        avatarBase64 = uploadResult.images[0].base64;
        imageUrls = uploadResult.images.map((img: { url: string }) => img.url);
        imageBase64s = uploadResult.images
          .map((img: { base64?: string }) => img.base64)
          .filter((b: string | undefined): b is string => !!b);
      } else {
        imageUrls = uploadResult.urls || [];
        avatarBase64 = imageUrls[0];
      }

      setIsUploadingImages(false);
    }

    // Get auth token if user is logged in
    const authToken = getAuthToken();

    const response = await fetch("/api/create-character", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        backstory: backstory.trim() || undefined,
        personality: personality.trim() || undefined,
        avatarUrl: avatarBase64,
        avatarBase64: avatarBase64,
        imageUrls: imageUrls,
        imageBase64s: imageBase64s.length > 0 ? imageBase64s : undefined,
        authToken: authToken || undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Something went wrong");
      setIsSubmitting(false);
      setIsUploadingImages(false);
      return;
    }

    const result = await response.json();

    // Clear the cached draft since character was created successfully
    clearCachedData();

    // If authenticated, go directly to chat; otherwise show connecting animation
    if (result.authenticated) {
      router.push(`/chats/${result.characterId}`);
    } else {
      const params = new URLSearchParams({
        characterId: result.characterId,
        name: name.trim(),
      });
      if (result.sessionId) {
        params.set("sessionId", result.sessionId);
      }
      // Pass the avatar image for display on the loading screen
      const displayImage = photoObjectUrl || generatedImageUrl;
      if (displayImage) {
        params.set("avatarUrl", displayImage);
      }
      router.push(`/connecting?${params.toString()}`);
    }

    setIsSubmitting(false);
    setIsUploadingImages(false);
  };

  return (
    <>
      {/* Image Cropper Modal */}
      {cropImageUrl && (
        <ImageCropper
          image={cropImageUrl}
          aspectRatio={1}
          onCrop={handleCrop}
          onCancel={handleCropCancel}
        />
      )}

      <div className="flex w-full flex-col lg:w-auto lg:max-w-lg lg:flex-1 lg:shrink-0 xl:max-w-xl">
        <div className="w-full">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-white/90"
                >
                  Name
                </label>
                <button
                  type="button"
                  onClick={() => handleGenerateField("name")}
                  disabled={generatingField !== null || isGeneratingImage}
                  className="flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-50"
                >
                  {generatingField === "name" ? (
                    <Loader2 className="size-4 animate-spin text-white/70" />
                  ) : (
                    <Sparkles className="size-4 text-white/70" />
                  )}
                </button>
              </div>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => updateFormState({ name: e.target.value })}
                placeholder="Enter your character's name"
                className="focus:border-brand/50 focus:ring-brand/20 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-colors hover:border-white/20 focus:ring-1 focus:outline-hidden"
                required
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="personality"
                  className="block text-sm font-medium text-white/90"
                >
                  Personality
                </label>
                <button
                  type="button"
                  onClick={() => handleGenerateField("personality")}
                  disabled={generatingField !== null || isGeneratingImage}
                  className="flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-50"
                >
                  {generatingField === "personality" ? (
                    <Loader2 className="size-4 animate-spin text-white/70" />
                  ) : (
                    <Sparkles className="size-4 text-white/70" />
                  )}
                </button>
              </div>
              <textarea
                id="personality"
                value={personality}
                onChange={(e) =>
                  updateFormState({ personality: e.target.value })
                }
                placeholder="What are they like?"
                rows={3}
                maxLength={1000}
                className="focus:border-brand/50 focus:ring-brand/20 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-colors hover:border-white/20 focus:ring-1 focus:outline-hidden"
              />
            </div>

            <div className="space-y-2">
              <div className="flex gap-2 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    // If there's a generated image, show it (not editing mode)
                    updateFormState({
                      imageTab: "generate",
                      isEditingImagePrompt: generatedImageUrl
                        ? false
                        : isEditingImagePrompt,
                    });
                  }}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    imageTab === "generate"
                      ? "border-brand border-b-2 text-white"
                      : "text-white/50 hover:text-white/70"
                  }`}
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={() => updateFormState({ imageTab: "upload" })}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    imageTab === "upload"
                      ? "border-brand border-b-2 text-white"
                      : "text-white/50 hover:text-white/70"
                  }`}
                >
                  Upload
                </button>
              </div>

              {/* Fixed height container */}
              <div className="h-44">
                {imageTab === "generate" ? (
                  <>
                    {/* Show image when generated and not editing, otherwise show prompt */}
                    {generatedImageUrl && !isEditingImagePrompt ? (
                      <div className="mx-auto h-full w-full max-w-44">
                        <div className="relative h-full overflow-hidden rounded-lg border border-white/10">
                          <Image
                            src={generatedImageUrl}
                            alt="Generated"
                            width={176}
                            height={176}
                            className="h-full w-full object-cover"
                          />
                          {/* X button to replace - always visible for mobile */}
                          <button
                            type="button"
                            onClick={() =>
                              updateFormState({ isEditingImagePrompt: true })
                            }
                            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
                            aria-label="Replace image"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col">
                        {/* Multi-line textarea with generate prompt button */}
                        <div className="flex flex-1 flex-col space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white/90">
                              Image Description
                            </label>
                            <button
                              type="button"
                              onClick={handleGeneratePrompt}
                              disabled={
                                isGeneratingPrompt ||
                                generatingField !== null ||
                                isGeneratingImage
                              }
                              className="flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-50"
                            >
                              {isGeneratingPrompt ? (
                                <Loader2 className="size-4 animate-spin text-white/70" />
                              ) : (
                                <Sparkles className="size-4 text-white/70" />
                              )}
                            </button>
                          </div>
                          <textarea
                            value={imagePrompt}
                            onChange={(e) =>
                              updateFormState({ imagePrompt: e.target.value })
                            }
                            placeholder="Describe how they look..."
                            className="focus:border-brand/50 focus:ring-brand/20 w-full flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-colors hover:border-white/20 focus:ring-1 focus:outline-hidden"
                          />
                        </div>
                        {/* Generate button below */}
                        <button
                          type="button"
                          onClick={handleGenerateImage}
                          disabled={
                            isGeneratingImage ||
                            !imagePrompt.trim() ||
                            generatingField !== null
                          }
                          className="mt-2 flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/90 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isGeneratingImage ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-4" />
                              {generatedImageUrl
                                ? "Regenerate Image"
                                : "Generate Image"}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Single image upload - show preview or upload area */}
                    {(croppedPhotoBlob || photo) && photoObjectUrl ? (
                      <div className="mx-auto h-full w-full max-w-44">
                        <div className="relative h-full overflow-hidden rounded-lg border border-white/10">
                          <Image
                            src={photoObjectUrl}
                            alt="Preview"
                            width={176}
                            height={176}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                          {/* X button to clear - always visible for mobile */}
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
                            aria-label="Remove image"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) =>
                          e.key === "Enter" && fileInputRef.current?.click()
                        }
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`mx-auto flex h-full w-full max-w-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all ${
                          isDragging
                            ? "border-brand bg-brand/10"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <Upload
                          className={`mb-1 size-8 transition-colors ${isDragging ? "text-brand" : "text-white/30"}`}
                        />
                        <p className="px-4 text-center text-sm text-white/50">
                          {isDragging ? "Drop here" : "Drag & drop or click"}
                        </p>
                        <p className="mt-1 text-xs text-white/30">
                          JPG, PNG, WebP, GIF
                        </p>
                        <input
                          ref={fileInputRef}
                          id="photos"
                          type="file"
                          accept={VALID_IMAGE_TYPES.join(",")}
                          onChange={handlePhotoChange}
                          className="hidden"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="backstory"
                  className="block text-sm font-medium text-white/90"
                >
                  How do you know each other?
                </label>
                <button
                  type="button"
                  onClick={() => handleGenerateField("backstory")}
                  disabled={generatingField !== null || isGeneratingImage}
                  className="flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-50"
                >
                  {generatingField === "backstory" ? (
                    <Loader2 className="size-4 animate-spin text-white/70" />
                  ) : (
                    <Sparkles className="size-4 text-white/70" />
                  )}
                </button>
              </div>
              <input
                type="text"
                id="backstory"
                value={backstory}
                onChange={(e) => updateFormState({ backstory: e.target.value })}
                placeholder="Met in college, always joked about running away together."
                className="focus:border-brand/50 focus:ring-brand/20 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-colors hover:border-white/20 focus:ring-1 focus:outline-hidden"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="pt-1">
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  isUploadingImages ||
                  !name.trim() ||
                  !personality.trim() ||
                  !backstory.trim()
                }
                size="lg"
                className="from-brand to-brand-600 hover:from-brand-400 hover:to-brand h-11 w-full bg-gradient-to-b text-base font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadingImages
                  ? "Uploading..."
                  : isSubmitting
                    ? "Creating..."
                    : "Create"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// Enable why-did-you-render tracking for this component
if (process.env.NODE_ENV === "development") {
  (
    CharacterCreatorSection as React.FC & { whyDidYouRender?: boolean }
  ).whyDidYouRender = true;
}

export default CharacterCreatorSection;
