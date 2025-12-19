/**
 * Character form component for editing character properties.
 * Supports name, bio, personality, message examples, post examples, style, and avatar management.
 *
 * @param props - Character form configuration
 * @param props.character - Character data to edit
 * @param props.onChange - Callback when character data changes
 */

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Info } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import { AvatarUpload } from "@/components/character-builder/avatar-upload";
import { AvatarGenerator } from "@/components/character-creator/avatar-generator";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
} from "@/components/brand";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface CharacterFormProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
}

type TagType = "postExamples";

interface MessageExample {
  name: string;
  content: { text: string };
}

export function CharacterForm({ character, onChange }: CharacterFormProps) {
  const [newTag, setNewTag] = useState("");
  const [newUserMessage, setNewUserMessage] = useState("");
  const [newAgentMessage, setNewAgentMessage] = useState("");

  const updateField = (field: keyof ElizaCharacter, value: unknown) => {
    onChange({ ...character, [field]: value });
  };

  const addTag = (type: TagType) => {
    if (!newTag.trim()) return;

    const currentValue = character[type];
    const currentArray: string[] = Array.isArray(currentValue)
      ? currentValue.filter((item): item is string => typeof item === "string")
      : [];
    updateField(type, [...currentArray, newTag.trim()]);
    setNewTag("");
  };

  const removeTag = (type: TagType, index: number) => {
    const currentValue = character[type];
    const currentArray: string[] = Array.isArray(currentValue)
      ? currentValue.filter((item): item is string => typeof item === "string")
      : [];
    updateField(
      type,
      currentArray.filter((_, i) => i !== index),
    );
  };

  const addMessageExample = () => {
    if (!newUserMessage.trim() || !newAgentMessage.trim()) return;

    const conversation: MessageExample[] = [
      { name: "user", content: { text: newUserMessage.trim() } },
      {
        name: character.name || "agent",
        content: { text: newAgentMessage.trim() },
      },
    ];

    const currentExamples = character.messageExamples || [];
    updateField("messageExamples", [...currentExamples, conversation]);
    setNewUserMessage("");
    setNewAgentMessage("");
  };

  const removeMessageExample = (index: number) => {
    const currentExamples = character.messageExamples || [];
    updateField(
      "messageExamples",
      currentExamples.filter((_, i) => i !== index),
    );
  };

  const bioText =
    typeof character.bio === "string"
      ? character.bio
      : character.bio?.join("\n\n") || "";

  return (
    <BrandCard className="relative h-full overflow-auto" corners={false}>
      <div className="relative z-10 space-y-6">
        <h3 className="text-lg font-bold text-white">Agent Details</h3>

        <BrandTabs
          id="character-form-tabs"
          defaultValue="basics"
          className="w-full"
        >
          <BrandTabsList className="grid w-full grid-cols-4">
            <BrandTabsTrigger value="basics" className="flex-1">
              Basics
            </BrandTabsTrigger>
            <BrandTabsTrigger value="avatar" className="flex-1">
              Avatar
            </BrandTabsTrigger>
            <BrandTabsTrigger value="personality" className="flex-1">
              Personality
            </BrandTabsTrigger>
            <BrandTabsTrigger value="style" className="flex-1">
              Style
            </BrandTabsTrigger>
          </BrandTabsList>

          {/* Basics Tab */}
          <BrandTabsContent value="basics" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                  placeholder="Agent name"
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
                placeholder="Describe the agent's background and purpose..."
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
          </BrandTabsContent>

          {/* Avatar Tab */}
          <BrandTabsContent value="avatar" className="space-y-4">
            {/* Avatar Generator - Quick styles and AI generation */}
            <AvatarGenerator
              characterName={character.name || "Character"}
              characterDescription={
                typeof character.bio === "string"
                  ? character.bio
                  : character.bio?.join(" ") || ""
              }
              currentAvatarUrl={character.avatarUrl || character.avatar_url}
              onAvatarChange={(url) => updateField("avatarUrl", url)}
            />

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-white/40">or upload custom</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Manual Upload */}
            <div className="flex flex-col items-center space-y-2">
              <AvatarUpload
                value={character.avatarUrl || character.avatar_url}
                onChange={(url) => updateField("avatarUrl", url)}
                name={character.name || "Character"}
                size="md"
              />
              <p className="text-xs text-white/40 text-center">
                Upload a custom image (max 5MB)
              </p>
            </div>
          </BrandTabsContent>

          {/* Personality Tab */}
          <BrandTabsContent value="personality" className="space-y-4">
            {/* Message Examples */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                  Conversation Examples
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Teach your agent's conversation style
                    </p>
                    <p className="text-white/70">
                      Add realistic user-agent exchanges that demonstrate tone,
                      vocabulary, and response patterns. Example: User: "How are
                      you?" → Agent: "I'm doing great, thanks for asking!"
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Add new conversation example */}
              <div className="space-y-2">
                <Input
                  value={newUserMessage}
                  onChange={(e) => setNewUserMessage(e.target.value)}
                  placeholder="User says..."
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <Textarea
                  value={newAgentMessage}
                  onChange={(e) => setNewAgentMessage(e.target.value)}
                  placeholder="Agent responds..."
                  className="min-h-[60px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <BrandButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMessageExample}
                  disabled={!newUserMessage.trim() || !newAgentMessage.trim()}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Example
                </BrandButton>
              </div>

              {/* Existing conversation examples */}
              {character.messageExamples &&
                character.messageExamples.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {character.messageExamples.map((conversation, index) => (
                      <div
                        key={index}
                        className="rounded-none bg-black/20 border border-white/10 p-2"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-xs text-white/40">
                            #{index + 1}
                          </span>
                          <button
                            onClick={() => removeMessageExample(index)}
                            className="hover:text-rose-400 transition-colors"
                          >
                            <X className="h-3.5 w-3.5 text-white/50" />
                          </button>
                        </div>
                        <div className="space-y-1">
                          {conversation.map((message, msgIndex) => (
                            <div key={msgIndex} className="flex gap-2 text-sm">
                              <span className="text-[#FF5800] shrink-0">
                                {message.name === "user" ||
                                message.name === "{{user1}}"
                                  ? "U:"
                                  : "A:"}
                              </span>
                              <span className="text-white/80">
                                {message.content.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Post Examples */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                  Post Examples
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Sample social media posts
                    </p>
                    <p className="text-white/70">
                      Add examples of posts your agent might create on social
                      platforms like Twitter/X. Example: "Just shipped a new
                      feature! 🚀 Check it out at example.com"
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
              <div className="flex items-center gap-2">
                <label
                  htmlFor="style-all"
                  className="text-xs font-medium text-white/70 uppercase tracking-wide"
                >
                  General Style Guidelines
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Universal style rules for all contexts
                    </p>
                    <p className="text-white/70">
                      Define overarching style rules that apply everywhere
                      (chats AND posts). Example: "Always use lowercase", "Be
                      enthusiastic and friendly", "Avoid formal language"
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
              <div className="flex items-center gap-2">
                <label
                  htmlFor="style-chat"
                  className="text-xs font-medium text-white/70 uppercase tracking-wide"
                >
                  Chat Style Guidelines
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Style rules for conversations
                    </p>
                    <p className="text-white/70">
                      Define how your agent behaves in one-on-one conversations
                      and direct messages. Example: "Keep responses concise",
                      "Ask follow-up questions", "Use emojis sparingly"
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
              <div className="flex items-center gap-2">
                <label
                  htmlFor="style-post"
                  className="text-xs font-medium text-white/70 uppercase tracking-wide"
                >
                  Post Style Guidelines
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Style rules for social media posts
                    </p>
                    <p className="text-white/70">
                      Define how your agent creates public posts on platforms
                      like Twitter/X. Example: "Always include a
                      call-to-action", "Use trending hashtags", "Keep posts
                      under 280 characters"
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
        </BrandTabs>
      </div>
    </BrandCard>
  );
}
