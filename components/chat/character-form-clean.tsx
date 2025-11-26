"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Upload, Loader2, ImageIcon } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { uploadCharacterAvatar } from "@/app/actions/characters";
import { toast } from "sonner";
import Image from "next/image";

interface CharacterFormCleanProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
}

type TagType = "topics" | "adjectives" | "plugins" | "postExamples";
type SubTab = "general" | "content" | "style" | "avatar" | "plugins";

export function CharacterFormClean({
  character,
  onChange,
}: CharacterFormCleanProps) {
  const [newTag, setNewTag] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("general");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (file: File) => {
    if (!file) {
      toast.error("No file selected");
      return;
    }

    console.log("[Avatar Upload] Starting upload:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Validate file size on client side
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      // Convert file to base64 for reliable server action transfer
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await uploadCharacterAvatar({
        base64Data: base64,
        fileName: file.name,
        fileType: file.type,
        characterId: character.id || undefined,
      });
      console.log("[Avatar Upload] Result:", result);

      if (result.success && result.avatarUrl) {
        onChange({ ...character, avatarUrl: result.avatarUrl });
        toast.success("Avatar uploaded successfully");
      } else {
        toast.error(result.error || "Failed to upload avatar");
      }
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAvatarUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleAvatarUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const updateField = (field: keyof ElizaCharacter, value: unknown) => {
    onChange({ ...character, [field]: value });
  };

  const addTag = (type: TagType) => {
    if (!newTag.trim()) return;

    const currentArray = (character[type] as string[]) || [];
    updateField(type, [...currentArray, newTag.trim()]);
    setNewTag("");
  };

  const removeTag = (type: TagType, index: number) => {
    const currentArray = (character[type] as string[]) || [];
    updateField(
      type,
      currentArray.filter((_, i) => i !== index),
    );
  };

  const bioText =
    typeof character.bio === "string"
      ? character.bio
      : character.bio?.join("\n\n") || "";

  return (
    <div className="flex h-full flex-col">
      {/* Sub Navigation */}
      <div className="flex-shrink-0 border-b border-white/10 px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveSubTab("general")}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors",
              activeSubTab === "general"
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white",
            )}
          >
            General
          </button>
          <button
            onClick={() => setActiveSubTab("content")}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors",
              activeSubTab === "content"
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white",
            )}
          >
            Content
          </button>
          <button
            onClick={() => setActiveSubTab("style")}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors",
              activeSubTab === "style"
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white",
            )}
          >
            Style
          </button>
          <button
            onClick={() => setActiveSubTab("avatar")}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors",
              activeSubTab === "avatar"
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white",
            )}
          >
            Avatar
          </button>
          <button
            onClick={() => setActiveSubTab("plugins")}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors",
              activeSubTab === "plugins"
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white",
            )}
          >
            Plugins
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* General Tab */}
        {activeSubTab === "general" && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Name *
              </label>
              <Input
                id="name"
                value={character.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Character name"
                className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="username"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Username
              </label>
              <Input
                id="username"
                value={character.username || ""}
                onChange={(e) => updateField("username", e.target.value)}
                placeholder="@username"
                className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="bio"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Bio *
              </label>
              <Textarea
                id="bio"
                value={bioText}
                onChange={(e) => updateField("bio", e.target.value)}
                placeholder="Describe the character's background and purpose..."
                className="min-h-[120px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="system"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                System Prompt
              </label>
              <Textarea
                id="system"
                value={character.system || ""}
                onChange={(e) => updateField("system", e.target.value)}
                placeholder="System-level instructions for the agent..."
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>
          </div>
        )}

        {/* Content Tab */}
        {activeSubTab === "content" && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Topics
              </label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a topic..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("topics");
                    }
                  }}
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <button
                  type="button"
                  onClick={() => addTag("topics")}
                  className="rounded-none border border-white/10 bg-black/40 px-4 py-2 text-[#FF5800] hover:bg-white/5 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {character.topics?.map((topic, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 rounded-none bg-white/10 px-2 py-1 text-xs text-white"
                  >
                    {topic}
                    <button
                      onClick={() => removeTag("topics", index)}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Adjectives (Personality Traits)
              </label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a trait..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("adjectives");
                    }
                  }}
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <button
                  type="button"
                  onClick={() => addTag("adjectives")}
                  className="rounded-none border border-white/10 bg-black/40 px-4 py-2 text-[#FF5800] hover:bg-white/5 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {character.adjectives?.map((adj, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 rounded-none bg-white/10 px-2 py-1 text-xs text-white"
                  >
                    {adj}
                    <button
                      onClick={() => removeTag("adjectives", index)}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Post Examples
              </label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add an example post..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("postExamples");
                    }
                  }}
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <button
                  type="button"
                  onClick={() => addTag("postExamples")}
                  className="rounded-none border border-white/10 bg-black/40 px-4 py-2 text-[#FF5800] hover:bg-white/5 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {character.postExamples?.map((post, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 rounded-none bg-black/40 border border-white/10 p-2"
                  >
                    <p className="flex-1 text-sm text-white">{post}</p>
                    <button
                      onClick={() => removeTag("postExamples", index)}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="h-4 w-4 text-white/70" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Style Tab */}
        {activeSubTab === "style" && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <label
                htmlFor="style-all"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                General Style Guidelines
              </label>
              <Textarea
                id="style-all"
                value={
                  Array.isArray(character.style?.all)
                    ? character.style.all.join("\n")
                    : typeof character.style?.all === "string"
                      ? character.style.all
                      : ""
                }
                onChange={(e) =>
                  updateField("style", {
                    ...character.style,
                    all: e.target.value.split("\n").filter((s) => s.trim()),
                  })
                }
                placeholder="One guideline per line..."
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="style-chat"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Chat Style Guidelines
              </label>
              <Textarea
                id="style-chat"
                value={
                  Array.isArray(character.style?.chat)
                    ? character.style.chat.join("\n")
                    : typeof character.style?.chat === "string"
                      ? character.style.chat
                      : ""
                }
                onChange={(e) =>
                  updateField("style", {
                    ...character.style,
                    chat: e.target.value.split("\n").filter((s) => s.trim()),
                  })
                }
                placeholder="One guideline per line..."
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="style-post"
                className="text-xs font-medium text-white/70 uppercase tracking-wide"
              >
                Post Style Guidelines
              </label>
              <Textarea
                id="style-post"
                value={
                  Array.isArray(character.style?.post)
                    ? character.style.post.join("\n")
                    : typeof character.style?.post === "string"
                      ? character.style.post
                      : ""
                }
                onChange={(e) =>
                  updateField("style", {
                    ...character.style,
                    post: e.target.value.split("\n").filter((s) => s.trim()),
                  })
                }
                placeholder="One guideline per line..."
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>
          </div>
        )}

        {/* Avatar Tab */}
        {activeSubTab === "avatar" && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-4">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Agent Avatar
              </label>
              
              {/* Current Avatar Preview */}
              <div className="flex items-start gap-6">
                <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
                  {character.avatarUrl ? (
                    <Image
                      src={character.avatarUrl}
                      alt={character.name || "Agent avatar"}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-white/30" />
                  )}
                </div>
                
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-white/60">
                    Upload a profile image for your agent. This will be displayed in chat, dashboard, and all agent interactions.
                  </p>
                  
                  {/* Upload Area */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className={cn(
                      "border-2 border-dashed border-white/20 rounded-lg p-6 text-center cursor-pointer transition-colors",
                      "hover:border-[#FF5800]/50 hover:bg-white/5",
                      isUploadingAvatar && "opacity-50 pointer-events-none"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {isUploadingAvatar ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 text-[#FF5800] animate-spin" />
                        <span className="text-sm text-white/60">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-white/40" />
                        <span className="text-sm text-white/60">
                          Click to upload or drag and drop
                        </span>
                        <span className="text-xs text-white/40">
                          JPEG, PNG, WebP or GIF (max 5MB)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Avatar URL Input */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                  Or enter URL directly
                </label>
                <Input
                  value={character.avatarUrl || ""}
                  onChange={(e) => updateField("avatarUrl", e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Plugins Tab */}
        {activeSubTab === "plugins" && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Plugins
              </label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a plugin (e.g. @elizaos/plugin-elevenlabs)..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("plugins");
                    }
                  }}
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <button
                  type="button"
                  onClick={() => addTag("plugins")}
                  className="rounded-none border border-white/10 bg-black/40 px-4 py-2 text-[#FF5800] hover:bg-white/5 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {character.plugins?.map((plugin, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 rounded-none bg-white/10 border border-white/20 px-2 py-1 text-xs text-white"
                  >
                    {plugin}
                    <button
                      onClick={() => removeTag("plugins", index)}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-none bg-black/40 border border-white/10 p-4">
              <p className="text-sm text-white/60">
                Additional settings like{" "}
                <code className="text-[#FF5800]">knowledge</code>,{" "}
                <code className="text-[#FF5800]">settings</code>, and{" "}
                <code className="text-[#FF5800]">messageExamples</code> can be
                configured in the JSON view.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
