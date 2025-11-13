"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Upload, Link as LinkIcon } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ElizaAvatar } from "./eliza-avatar";

interface CharacterFormCleanProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
}

type TagType = "topics" | "adjectives" | "plugins" | "postExamples";
type SubTab = "general" | "content" | "style" | "avatar";

export function CharacterFormClean({
  character,
  onChange,
}: CharacterFormCleanProps) {
  const [newTag, setNewTag] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("general");

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
            {/* Avatar Editor Section */}
            <div className="space-y-4">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Character Avatar
              </label>

              {/* Avatar Preview */}
              <div className="flex items-center gap-6 p-4 rounded-none bg-black/40 border border-white/10">
                <ElizaAvatar
                  avatarUrl={character.avatar_url}
                  name={character.name}
                  className="h-24 w-24"
                  fallbackClassName="bg-gradient-to-br from-purple-500 to-blue-600"
                  iconClassName="h-12 w-12"
                />
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-white">
                    {character.avatar_url ? "Current avatar" : "No avatar set"}
                  </p>
                  <p className="text-xs text-white/60">
                    Recommended: Square image, at least 256x256px
                  </p>
                </div>
              </div>

              {/* Avatar URL Input */}
              <div className="space-y-2">
                <label
                  htmlFor="avatar-url"
                  className="text-xs font-medium text-white/70 uppercase tracking-wide"
                >
                  Avatar URL
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <Input
                      id="avatar-url"
                      value={character.avatar_url || ""}
                      onChange={(e) => updateField("avatar_url", e.target.value)}
                      placeholder="https://example.com/avatar.png"
                      className="pl-10 rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/50">
                  Provide a direct URL to an image (PNG, JPG, WebP, or GIF)
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Plugins Section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Plugins
              </label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a plugin..."
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

            {/* Info Box */}
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
