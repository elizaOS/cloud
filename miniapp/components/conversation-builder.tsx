"use client";

import {
  Bot,
  Dices,
  GripVertical,
  Loader2,
  MessageCircle,
  Plus,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useState } from "react";

export interface MessageExample {
  id: string;
  user: string;
  agent: string;
}

interface ConversationBuilderProps {
  examples: MessageExample[];
  characterName: string;
  characterBio: string;
  onChange: (examples: MessageExample[]) => void;
  onGenerateExamples: () => Promise<void>;
  isGenerating: boolean;
}

export function ConversationBuilder({
  examples,
  characterName,
  characterBio,
  onChange,
  onGenerateExamples,
  isGenerating,
}: ConversationBuilderProps) {
  // Suppress unused param warning - kept for future enhancements
  void characterBio;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addExample = () => {
    const newExample: MessageExample = {
      id: `ex-${Date.now()}`,
      user: "",
      agent: "",
    };
    onChange([...examples, newExample]);
    setExpandedId(newExample.id);
  };

  const updateExample = (
    id: string,
    field: "user" | "agent",
    value: string,
  ) => {
    onChange(
      examples.map((ex) => (ex.id === id ? { ...ex, [field]: value } : ex)),
    );
  };

  const removeExample = (id: string) => {
    onChange(examples.filter((ex) => ex.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const moveExample = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= examples.length) return;
    const newExamples = [...examples];
    const [removed] = newExamples.splice(fromIndex, 1);
    newExamples.splice(toIndex, 0, removed);
    onChange(newExamples);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <MessageCircle className="h-4 w-4" />
          Example Conversations
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerateExamples}
            disabled={isGenerating || !characterName}
            className="border-brand/30 bg-brand/10 text-brand hover:bg-brand/20 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Dices className="h-3.5 w-3.5" />
            )}
            Generate Examples
          </button>
          <button
            type="button"
            onClick={addExample}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      {examples.length === 0 ? (
        <div
          onClick={addExample}
          className="cursor-pointer rounded-xl border-2 border-dashed border-white/10 p-8 text-center transition-colors hover:border-white/20"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <MessageCircle className="h-6 w-6 text-white/40" />
          </div>
          <p className="text-sm font-medium text-white/60">No examples yet</p>
          <p className="mt-1 text-xs text-white/40">
            Add conversations to teach your character how to respond
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {examples.map((example, index) => (
            <ConversationCard
              key={example.id}
              example={example}
              index={index}
              characterName={characterName}
              isExpanded={expandedId === example.id}
              onToggle={() =>
                setExpandedId(expandedId === example.id ? null : example.id)
              }
              onUpdate={(field, value) =>
                updateExample(example.id, field, value)
              }
              onRemove={() => removeExample(example.id)}
              onMoveUp={() => moveExample(index, index - 1)}
              onMoveDown={() => moveExample(index, index + 1)}
              canMoveUp={index > 0}
              canMoveDown={index < examples.length - 1}
            />
          ))}
        </div>
      )}

      {examples.length > 0 && examples.length < 5 && (
        <p className="text-center text-xs text-white/40">
          💡 Tip: Add 3-5 examples for best results
        </p>
      )}
    </div>
  );
}

interface ConversationCardProps {
  example: MessageExample;
  index: number;
  characterName: string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (field: "user" | "agent", value: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function ConversationCard({
  example,
  index,
  characterName,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: ConversationCardProps) {
  // Suppress unused param warnings - kept for future drag-to-reorder feature
  void onMoveDown;
  void canMoveDown;
  const hasContent = example.user.trim() || example.agent.trim();
  const preview = example.user
    ? `"${example.user.slice(0, 40)}${example.user.length > 40 ? "..." : ""}"`
    : "Empty example";

  return (
    <div
      className={`rounded-xl border transition-all ${
        isExpanded
          ? "border-brand/30 bg-brand/5"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      {/* Header - always visible */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-center gap-3 p-3"
      >
        <div className="flex items-center gap-1 text-white/30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={!canMoveUp}
            className="p-0.5 hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/60">
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm ${hasContent ? "text-white/80" : "text-white/40 italic"}`}
          >
            {preview}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1.5 text-white/30 transition-colors hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-4 border-t border-white/10 p-4">
          {/* User message */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20">
                <User className="h-3 w-3 text-blue-400" />
              </div>
              User says:
            </div>
            <input
              type="text"
              value={example.user}
              onChange={(e) => onUpdate("user", e.target.value)}
              placeholder="What might a user say?"
              className="focus:border-brand w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
            />
          </div>

          {/* Agent response */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              <div className="bg-brand/20 flex h-5 w-5 items-center justify-center rounded-full">
                <Bot className="text-brand h-3 w-3" />
              </div>
              {characterName || "Character"} responds:
            </div>
            <textarea
              value={example.agent}
              onChange={(e) => onUpdate("agent", e.target.value)}
              placeholder={`How would ${characterName || "your character"} respond?`}
              rows={3}
              className="focus:border-brand w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface CharacterPreviewProps {
  name: string;
  bio: string;
  avatarUrl: string | null;
  examples: MessageExample[];
  adjectives: string[];
}

export function CharacterPreview({
  name,
  bio,
  avatarUrl,
  examples,
  adjectives,
}: CharacterPreviewProps) {
  const [testMessage, setTestMessage] = useState("");
  const [previewResponse, setPreviewResponse] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleTestResponse = async () => {
    if (!testMessage.trim() || !name) return;

    setIsGenerating(true);
    setPreviewResponse(null);

    const response = await fetch("/api/generate-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fieldName: "previewResponse",
        currentValue: testMessage,
        context: {
          name,
          personality: bio,
          adjectives: adjectives.join(", "),
          examples: examples
            .filter((e) => e.user && e.agent)
            .map((e) => `User: ${e.user}\n${name}: ${e.agent}`)
            .join("\n\n"),
        },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.value) {
        setPreviewResponse(result.value);
      }
    }

    setIsGenerating(false);
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
        <Sparkles className="text-brand h-4 w-4" />
        Preview Response
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTestResponse()}
          placeholder="Type a test message..."
          className="focus:border-brand flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleTestResponse}
          disabled={isGenerating || !testMessage.trim() || !name}
          className="bg-brand hover:bg-brand-600 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
        </button>
      </div>

      {previewResponse && (
        <div className="border-brand/20 bg-brand/5 rounded-lg border p-3">
          <div className="flex items-start gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="bg-brand/20 flex h-8 w-8 items-center justify-center rounded-full">
                <Bot className="text-brand h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-brand text-xs font-medium">{name}</p>
              <p className="mt-1 text-sm text-white/80">{previewResponse}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-white/40">
        Test how your character might respond based on current settings
      </p>
    </div>
  );
}
