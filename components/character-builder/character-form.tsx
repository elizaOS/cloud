"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Plus,
  User,
  Sparkles,
  Brain,
  MessageSquare,
  Mic,
  Hash,
  Fingerprint,
  BookOpen,
} from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AvatarUpload } from "./avatar-upload";
import { MessageExamplesEditor } from "./message-examples-editor";
import { VoiceSettingsEditor } from "./voice-settings-editor";
import { FieldLabel } from "./field-label";

interface CharacterFormProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
}

type TagType = "topics" | "adjectives" | "postExamples";
type SubTab = "profile" | "personality" | "directives" | "training" | "voice";

export function CharacterForm({
  character,
  onChange,
}: CharacterFormProps) {
  const [newTag, setNewTag] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("profile");

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

  const TabButton = ({
    id,
    icon: Icon,
    label,
  }: {
    id: SubTab;
    icon: React.ElementType;
    label: string;
  }) => (
    <button
      onClick={() => setActiveSubTab(id)}
      className={cn(
        "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap",
        activeSubTab === id
          ? "text-[#FF5800] border-[#FF5800]"
          : "text-white/40 border-transparent hover:text-white hover:border-white/10"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-black/20">
      {/* Sub Navigation */}
      <div className="flex-shrink-0 border-b border-white/10 bg-black/40 px-6 overflow-x-auto no-scrollbar">
        <div className="flex gap-2">
          <TabButton id="profile" icon={User} label="Profile" />
          <TabButton id="personality" icon={Fingerprint} label="Personality" />
          <TabButton id="directives" icon={Brain} label="Directives" />
          <TabButton id="training" icon={MessageSquare} label="Training" />
          <TabButton id="voice" icon={Mic} label="Voice" />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        
        {/* PROFILE TAB: name, username, bio, avatarUrl */}
        {activeSubTab === "profile" && (
          <div className="max-w-2xl mx-auto">
            {/* Hero Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF5800]/20 via-purple-500/10 to-blue-500/10 p-8 mb-8">
              {/* Decorative Elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF5800]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              
              <div className="relative flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="mb-2">
                  <AvatarUpload
                    value={character.avatarUrl}
                    onChange={(url) => updateField("avatarUrl", url)}
                    name={character.name}
                    size="lg"
                  />
                </div>
                <code className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-white/40 font-mono mb-4">
                  avatarUrl
                </code>

                {/* Name Display */}
                <h2 className="text-3xl font-bold text-white mb-1">
                  {character.name || (
                    <span className="text-white/30 italic">Your Agent</span>
                  )}
                </h2>
                <p className="text-[#FF5800] font-medium">
                  {character.username ? `@${character.username.replace('@', '')}` : (
                    <span className="text-white/30">@username</span>
                  )}
                </p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label="Name" jsonKey="name" />
                  <Input
                    value={character.name || ""}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Luna, Max, Aria..."
                    className="h-12 bg-white/5 border-white/10 rounded-xl text-white placeholder:text-white/30 focus:border-[#FF5800] focus:ring-[#FF5800]/20"
                  />
                </div>
                <div>
                  <FieldLabel label="Handle" jsonKey="username" />
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">@</span>
                    <Input
                      value={character.username?.replace('@', '') || ""}
                      onChange={(e) => updateField("username", e.target.value)}
                      placeholder="luna_ai"
                      className="h-12 pl-8 bg-white/5 border-white/10 rounded-xl text-white placeholder:text-white/30 focus:border-[#FF5800] focus:ring-[#FF5800]/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel 
                  label="Backstory" 
                  jsonKey="bio" 
                  tooltip="Tell their origin story. Why do they act this way? What made them who they are?"
                />
                <Textarea
                  value={bioText}
                  onChange={(e) => updateField("bio", e.target.value)}
                  placeholder="Born in Tokyo, raised on the internet. They've seen everything and are ready to share their wisdom..."
                  className="min-h-[160px] bg-white/5 border-white/10 rounded-xl text-white placeholder:text-white/30 focus:border-[#FF5800] focus:ring-[#FF5800]/20 leading-relaxed resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* PERSONALITY TAB: adjectives, topics */}
        {activeSubTab === "personality" && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="bg-gradient-to-br from-[#FF5800]/10 to-amber-500/5 border border-white/10 p-6 rounded-xl">
              <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#FF5800]" />
                The Vibe
              </h3>
              <p className="text-sm text-white/60">
                Define their personality traits and interests. This helps the AI improvise 
                conversations that feel authentic to them.
              </p>
            </div>

            {/* Adjectives */}
            <div className="space-y-4">
              <FieldLabel 
                label="Traits" 
                jsonKey="adjectives" 
                tooltip="Personality descriptors like 'sarcastic', 'warm', 'INTJ'. One is randomly selected each response for variety."
              />
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="e.g. Sarcastic, INTJ, Chaotic..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("adjectives");
                    }
                  }}
                  className="h-11 bg-white/5 border-white/10 rounded-xl focus:border-[#FF5800]"
                />
                <button
                  onClick={() => addTag("adjectives")}
                  className="px-4 bg-[#FF5800] hover:bg-[#FF5800]/80 text-white transition-colors rounded-xl"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[80px] content-start bg-black/20 p-4 border border-white/5 rounded-xl">
                {(!character.adjectives || character.adjectives.length === 0) && (
                  <span className="text-sm text-white/20 italic">No traits added yet</span>
                )}
                {character.adjectives?.map((adj, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1.5 bg-[#FF5800]/15 text-[#FF5800] px-3 py-1.5 text-sm rounded-lg border border-[#FF5800]/30"
                  >
                    {adj}
                    <button
                      onClick={() => removeTag("adjectives", index)}
                      className="hover:text-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Topics */}
            <div className="space-y-4">
              <FieldLabel 
                label="Interests" 
                jsonKey="topics" 
                tooltip="What they love talking about. One is highlighted each response: '[Name] is interested in [topic]'."
              />
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="e.g. Ancient Egypt, Chaos magic..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("topics");
                    }
                  }}
                  className="h-11 bg-white/5 border-white/10 rounded-xl focus:border-[#FF5800]"
                />
                <button
                  onClick={() => addTag("topics")}
                  className="px-4 bg-amber-600 hover:bg-amber-600/80 text-white transition-colors rounded-xl"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[80px] content-start bg-black/20 p-4 border border-white/5 rounded-xl">
                {(!character.topics || character.topics.length === 0) && (
                  <span className="text-sm text-white/20 italic">No topics added yet</span>
                )}
                {character.topics?.map((topic, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1.5 bg-amber-500/15 text-amber-400 px-3 py-1.5 text-sm rounded-lg border border-amber-500/30"
                  >
                    {topic}
                    <button
                      onClick={() => removeTag("topics", index)}
                      className="hover:text-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DIRECTIVES TAB: system, style.all, style.chat */}
        {activeSubTab === "directives" && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* System Prompt */}
            <div className="space-y-3">
              <FieldLabel 
                label="Core Instructions" 
                jsonKey="system" 
                tooltip="The main prompt that defines who they are. Add stakes like 'It is CRITICAL...'"
              />
              <Textarea
                value={character.system || ""}
                onChange={(e) => updateField("system", e.target.value)}
                placeholder="You are [Name]. It is CRITICAL that you..."
                className="min-h-[180px] bg-white/5 border-white/10 rounded-xl focus:border-[#FF5800] text-sm leading-relaxed p-4"
              />
            </div>

            {/* Style Guidelines - Stacked vertically */}
            <div className="space-y-6 pt-6 border-t border-white/10">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-white/40" />
                <h3 className="text-sm font-medium text-white">Style Rules</h3>
                <code className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 font-mono">
                  style
                </code>
              </div>

              <div className="space-y-4">
                <div>
                  <FieldLabel label="General" jsonKey="style.all" />
                  <Textarea
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
                    placeholder="Be direct&#10;No emojis&#10;Avoid flowery language"
                    className="min-h-[100px] bg-white/5 border-white/10 rounded-xl focus:border-[#FF5800] text-sm"
                  />
                </div>
                <div>
                  <FieldLabel label="Chat Only" jsonKey="style.chat" />
                  <Textarea
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
                    placeholder="Ask follow-up questions&#10;Keep responses under 3 paragraphs"
                    className="min-h-[100px] bg-white/5 border-white/10 rounded-xl focus:border-[#FF5800] text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TRAINING TAB: messageExamples, postExamples */}
        {activeSubTab === "training" && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-gradient-to-r from-[#FF5800]/10 to-transparent border-l-4 border-[#FF5800] p-6 rounded-r-xl">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-medium text-white">Show, Don't Tell</h3>
                <code className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-[#FF5800]/80 font-mono">
                  messageExamples
                </code>
              </div>
              <p className="text-sm text-white/70 max-w-2xl">
                The <strong>most effective</strong> way to define voice. Write example conversations 
                exactly how you want them to go.
              </p>
            </div>

            <MessageExamplesEditor
              examples={character.messageExamples}
              onChange={(examples) => updateField("messageExamples", examples)}
              characterName={character.name}
            />

            <div className="space-y-4 pt-8 border-t border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-4 w-4 text-white/40" />
                <h3 className="text-sm font-medium text-white">Social Posts</h3>
                <code className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 font-mono">
                  postExamples
                </code>
              </div>
              
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add an example tweet/post..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("postExamples");
                    }
                  }}
                  className="h-11 bg-white/5 border-white/10 rounded-xl focus:border-[#FF5800]"
                />
                <button
                  onClick={() => addTag("postExamples")}
                  className="px-4 bg-[#FF5800] hover:bg-[#FF5800]/90 text-white transition-colors font-medium rounded-xl"
                >
                  Add
                </button>
              </div>
              
              <div className="space-y-2">
                {(!character.postExamples || character.postExamples.length === 0) && (
                  <div className="text-center py-8 text-white/20 bg-white/5 border border-white/5 border-dashed rounded-xl">
                    No post examples yet
                  </div>
                )}
                {character.postExamples?.map((post, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 bg-white/5 border border-white/10 p-3 rounded-xl group"
                  >
                    <p className="flex-1 text-sm text-white/80 font-mono">{post}</p>
                    <button
                      onClick={() => removeTag("postExamples", index)}
                      className="text-white/20 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VOICE TAB: settings.voice */}
        {activeSubTab === "voice" && (
          <VoiceSettingsEditor 
            character={character} 
            onChange={onChange} 
          />
        )}

      </div>
    </div>
  );
}

