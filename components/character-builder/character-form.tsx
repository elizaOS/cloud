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

type TagType = "postExamples" | "adjectives" | "topics";

interface MessageExample {
  name: string;
  content: { text: string };
}

export function CharacterForm({ character, onChange }: CharacterFormProps) {
  const [newTag, setNewTag] = useState("");
  const [newAdjective, setNewAdjective] = useState("");
  const [newTopic, setNewTopic] = useState("");
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
            <BrandTabsTrigger value="personality" className="flex-1">
              Personality
            </BrandTabsTrigger>
            <BrandTabsTrigger value="style" className="flex-1">
              Style
            </BrandTabsTrigger>
            <BrandTabsTrigger value="avatar" className="flex-1">
              Avatar
            </BrandTabsTrigger>
          </BrandTabsList>

          {/* Basics Tab */}
          <BrandTabsContent value="basics" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="text-xs font-medium text-white/70"
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
                  className="text-xs font-medium text-white/70"
                >
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 select-none pointer-events-none">
                    @
                  </span>
                  <Input
                    id="username"
                    value={character.username || ""}
                    onChange={(e) =>
                      updateField("username", e.target.value.replace(/^@/, ""))
                    }
                    placeholder="eliza"
                    className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800] pl-7"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="bio"
                className="text-xs font-medium text-white/70"
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
              <div className="flex items-center gap-2">
                <label
                  htmlFor="system"
                  className="text-xs font-medium text-white/70"
                >
                  System Prompt
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Core identity &amp; behavioral directives
                    </p>
                    <p className="text-white/70">
                      The foundational prompt that defines who your agent is and
                      how they should behave. This appears at the top of every
                      conversation and sets the tone for all interactions.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                id="system"
                value={character.system || ""}
                onChange={(e) => updateField("system", e.target.value)}
                placeholder="You are a helpful AI assistant focused on providing accurate information. Always fact-check before responding and cite sources when possible..."
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
          </BrandTabsContent>

          {/* Personality Tab */}
          <BrandTabsContent value="personality" className="space-y-4">
            {/* Adjectives */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-white/70">
                  Personality Traits
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Adjectives that describe your agent
                    </p>
                    <p className="text-white/70">
                      A random trait is selected for each response to add
                      variety and personality. Example: &quot;witty&quot;,
                      &quot;sarcastic&quot;, &quot;thoughtful&quot;,
                      &quot;enthusiastic&quot;
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newAdjective}
                  onChange={(e) => setNewAdjective(e.target.value)}
                  placeholder="witty, sarcastic, thoughtful..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newAdjective.trim()) return;
                      const currentAdjectives = character.adjectives || [];
                      updateField("adjectives", [
                        ...currentAdjectives,
                        newAdjective.trim(),
                      ]);
                      setNewAdjective("");
                    }
                  }}
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <BrandButton
                  type="button"
                  variant="icon-primary"
                  size="icon"
                  onClick={() => {
                    if (!newAdjective.trim()) return;
                    const currentAdjectives = character.adjectives || [];
                    updateField("adjectives", [
                      ...currentAdjectives,
                      newAdjective.trim(),
                    ]);
                    setNewAdjective("");
                  }}
                >
                  <Plus className="h-4 w-4" style={{ color: "#FF5800" }} />
                </BrandButton>
              </div>
              <div className="flex flex-wrap gap-2">
                {character.adjectives?.map((adj, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 rounded-none bg-[#FF5800]/10 border border-[#FF5800]/30 px-2.5 py-1"
                  >
                    <span className="text-sm text-white">{adj}</span>
                    <button
                      onClick={() => {
                        const currentAdjectives = character.adjectives || [];
                        updateField(
                          "adjectives",
                          currentAdjectives.filter((_, i) => i !== index),
                        );
                      }}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-white/70" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Topics */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-white/70">
                  Topics of Interest
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      What your agent loves talking about
                    </p>
                    <p className="text-white/70">
                      Topics add contextual relevance to conversations. A
                      current interest is highlighted per response. Example:
                      &quot;DeFi protocols&quot;, &quot;AI research&quot;,
                      &quot;meme culture&quot;
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="DeFi protocols, AI research, meme culture..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newTopic.trim()) return;
                      const currentTopics = character.topics || [];
                      updateField("topics", [
                        ...currentTopics,
                        newTopic.trim(),
                      ]);
                      setNewTopic("");
                    }
                  }}
                  className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                />
                <BrandButton
                  type="button"
                  variant="icon-primary"
                  size="icon"
                  onClick={() => {
                    if (!newTopic.trim()) return;
                    const currentTopics = character.topics || [];
                    updateField("topics", [...currentTopics, newTopic.trim()]);
                    setNewTopic("");
                  }}
                >
                  <Plus className="h-4 w-4" style={{ color: "#FF5800" }} />
                </BrandButton>
              </div>
              <div className="flex flex-wrap gap-2">
                {character.topics?.map((topic, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 rounded-none bg-[#FF5800]/10 border border-[#FF5800]/30 px-2.5 py-1"
                  >
                    <span className="text-sm text-white">{topic}</span>
                    <button
                      onClick={() => {
                        const currentTopics = character.topics || [];
                        updateField(
                          "topics",
                          currentTopics.filter((_, i) => i !== index),
                        );
                      }}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-white/70" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Message Examples */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-white/70">
                  Conversation Examples
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs bg-black/95 border border-white/10 text-white"
                  >
                    <p className="font-medium mb-1">
                      Teach your agent&apos;s conversation style
                    </p>
                    <p className="text-white/70">
                      Add realistic user-agent exchanges that demonstrate tone,
                      vocabulary, and response patterns. Example: User:
                      &quot;How are you?&quot; → Agent: &quot;I&apos;m doing
                      great, thanks for asking!&quot;
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Add new conversation example */}
              <div className="space-y-2 rounded-none border-b border-white/10 bg-black/20 pb-6">
                <div className="space-y-1">
                  <label className="text-xs text-white/50">User says:</label>
                  <Input
                    value={newUserMessage}
                    onChange={(e) => setNewUserMessage(e.target.value)}
                    placeholder="What's the best way to start learning about crypto?"
                    className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/50">
                    Agent responds:
                  </label>
                  <Textarea
                    value={newAgentMessage}
                    onChange={(e) => setNewAgentMessage(e.target.value)}
                    placeholder="Great question! I'd recommend starting with Bitcoin and Ethereum basics. Understanding blockchain fundamentals is key before diving into specific projects..."
                    className="min-h-[60px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                  />
                </div>
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
                <label className="text-xs font-medium text-white/70">
                  Post Examples
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
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
                      platforms like Twitter/X. Example: &quot;Just shipped a
                      new feature! 🚀 Check it out at example.com&quot;
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Just discovered an amazing DeFi protocol! 🚀 Thread below..."
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
                  className="text-xs font-medium text-white/70"
                >
                  General Style Guidelines
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
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
                      (chats AND posts). Example: &quot;Always use
                      lowercase&quot;, &quot;Be enthusiastic and friendly&quot;,
                      &quot;Avoid formal language&quot;
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
                placeholder={
                  "Be friendly and approachable\nUse clear, simple language\nShow enthusiasm with occasional emojis\nStay professional but conversational"
                }
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="style-chat"
                  className="text-xs font-medium text-white/70"
                >
                  Chat Style Guidelines
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
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
                      and direct messages. Example: &quot;Keep responses
                      concise&quot;, &quot;Ask follow-up questions&quot;,
                      &quot;Use emojis sparingly&quot;
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
                placeholder={
                  "Keep responses concise and focused\nAsk follow-up questions to understand better\nUse examples to explain complex topics\nBe patient and encouraging"
                }
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="style-post"
                  className="text-xs font-medium text-white/70"
                >
                  Post Style Guidelines
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70 transition-colors" />
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
                      like Twitter/X. Example: &quot;Always include a
                      call-to-action&quot;, &quot;Use trending hashtags&quot;,
                      &quot;Keep posts under 280 characters&quot;
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
                placeholder={
                  "Start with an engaging hook\nKeep posts under 280 characters when possible\nInclude relevant hashtags sparingly\nEnd with a call-to-action or question"
                }
                className="min-h-[80px] rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              />
            </div>
          </BrandTabsContent>
        </BrandTabs>
      </div>
    </BrandCard>
  );
}
