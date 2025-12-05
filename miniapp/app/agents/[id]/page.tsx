"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Loader2,
  MessageSquare,
  Save,
  Settings2,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { type AgentDetails, getAgent, updateAgent } from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

type EditMode = "simple" | "advanced";

export default function AgentDetailPage() {
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

  // Form state - advanced mode
  const [topics, setTopics] = useState("");
  const [adjectives, setAdjectives] = useState("");
  const [styleAll, setStyleAll] = useState("");
  const [styleChat, setStyleChat] = useState("");

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
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (authenticated && agentId) {
      fetchAgent();
    }
  }, [authenticated, agentId, fetchAgent]);

  // Save agent
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      const updateData: Parameters<typeof updateAgent>[1] = {
        name,
        bio: bio.includes("\n") ? bio.split("\n").filter(Boolean) : bio,
        avatarUrl: avatarUrl || null,
      };

      // Include advanced fields if in advanced mode
      if (mode === "advanced") {
        updateData.topics = topics.split(",").map((t) => t.trim()).filter(Boolean);
        updateData.adjectives = adjectives.split(",").map((a) => a.trim()).filter(Boolean);
        updateData.style = {
          all: styleAll.split("\n").filter(Boolean),
          chat: styleChat.split("\n").filter(Boolean),
        };
      }

      const updated = await updateAgent(agentId, updateData);
      setAgent({ ...agent!, ...updated });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <Link
          href="/chats"
          className="mt-4 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to characters
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back button */}
      <Link
        href="/chats"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to characters
      </Link>

      {/* Hero section with avatar */}
      <div className="mb-8 flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
        {/* Large avatar */}
        <div className="relative mb-4 h-32 w-32 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 sm:mb-0 sm:mr-6">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Bot className="h-16 w-16 text-pink-400" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{agent?.name}</h1>
          <p className="mt-1 line-clamp-2 text-sm text-white/60">
            {Array.isArray(agent?.bio) ? agent.bio[0] : agent?.bio}
          </p>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Link
              href={`/chats/${agentId}`}
              className="flex items-center gap-2 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat Now</span>
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
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
      </div>

      {/* Success message */}
      {success && (
        <div className="mb-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-400">
          Changes saved successfully!
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setMode("simple")}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "simple"
              ? "bg-pink-500 text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Simple
        </button>
        <button
          onClick={() => setMode("advanced")}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "advanced"
              ? "bg-pink-500 text-white"
              : "text-white/60 hover:text-white"
          }`}
        >
          <Settings2 className="h-4 w-4" />
          Advanced
        </button>
      </div>

      {/* Form */}
      <div className="space-y-6 rounded-xl border border-white/10 bg-white/[0.02] p-6">
        {/* Avatar URL */}
        <div>
          <label className="block text-sm font-medium text-white/80">
            Avatar URL
          </label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
          />
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-white/80">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-white/80">
            Bio / Description
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Describe your character's personality and background..."
            rows={4}
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-white/40">
            Use multiple lines for separate bio paragraphs
          </p>
        </div>

        {/* Advanced fields */}
        {mode === "advanced" && (
          <>
            {/* Topics */}
            <div>
              <label className="block text-sm font-medium text-white/80">
                Topics
              </label>
              <input
                type="text"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="technology, music, travel..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-white/40">
                Comma-separated list of topics the character knows about
              </p>
            </div>

            {/* Adjectives */}
            <div>
              <label className="block text-sm font-medium text-white/80">
                Personality Traits
              </label>
              <input
                type="text"
                value={adjectives}
                onChange={(e) => setAdjectives(e.target.value)}
                placeholder="friendly, witty, helpful..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-white/40">
                Comma-separated list of personality traits
              </p>
            </div>

            {/* Style - All */}
            <div>
              <label className="block text-sm font-medium text-white/80">
                Response Style (All)
              </label>
              <textarea
                value={styleAll}
                onChange={(e) => setStyleAll(e.target.value)}
                placeholder="Keep responses concise&#10;Use casual language&#10;Be helpful and friendly"
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-white/40">
                One style directive per line (applies to all responses)
              </p>
            </div>

            {/* Style - Chat */}
            <div>
              <label className="block text-sm font-medium text-white/80">
                Chat Style
              </label>
              <textarea
                value={styleChat}
                onChange={(e) => setStyleChat(e.target.value)}
                placeholder="Use emojis sparingly&#10;Ask follow-up questions&#10;Show empathy"
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-white/40">
                One style directive per line (applies to chat conversations)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
