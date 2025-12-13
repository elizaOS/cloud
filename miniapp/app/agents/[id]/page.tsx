"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Lightbulb,
  Loader2,
  MessageSquare,
  Save,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CharacterPreview,
  ConversationBuilder,
  type MessageExample,
} from "@/components/conversation-builder";
import { ImageCropper } from "@/components/image-cropper";
import { CompactImageGallery, type GalleryImage } from "@/components/image-gallery";
import {
  getVoiceStyleDirectives,
  type PersonalityPreset,
  PersonalityPresets,
  type VoiceConfig,
  VoiceConfigPanel,
} from "@/components/personality-presets";
import {
  type AgentDetails,
  getAgent,
  type ImageGenerationVibe,
  updateAgent,
} from "@/lib/cloud-api";
import { useRenderTracking } from "@/lib/dev/render-tracking";
import { useAuth } from "@/lib/use-auth";

// Image validation constants
const VALID_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_GALLERY_IMAGES = 10;

type EditMode = "simple" | "advanced";

function AgentDetailPage() {
  useRenderTracking("AgentDetailPage", { threshold: 8 });

  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;
  const { ready, authenticated } = useAuth();

  const [agent, setAgent] = useState<AgentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<EditMode>("simple");

  // Form state - simple mode
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Image handling state
  const [imageTab, setImageTab] = useState<"generate" | "upload" | "gallery">("generate");
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isEditingImagePrompt, setIsEditingImagePrompt] = useState(true);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  
  // Cropping state
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [croppedPhotoBlob, setCroppedPhotoBlob] = useState<Blob | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Gallery state
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [primaryImageId, setPrimaryImageId] = useState<string | null>(null);

  // Form state - advanced mode
  const [topics, setTopics] = useState("");
  const [adjectives, setAdjectives] = useState("");
  const [styleAll, setStyleAll] = useState("");
  const [styleChat, setStyleChat] = useState("");
  const [messageExamples, setMessageExamples] = useState<MessageExample[]>([]);

  // Enhanced UX state
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>();
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    tone: "casual",
    length: "normal",
    useEmojis: false,
  });
  const [isGeneratingExamples, setIsGeneratingExamples] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Image generation settings (for auto-generating images in chat responses)
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [imageGenAutoGenerate, setImageGenAutoGenerate] = useState(false);
  const [imageGenVibe, setImageGenVibe] = useState<ImageGenerationVibe>("playful");
  const [imageGenReferenceImages, setImageGenReferenceImages] = useState<string[]>([]);
  const referenceImageInputRef = useRef<HTMLInputElement>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch agent
  const fetchAgent = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await getAgent(agentId);
    setAgent(data);

    // Initialize form
    setName(data.name);
    setBio(Array.isArray(data.bio) ? data.bio.join("\n") : data.bio);
    setAvatarUrl(data.avatarUrl || "");
    setTopics(data.topics?.join(", ") || "");
    setAdjectives(data.adjectives?.join(", ") || "");
    setStyleAll(data.style?.all?.join("\n") || "");
    setStyleChat(data.style?.chat?.join("\n") || "");

    // Initialize message examples
    if (data.messageExamples && Array.isArray(data.messageExamples)) {
      const examples: MessageExample[] = [];
      for (const example of data.messageExamples) {
        if (Array.isArray(example) && example.length >= 2) {
          const userMsg = example.find((m) => m.name?.toLowerCase() === "user");
          const agentMsg = example.find((m) => m.name?.toLowerCase() !== "user");
          if (userMsg && agentMsg) {
            examples.push({
              id: `ex-${Date.now()}-${Math.random()}`,
              user: userMsg.content?.text || "",
              agent: agentMsg.content?.text || "",
            });
          }
        }
      }
      setMessageExamples(examples);
    }

    // Detect voice config from existing style
    if (data.style?.chat) {
      const chatStyle = data.style.chat.join(" ").toLowerCase();
      if (chatStyle.includes("emoji")) setVoiceConfig(v => ({ ...v, useEmojis: true }));
      if (chatStyle.includes("brief") || chatStyle.includes("short")) setVoiceConfig(v => ({ ...v, length: "brief" }));
      if (chatStyle.includes("detailed") || chatStyle.includes("thorough")) setVoiceConfig(v => ({ ...v, length: "detailed" }));
      if (chatStyle.includes("playful")) setVoiceConfig(v => ({ ...v, tone: "playful" }));
      if (chatStyle.includes("formal")) setVoiceConfig(v => ({ ...v, tone: "formal" }));
      if (chatStyle.includes("serious")) setVoiceConfig(v => ({ ...v, tone: "serious" }));
    }

    if (data.avatarUrl) {
      setGeneratedImageUrl(data.avatarUrl);
      setIsEditingImagePrompt(false);

      // Initialize gallery with existing avatar
      const existingImage: GalleryImage = {
        id: `existing_${Date.now()}`,
        url: data.avatarUrl,
        isPrimary: true,
      };
      setGalleryImages([existingImage]);
      setPrimaryImageId(existingImage.id);
    }

    // Load image generation settings
    if (data.imageSettings) {
      setImageGenEnabled(data.imageSettings.enabled);
      setImageGenAutoGenerate(data.imageSettings.autoGenerate);
      if (data.imageSettings.vibe) {
        setImageGenVibe(data.imageSettings.vibe as ImageGenerationVibe);
      }
      if (data.imageSettings.referenceImages) {
        setImageGenReferenceImages(data.imageSettings.referenceImages);
      }
    }

    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    if (authenticated && agentId) {
      queueMicrotask(() => {
        fetchAgent();
      });
    }
  }, [authenticated, agentId, fetchAgent]);

  // Photo URL management
  const photoObjectUrl = useMemo(() => {
    if (croppedPhotoBlob) {
      return URL.createObjectURL(croppedPhotoBlob);
    }
    if (photo) {
      return URL.createObjectURL(photo);
    }
    return null;
  }, [photo, croppedPhotoBlob]);

  useEffect(() => {
    return () => {
      if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
      }
    };
  }, [photoObjectUrl]);

  // Image validation and cropper handling
  const validateAndOpenCropper = useCallback((file: File) => {
    setError(null);
    
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

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndOpenCropper(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, [validateAndOpenCropper]);

  const handleCrop = useCallback((blob: Blob) => {
    setCroppedPhotoBlob(blob);
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
    }
    setCropImageUrl(null);
    setGeneratedImageUrl(null);
    
    // Add to gallery
    const newImage: GalleryImage = {
      id: `crop_${Date.now()}`,
      url: URL.createObjectURL(blob),
      isPrimary: galleryImages.length === 0,
    };
    setGalleryImages(prev => [...prev, newImage]);
    if (galleryImages.length === 0) {
      setPrimaryImageId(newImage.id);
    }
  }, [cropImageUrl, galleryImages.length]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndOpenCropper(files[0]);
    }
  }, [validateAndOpenCropper]);

  const handleRemovePhoto = useCallback(() => {
    if (photoObjectUrl && croppedPhotoBlob) {
      URL.revokeObjectURL(photoObjectUrl);
    }
    setPhoto(null);
    setCroppedPhotoBlob(null);
  }, [photoObjectUrl, croppedPhotoBlob]);

  // Gallery handlers
  const handleSelectPrimaryImage = useCallback((imageId: string) => {
    setPrimaryImageId(imageId);
    setGalleryImages(prev => prev.map(img => ({
      ...img,
      isPrimary: img.id === imageId,
    })));
  }, []);

  const handleDeleteGalleryImage = useCallback((imageId: string) => {
    setGalleryImages(prev => {
      const newImages = prev.filter(img => img.id !== imageId);
      // If deleted image was primary, set first remaining as primary
      if (primaryImageId === imageId && newImages.length > 0) {
        newImages[0].isPrimary = true;
        setPrimaryImageId(newImages[0].id);
      } else if (newImages.length === 0) {
        setPrimaryImageId(null);
      }
      return newImages;
    });
  }, [primaryImageId]);

  const handleAddGalleryImage = useCallback(() => {
    if (galleryImages.length >= MAX_GALLERY_IMAGES) {
      setError(`Maximum ${MAX_GALLERY_IMAGES} images allowed`);
      return;
    }
    fileInputRef.current?.click();
  }, [galleryImages.length]);

  // Apply personality preset
  const handleApplyPreset = (preset: PersonalityPreset) => {
    setSelectedPresetId(preset.id);
    setAdjectives(preset.adjectives.join(", "));
    setTopics(preset.topics.join(", "));
    setStyleAll(preset.styleAll.join("\n"));
    setStyleChat(preset.styleChat.join("\n"));
    
    // If bio is empty or generic, suggest the hint
    if (!bio.trim() || bio.length < 50) {
      setBio(preset.bioHint);
    }
  };

  // Generate field
  const handleGenerateField = async (fieldName: "name" | "personality" | "improvedBio") => {
    if (generatingField || isGeneratingImage) return;

    setGeneratingField(fieldName);
    setError(null);
    
    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldName: fieldName === "improvedBio" ? "improvedBio" : fieldName,
        currentValue: fieldName === "name" ? name : bio,
        context: { name, personality: bio, adjectives },
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
      if (fieldName === "name") {
        setName(result.value);
      } else {
        setBio(result.value);
      }
    }
    setGeneratingField(null);
  };

  // Get AI suggestions
  const handleGetSuggestions = async () => {
    if (isLoadingSuggestions) return;

    setIsLoadingSuggestions(true);
    setSuggestions(null);
    
    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldName: "suggestions",
        currentValue: bio,
        context: { name, personality: bio, adjectives },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.value) {
        setSuggestions(result.value);
      }
    }
    setIsLoadingSuggestions(false);
  };

  // Generate image prompt
  const handleGeneratePrompt = async () => {
    if (isGeneratingPrompt || generatingField || isGeneratingImage) return;

    setIsGeneratingPrompt(true);
    setError(null);
    
    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldName: "imagePrompt",
        currentValue: imagePrompt,
        context: { name, personality: bio, backstory: "" },
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
      setImagePrompt(result.value);
    }
    setIsGeneratingPrompt(false);
  };

  // Generate image
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage || generatingField) return;

    setIsGeneratingImage(true);
    setGeneratedImageUrl(null);
    setError(null);

    const response = await fetch("/api/generate-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: imagePrompt,
        name,
        personality: bio,
        backstory: "",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to generate image");
      setIsGeneratingImage(false);
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if ((data.type === "image" || data.type === "complete") && data.imageUrl) {
              setGeneratedImageUrl(data.imageUrl);
              setIsEditingImagePrompt(false);
              setPhoto(null);
            } else if (data.type === "error") {
              setError(data.error || "Generation failed");
              setIsGeneratingImage(false);
              return;
            }
          }
        }
      }
    }
    setIsGeneratingImage(false);
  };

  // Generate message examples
  const handleGenerateExamples = async () => {
    if (isGeneratingExamples || !name) return;

    setIsGeneratingExamples(true);
    
    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldName: "messageExamples",
        context: { name, personality: bio, adjectives },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && Array.isArray(result.value)) {
        const newExamples: MessageExample[] = result.value.map(
          (ex: { user: string; agent: string }, i: number) => ({
            id: `gen-${Date.now()}-${i}`,
            user: ex.user,
            agent: ex.agent,
          })
        );
        setMessageExamples([...messageExamples, ...newExamples]);
      }
    }
    setIsGeneratingExamples(false);
  };

  // Save agent
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    let finalAvatarUrl = avatarUrl;

    // Determine what image to save - prioritize: cropped blob > photo > generated > gallery primary
    const primaryGalleryImage = galleryImages.find(img => img.id === primaryImageId);
    let imageToUpload: File | Blob | null = croppedPhotoBlob || photo;

    // If no new upload, check if we should use generated or existing
    if (!imageToUpload) {
      if (generatedImageUrl && generatedImageUrl !== agent?.avatarUrl) {
        const response = await fetch(generatedImageUrl);
        const blob = await response.blob();
        imageToUpload = new File([blob], `avatar-${Date.now()}.png`, { type: blob.type || "image/png" });
      } else if (primaryGalleryImage && primaryGalleryImage.url !== agent?.avatarUrl) {
        // Only upload if it's a blob URL (local), not an existing URL
        if (primaryGalleryImage.url.startsWith("blob:")) {
          const response = await fetch(primaryGalleryImage.url);
          const blob = await response.blob();
          imageToUpload = new File([blob], `avatar-${Date.now()}.png`, { type: blob.type || "image/png" });
        }
      }
    }

    // Upload new image if needed
    if (imageToUpload) {
      const formData = new FormData();
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

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        if (uploadResult.images && uploadResult.images.length > 0) {
          finalAvatarUrl = uploadResult.images[0].url;
        }
      }
    }

    // Build style with voice config
    const voiceDirectives = getVoiceStyleDirectives(voiceConfig);
    const combinedStyleChat = [...styleChat.split("\n").filter(Boolean), ...voiceDirectives];

    const updateData: Parameters<typeof updateAgent>[1] = {
      name,
      bio: bio.includes("\n") ? bio.split("\n").filter(Boolean) : bio,
      avatarUrl: finalAvatarUrl || null,
      topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
      adjectives: adjectives.split(",").map((a) => a.trim()).filter(Boolean),
      style: {
        all: styleAll.split("\n").filter(Boolean),
        chat: combinedStyleChat,
      },
    };

    // Include message examples
    if (messageExamples.length > 0) {
      updateData.messageExamples = messageExamples
        .filter((ex) => ex.user.trim() && ex.agent.trim())
        .map((ex) => [
          { name: "user", content: { text: ex.user.trim() } },
          { name: name, content: { text: ex.agent.trim() } },
        ]);
    }

    // Include image generation settings
    updateData.imageSettings = {
      enabled: imageGenEnabled,
      autoGenerate: imageGenAutoGenerate,
      referenceImages: imageGenReferenceImages,
      vibe: imageGenVibe,
    };

    const updated = await updateAgent(agentId, updateData);
    if (agent) {
      setAgent({ ...agent, ...updated });
    }
    setAvatarUrl(finalAvatarUrl || "");
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    setSaving(false);
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
        <Link
          href="/chats"
          className="mt-4 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to friends
        </Link>
      </div>
    );
  }

  const displayImage = photoObjectUrl || generatedImageUrl || avatarUrl;

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
      
      <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back button */}
      <Link
        href="/chats"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to friends
      </Link>

      {/* Hero section with avatar */}
      <div className="mb-8 flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
        <div className="relative mb-4 h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-linear-to-br from-brand/20 to-accent-brand/20 sm:mb-0 sm:mr-6">
          {displayImage ? (
            <Image
              src={displayImage}
              alt={name}
              fill
              className="object-cover"
              unoptimized={!!photo}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Bot className="h-16 w-16 text-brand-400" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{agent?.name}</h1>
          <p className="mt-1 line-clamp-2 text-sm text-white/60">
            {Array.isArray(agent?.bio) ? agent.bio[0] : agent?.bio}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Link
              href={`/chats/${agentId}`}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat Now</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Success/Error messages */}
      {success && (
        <div className="mb-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-400">
          Changes saved successfully!
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setMode("simple")}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "simple"
              ? "bg-brand text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Simple
        </button>
        <button
          type="button"
          onClick={() => setMode("advanced")}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "advanced"
              ? "bg-brand text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          <Settings2 className="h-4 w-4" />
          Advanced
        </button>
      </div>

      {/* Form */}
      <div className="space-y-6 rounded-xl border border-white/10 bg-white/2 p-6">
        {/* Personality Presets */}
        <PersonalityPresets
          selectedPresetId={selectedPresetId}
          onSelectPreset={handleApplyPreset}
        />

        <div className="border-t border-white/10" />

        {/* Name */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="character-name" className="block text-sm font-medium text-white/80">Name</label>
            <button
              type="button"
              onClick={() => handleGenerateField("name")}
              disabled={generatingField !== null || isGeneratingImage}
              className="flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50"
            >
              {generatingField === "name" ? (
                <Loader2 className="size-4 text-white/70 animate-spin" />
              ) : (
                <Sparkles className="size-4 text-white/70" />
              )}
            </button>
          </div>
          <input
            id="character-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none"
          />
        </div>

        {/* Bio / Personality */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="character-personality" className="block text-sm font-medium text-white/80">
              Personality
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGetSuggestions}
                disabled={isLoadingSuggestions || !name}
                className="flex items-center gap-1 text-xs text-brand/80 hover:text-brand disabled:opacity-50"
                title="Get AI suggestions"
              >
                {isLoadingSuggestions ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lightbulb className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Suggestions</span>
              </button>
              <button
                type="button"
                onClick={() => handleGenerateField("improvedBio")}
                disabled={generatingField !== null || isGeneratingImage}
                className="flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50"
                title="Improve with AI"
              >
                {generatingField === "improvedBio" || generatingField === "personality" ? (
                  <Loader2 className="size-4 text-white/70 animate-spin" />
                ) : (
                  <Sparkles className="size-4 text-white/70" />
                )}
              </button>
            </div>
          </div>
          <textarea
            id="character-personality"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Describe your character's personality..."
            rows={4}
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none"
          />
          
          {/* AI Suggestions */}
          {suggestions && (
            <div className="mt-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-brand">
                <Lightbulb className="h-3.5 w-3.5" />
                AI Suggestions
              </div>
              <p className="text-sm text-white/70 whitespace-pre-line">{suggestions}</p>
              <button
                type="button"
                onClick={() => setSuggestions(null)}
                className="mt-2 text-xs text-white/40 hover:text-white/60"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Voice & Tone Configuration */}
        <VoiceConfigPanel
          config={voiceConfig}
          onChange={setVoiceConfig}
        />

        {/* Image Generation in Chat Settings */}
        <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-brand" />
              <span className="text-sm font-medium text-white/80">Photo Responses</span>
            </div>
            <button
              type="button"
              onClick={() => setImageGenEnabled(!imageGenEnabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                imageGenEnabled ? "bg-brand" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  imageGenEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {imageGenEnabled && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-white/50">
                When enabled, your character can include photos in their chat responses.
                Upload reference images to maintain consistent appearance.
              </p>

              {/* Auto-generate toggle */}
              <div className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                <div>
                  <p className="text-sm font-medium text-white/80">Auto-generate photos</p>
                  <p className="text-xs text-white/40">Include a photo with every response</p>
                </div>
                <button
                  type="button"
                  onClick={() => setImageGenAutoGenerate(!imageGenAutoGenerate)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    imageGenAutoGenerate ? "bg-brand" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      imageGenAutoGenerate ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Vibe selector */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-white/80">Photo Style</p>
                <div className="grid grid-cols-4 gap-2">
                  {(["playful", "flirty", "shy", "bold", "romantic", "spicy", "mysterious", "intellectual"] as const).map(
                    (vibe) => (
                      <button
                        key={vibe}
                        type="button"
                        onClick={() => setImageGenVibe(vibe)}
                        className={`rounded-lg px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                          imageGenVibe === vibe
                            ? "bg-brand text-white"
                            : "bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {vibe}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Reference images */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white/80">Reference Photos (Optional)</p>
                  <span className="text-xs text-white/40">{imageGenReferenceImages.length}/4</span>
                </div>
                <p className="text-xs text-white/50">
                  Add reference photos for consistent appearance. Without references, photos will be generated based on your character&apos;s description.
                </p>

                {/* Use profile photo button */}
                {(generatedImageUrl || avatarUrl) && imageGenReferenceImages.length < 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      const profileUrl = generatedImageUrl || avatarUrl;
                      if (profileUrl && !imageGenReferenceImages.includes(profileUrl)) {
                        setImageGenReferenceImages(prev => [...prev, profileUrl]);
                      }
                    }}
                    disabled={imageGenReferenceImages.includes(generatedImageUrl || avatarUrl || "")}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-xs font-medium text-brand hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Bot className="h-4 w-4" />
                    {imageGenReferenceImages.includes(generatedImageUrl || avatarUrl || "")
                      ? "Profile photo already added"
                      : "Use profile photo as reference"}
                  </button>
                )}

                <div className="flex flex-wrap gap-2">
                  {imageGenReferenceImages.map((url, index) => (
                    <div
                      key={`ref-${index}`}
                      className="relative h-16 w-16 rounded-lg overflow-hidden border border-white/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Reference ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageGenReferenceImages(prev =>
                            prev.filter((_, i) => i !== index)
                          );
                        }}
                        className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white/80 hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {imageGenReferenceImages.length < 4 && (
                    <button
                      type="button"
                      onClick={() => referenceImageInputRef.current?.click()}
                      className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-white/40 hover:border-white/40 hover:text-white/60 transition-colors"
                    >
                      <Upload className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <input
                  ref={referenceImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && imageGenReferenceImages.length < 4) {
                      const formData = new FormData();
                      formData.append("images", file);
                      formData.append("type", "reference");

                      const response = await fetch("/api/upload-images", {
                        method: "POST",
                        body: formData,
                      });

                      if (response.ok) {
                        const result = await response.json();
                        if (result.images?.[0]?.url) {
                          setImageGenReferenceImages(prev => [...prev, result.images[0].url]);
                        }
                      }
                    }
                    e.target.value = "";
                  }}
                />

                {imageGenReferenceImages.length === 0 && imageGenAutoGenerate && (
                  <p className="text-xs text-white/50">
                    Tip: Adding reference photos helps generate more consistent selfies.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Image Upload/Generate */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/80">Photo</p>

          <div className="flex gap-2 border-b border-white/10">
            <button
              type="button"
              onClick={() => {
                setImageTab("generate");
                if (generatedImageUrl) setIsEditingImagePrompt(false);
              }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                imageTab === "generate"
                  ? "text-white border-b-2 border-brand"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => setImageTab("upload")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                imageTab === "upload"
                  ? "text-white border-b-2 border-brand"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              Upload
            </button>
            {galleryImages.length > 0 && (
              <button
                type="button"
                onClick={() => setImageTab("gallery")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  imageTab === "gallery"
                    ? "text-white border-b-2 border-brand"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                Gallery ({galleryImages.length})
              </button>
            )}
          </div>

          <div className="min-h-44">
            {imageTab === "generate" ? (
              (generatedImageUrl || avatarUrl) && !isEditingImagePrompt ? (
                <div className="w-full h-full max-w-44 mx-auto">
                  <div className="h-44 rounded-lg border border-white/10 overflow-hidden relative">
                    <Image
                      src={generatedImageUrl || avatarUrl}
                      alt="Avatar"
                      width={176}
                      height={176}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setIsEditingImagePrompt(true)}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-44 flex flex-col">
                  <div className="flex-1 flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="image-description" className="text-sm font-medium text-white/80">
                        Image Description
                      </label>
                      <button
                        type="button"
                        onClick={handleGeneratePrompt}
                        disabled={isGeneratingPrompt || generatingField !== null || isGeneratingImage}
                        className="flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50"
                      >
                        {isGeneratingPrompt ? (
                          <Loader2 className="size-4 text-white/70 animate-spin" />
                        ) : (
                          <Sparkles className="size-4 text-white/70" />
                        )}
                      </button>
                    </div>
                    <textarea
                      id="image-description"
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="Describe the image you want to generate..."
                      className="flex-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none resize-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !imagePrompt.trim() || generatingField !== null}
                    className="mt-2 w-full h-10 px-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        {generatedImageUrl || avatarUrl ? "Regenerate Image" : "Generate Image"}
                      </>
                    )}
                  </button>
                </div>
              )
            ) : imageTab === "upload" ? (
              (croppedPhotoBlob || photo) && photoObjectUrl ? (
                <div className="w-full h-full max-w-44 mx-auto">
                  <div className="h-44 rounded-lg border border-white/10 overflow-hidden relative">
                    <Image
                      src={photoObjectUrl}
                      alt="Preview"
                      width={176}
                      height={176}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
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
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full h-44 max-w-44 mx-auto flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all ${
                    isDragging
                      ? "border-brand bg-brand/10"
                      : "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4"
                  }`}
                >
                  <Upload className={`mb-1 size-8 transition-colors ${isDragging ? "text-brand" : "text-white/30"}`} />
                  <p className="text-sm text-white/50">
                    {isDragging ? "Drop here" : "Drag & drop or click"}
                  </p>
                  <p className="text-xs text-white/30 mt-1">JPG, PNG, WebP, GIF</p>
                </div>
              )
            ) : (
              /* Gallery Tab */
              <div className="space-y-3">
                {/* Compact gallery display */}
                <CompactImageGallery
                  images={galleryImages}
                  primaryImageId={primaryImageId ?? undefined}
                  onSelectPrimary={handleSelectPrimaryImage}
                  onDeleteImage={handleDeleteGalleryImage}
                />
                
                {/* Add more button */}
                {galleryImages.length < MAX_GALLERY_IMAGES && (
                  <button
                    type="button"
                    onClick={handleAddGalleryImage}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/2 py-2 text-sm text-white/60 hover:border-white/30 hover:bg-white/5"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Add Image ({galleryImages.length}/{MAX_GALLERY_IMAGES})
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={VALID_IMAGE_TYPES.join(",")}
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>

        {/* Advanced fields toggle */}
        <button
          type="button"
          onClick={() => setShowAdvancedFields(!showAdvancedFields)}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/2 px-4 py-3 text-sm text-white/70 hover:bg-white/4 transition-colors"
          aria-expanded={showAdvancedFields}
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Advanced Settings
          </span>
          {showAdvancedFields ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {/* Advanced fields */}
        {showAdvancedFields && (
          <div className="space-y-4 rounded-lg border border-white/10 bg-white/1 p-4">
            {/* Topics */}
            <div>
              <label htmlFor="character-topics" className="block text-sm font-medium text-white/80">
                Topics
              </label>
              <input
                id="character-topics"
                type="text"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="technology, music, travel..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none"
              />
            </div>

            {/* Adjectives */}
            <div>
              <label htmlFor="character-adjectives" className="block text-sm font-medium text-white/80">
                Personality Traits
              </label>
              <input
                id="character-adjectives"
                type="text"
                value={adjectives}
                onChange={(e) => setAdjectives(e.target.value)}
                placeholder="friendly, witty, helpful..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none"
              />
            </div>

            {/* Style - All */}
            <div>
              <label htmlFor="character-style-all" className="block text-sm font-medium text-white/80">
                Response Style (All)
              </label>
              <textarea
                id="character-style-all"
                value={styleAll}
                onChange={(e) => setStyleAll(e.target.value)}
                placeholder="Keep responses concise&#10;Use casual language&#10;Be helpful and friendly"
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none"
              />
            </div>

            {/* Style - Chat */}
            <div>
              <label htmlFor="character-style-chat" className="block text-sm font-medium text-white/80">
                Chat Style
              </label>
              <textarea
                id="character-style-chat"
                value={styleChat}
                onChange={(e) => setStyleChat(e.target.value)}
                placeholder="Use emojis sparingly&#10;Ask follow-up questions&#10;Show empathy"
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-brand focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="border-t border-white/10 pt-4" />

        {/* Conversation Builder */}
        <ConversationBuilder
          examples={messageExamples}
          characterName={name}
          characterBio={bio}
          onChange={setMessageExamples}
          onGenerateExamples={handleGenerateExamples}
          isGenerating={isGeneratingExamples}
        />

        <div className="border-t border-white/10 pt-4" />

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex w-full items-center justify-between rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-brand hover:bg-brand/10 transition-colors"
          aria-expanded={showPreview}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Test Character Response
          </span>
          {showPreview ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showPreview && (
          <CharacterPreview
            name={name}
            bio={bio}
            avatarUrl={displayImage || null}
            examples={messageExamples}
            adjectives={adjectives.split(",").map((a) => a.trim()).filter(Boolean)}
          />
        )}

        {/* Save Changes Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span>Save Changes</span>
        </button>
      </div>
    </div>
    </>
  );
}

if (process.env.NODE_ENV === "development") {
  (AgentDetailPage as React.FC & { whyDidYouRender?: boolean }).whyDidYouRender = true;
}

export default AgentDetailPage;
