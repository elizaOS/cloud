"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { type AgentDetails, getAgent, updateAgent } from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

type EditMode = "simple" | "advanced";

interface MessageExample {
  user: string;
  agent: string;
}

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

  // Image handling state (like character creator)
  const [imageTab, setImageTab] = useState<"generate" | "upload">("generate");
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isEditingImagePrompt, setIsEditingImagePrompt] = useState(true);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [generatingField, setGeneratingField] = useState<string | null>(null);

  // Form state - advanced mode
  const [topics, setTopics] = useState("");
  const [adjectives, setAdjectives] = useState("");
  const [styleAll, setStyleAll] = useState("");
  const [styleChat, setStyleChat] = useState("");
  const [messageExamples, setMessageExamples] = useState<MessageExample[]>([]);

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

      // Initialize message examples
      if (data.messageExamples && Array.isArray(data.messageExamples)) {
        const examples: MessageExample[] = [];
        for (const example of data.messageExamples) {
          if (Array.isArray(example) && example.length >= 2) {
            const userMsg = example.find((m: { user?: string }) => m.user);
            const agentMsg = example.find((m: { user?: string }) => !m.user);
            if (userMsg && agentMsg) {
              examples.push({
                user: typeof userMsg.content === "string" ? userMsg.content : userMsg.content?.text || "",
                agent: typeof agentMsg.content === "string" ? agentMsg.content : agentMsg.content?.text || "",
              });
            }
          }
        }
        setMessageExamples(examples);
      }

      // If there's an existing avatar, show it in the generated image area
      if (data.avatarUrl) {
        setGeneratedImageUrl(data.avatarUrl);
        setIsEditingImagePrompt(false);
      }
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

  // Handle photo upload
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
      setGeneratedImageUrl(null);
    }
  };

  // Generate field (name, bio)
  const handleGenerateField = async (fieldName: "name" | "personality") => {
    if (generatingField || isGeneratingImage) return;

    setGeneratingField(fieldName);
    setError(null);
    try {
      const response = await fetch("/api/generate-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName,
          currentValue: fieldName === "name" ? name : bio,
          context: { name, personality: bio, backstory: "" },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to generate" }));
        throw new Error(errorData.error || "Failed to generate");
      }

      const result = await response.json();
      if (result.success && result.value) {
        if (fieldName === "name") {
          setName(result.value);
        } else {
          setBio(result.value);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGeneratingField(null);
    }
  };

  // Generate image prompt
  const handleGeneratePrompt = async () => {
    if (isGeneratingPrompt || generatingField || isGeneratingImage) return;

    setIsGeneratingPrompt(true);
    setError(null);
    try {
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
        const errorData = await response.json().catch(() => ({ error: "Failed to generate" }));
        throw new Error(errorData.error || "Failed to generate");
      }

      const result = await response.json();
      if (result.success && result.value) {
        setImagePrompt(result.value);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate prompt");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Generate image
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage || generatingField) return;

    setIsGeneratingImage(true);
    setGeneratedImageUrl(null);
    setError(null);

    try {
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
        const errorData = await response.json().catch(() => ({ error: "Failed to generate image" }));
        throw new Error(errorData.error || "Failed to generate image");
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
              try {
                const data = JSON.parse(line.slice(6));
                if ((data.type === "image" || data.type === "complete") && data.imageUrl) {
                  setGeneratedImageUrl(data.imageUrl);
                  setIsEditingImagePrompt(false);
                  setPhoto(null);
                } else if (data.type === "error") {
                  throw new Error(data.error || "Generation failed");
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Add message example
  const addMessageExample = () => {
    setMessageExamples([...messageExamples, { user: "", agent: "" }]);
  };

  // Update message example
  const updateMessageExample = (index: number, field: "user" | "agent", value: string) => {
    const updated = [...messageExamples];
    updated[index][field] = value;
    setMessageExamples(updated);
  };

  // Remove message example
  const removeMessageExample = (index: number) => {
    setMessageExamples(messageExamples.filter((_, i) => i !== index));
  };

  // Save agent
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      let finalAvatarUrl = avatarUrl;

      // Upload new image if needed
      if (photo || (generatedImageUrl && generatedImageUrl !== agent?.avatarUrl)) {
        let imageToUpload: File | null = photo;

        if (!imageToUpload && generatedImageUrl) {
          try {
            const response = await fetch(generatedImageUrl);
            const blob = await response.blob();
            imageToUpload = new File([blob], `avatar-${Date.now()}.png`, { type: blob.type || "image/png" });
          } catch {
            // Keep existing URL if fetch fails
          }
        }

        if (imageToUpload) {
          const formData = new FormData();
          formData.append("images", imageToUpload);

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
      }

      const updateData: Parameters<typeof updateAgent>[1] = {
        name,
        bio: bio.includes("\n") ? bio.split("\n").filter(Boolean) : bio,
        avatarUrl: finalAvatarUrl || null,
      };

      // Include advanced fields if in advanced mode
      if (mode === "advanced") {
        updateData.topics = topics.split(",").map((t) => t.trim()).filter(Boolean);
        updateData.adjectives = adjectives.split(",").map((a) => a.trim()).filter(Boolean);
        updateData.style = {
          all: styleAll.split("\n").filter(Boolean),
          chat: styleChat.split("\n").filter(Boolean),
        };

        // Format message examples
        if (messageExamples.length > 0) {
          updateData.messageExamples = messageExamples
            .filter((ex) => ex.user.trim() && ex.agent.trim())
            .map((ex) => [
              { user: "user", content: { text: ex.user.trim() } },
              { user: name, content: { text: ex.agent.trim() } },
            ]);
        }
      }

      const updated = await updateAgent(agentId, updateData);
      setAgent({ ...agent!, ...updated });
      setAvatarUrl(finalAvatarUrl || "");
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
          Back to friends
        </Link>
      </div>
    );
  }

  // Get current display image
  const displayImage = photo ? URL.createObjectURL(photo) : generatedImageUrl || avatarUrl;

  return (
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
        {/* Large avatar */}
        <div className="relative mb-4 h-32 w-32 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 sm:mb-0 sm:mr-6">
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
              <Bot className="h-16 w-16 text-pink-400" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{agent?.name}</h1>
          <p className="mt-1 line-clamp-2 text-sm text-white/60">
            {Array.isArray(agent?.bio) ? agent.bio[0] : agent?.bio}
          </p>

          {/* Chat button */}
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Link
              href={`/chats/${agentId}`}
              className="flex items-center gap-2 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-600"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat Now</span>
            </Link>
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
        {/* Name */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-white/80">Name</label>
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
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
          />
        </div>

        {/* Bio / Personality */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-white/80">
              Personality
            </label>
            <button
              type="button"
              onClick={() => handleGenerateField("personality")}
              disabled={generatingField !== null || isGeneratingImage}
              className="flex items-center justify-center hover:opacity-70 transition-opacity disabled:opacity-50"
            >
              {generatingField === "personality" ? (
                <Loader2 className="size-4 text-white/70 animate-spin" />
              ) : (
                <Sparkles className="size-4 text-white/70" />
              )}
            </button>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Describe your character's personality and background..."
            rows={4}
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
          />
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
                  ? "text-white border-b-2 border-pink-500"
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
                  ? "text-white border-b-2 border-pink-500"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              Upload
            </button>
          </div>

          <div className="h-44">
            {imageTab === "generate" ? (
              (generatedImageUrl || avatarUrl) && !isEditingImagePrompt ? (
                  <div className="w-full h-full max-w-44 mx-auto">
                    <div className="h-full rounded-lg border border-white/10 overflow-hidden relative">
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
                  <div className="h-full flex flex-col">
                    <div className="flex-1 flex flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-white/80">
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
                        value={imagePrompt}
                        onChange={(e) => setImagePrompt(e.target.value)}
                        placeholder="Describe the image you want to generate..."
                        className="flex-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none resize-none"
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
            ) : (
              photo ? (
                  <div className="w-full h-full max-w-44 mx-auto">
                    <div className="h-full rounded-lg border border-white/10 overflow-hidden relative">
                      <Image
                        src={URL.createObjectURL(photo)}
                        alt="Preview"
                        width={176}
                        height={176}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => setPhoto(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="avatar-upload"
                    className="w-full h-full max-w-44 mx-auto flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-white/[0.02] transition-all hover:border-white/20 hover:bg-white/[0.04]"
                  >
                    <Upload className="mb-1 size-8 text-white/30" />
                    <p className="text-sm text-white/50 text-center px-4">
                      Click to upload
                    </p>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>
                )
            )}
          </div>
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

            {/* Message Examples */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-white/80">
                  Message Examples
                </label>
                <button
                  type="button"
                  onClick={addMessageExample}
                  className="flex items-center gap-1 text-xs text-pink-400 hover:text-pink-300"
                >
                  <Plus className="h-3 w-3" />
                  Add Example
                </button>
              </div>
              <p className="mt-1 text-xs text-white/40">
                Example conversations to help the AI understand how to respond
              </p>

              {messageExamples.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-white/10 p-4 text-center">
                  <p className="text-sm text-white/40">No message examples yet</p>
                  <button
                    type="button"
                    onClick={addMessageExample}
                    className="mt-2 text-sm text-pink-400 hover:text-pink-300"
                  >
                    Add your first example
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  {messageExamples.map((example, index) => (
                    <div
                      key={index}
                      className="relative rounded-lg border border-white/10 bg-white/[0.02] p-4"
                    >
                      <button
                        type="button"
                        onClick={() => removeMessageExample(index)}
                        className="absolute right-2 top-2 p-1 text-white/40 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-white/60">
                            User says:
                          </label>
                          <input
                            type="text"
                            value={example.user}
                            onChange={(e) => updateMessageExample(index, "user", e.target.value)}
                            placeholder="What the user might say..."
                            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/60">
                            {name || "Character"} responds:
                          </label>
                          <textarea
                            value={example.agent}
                            onChange={(e) => updateMessageExample(index, "agent", e.target.value)}
                            placeholder="How the character should respond..."
                            rows={2}
                            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-pink-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Save Changes Button - at bottom of form */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-pink-600 disabled:opacity-50"
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
  );
}
