"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
  CornerBrackets,
} from "@/components/brand";

interface CharacterFormProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
}

type TagType = "topics" | "adjectives" | "plugins" | "postExamples";

export function CharacterForm({ character, onChange }: CharacterFormProps) {
  const [newTag, setNewTag] = useState("");

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
    <BrandCard className="relative h-full overflow-auto">
      <CornerBrackets size="sm" className="opacity-50" />
      
      <div className="relative z-10 space-y-6">
        <h3 className="text-lg font-bold text-white">Character Details</h3>
        
        <BrandTabs defaultValue="basics" className="w-full">
          <BrandTabsList className="grid w-full grid-cols-4">
            <BrandTabsTrigger value="basics" className="flex-1">Basics</BrandTabsTrigger>
            <BrandTabsTrigger value="personality" className="flex-1">Personality</BrandTabsTrigger>
            <BrandTabsTrigger value="style" className="flex-1">Style</BrandTabsTrigger>
            <BrandTabsTrigger value="advanced" className="flex-1">Advanced</BrandTabsTrigger>
          </BrandTabsList>

          {/* Basics Tab */}
          <BrandTabsContent value="basics" className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
              <label htmlFor="username" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
              <label htmlFor="bio" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
              <label htmlFor="system" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
          </BrandTabsContent>

          {/* Personality Tab */}
          <BrandTabsContent value="personality" className="space-y-4">
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
                <BrandButton
                  type="button"
                  variant="icon-primary"
                  size="icon"
                  onClick={() => addTag("topics")}
                >
                  <Plus className="h-4 w-4" style={{ color: "#FF5800" }} />
                </BrandButton>
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
                <BrandButton
                  type="button"
                  variant="icon-primary"
                  size="icon"
                  onClick={() => addTag("adjectives")}
                >
                  <Plus className="h-4 w-4" style={{ color: "#FF5800" }} />
                </BrandButton>
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
                <BrandButton
                  type="button"
                  variant="icon-primary"
                  size="icon"
                  onClick={() => addTag("postExamples")}
                >
                  <Plus className="h-4 w-4" style={{ color: "#FF5800" }} />
                </BrandButton>
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
          </BrandTabsContent>

          {/* Style Tab */}
          <BrandTabsContent value="style" className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="style-all" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
              <label htmlFor="style-chat" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
              <label htmlFor="style-post" className="text-xs font-medium text-white/70 uppercase tracking-wide">
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
          </BrandTabsContent>

          {/* Advanced Tab */}
          <BrandTabsContent value="advanced" className="space-y-4">
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
                <BrandButton
                  type="button"
                  variant="icon-primary"
                  size="icon"
                  onClick={() => addTag("plugins")}
                >
                  <Plus className="h-4 w-4" style={{ color: "#FF5800" }} />
                </BrandButton>
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
                Additional settings like <code className="text-[#FF5800]">knowledge</code>,{" "}
                <code className="text-[#FF5800]">settings</code>, and <code className="text-[#FF5800]">messageExamples</code> can be
                configured directly in the JSON editor.
              </p>
            </div>
          </BrandTabsContent>
        </BrandTabs>
      </div>
    </BrandCard>
  );
}
