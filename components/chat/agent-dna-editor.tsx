"use client";

import { useState } from "react";
import { CharacterFormClean } from "@/components/chat/character-form-clean";
import { JsonEditor } from "@/components/character-creator/json-editor";
import type { ElizaCharacter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Download, Save, Settings, Zap, BookOpen, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BrandTabsResponsive,
  type TabItem,
} from "@/components/brand/brand-tabs-responsive";

interface AgentDnaEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
  onSave: () => Promise<void>;
}

type MainTab = "settings" | "model-calls" | "memories" | "uploads";
type SettingsSubTab = "general" | "content" | "style" | "avatar";

export function AgentDnaEditor({
  character,
  onChange,
  onSave,
}: AgentDnaEditorProps) {
  const [activeTab, setActiveTab] = useState<MainTab>("settings");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("general");
  const [showJson, setShowJson] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const tabs: TabItem[] = [
    {
      value: "settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
    {
      value: "model-calls",
      label: "Model Calls",
      icon: <Zap className="h-4 w-4" />,
    },
    {
      value: "memories",
      label: "Memories",
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      value: "uploads",
      label: "Uploads",
      icon: <Upload className="h-4 w-4" />,
    },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const jsonText = JSON.stringify(character, null, 2);
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${character.name || "character"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-black/40">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Agent DNA</h2>
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={handleExport}
              className="rounded-none bg-transparent text-white hover:bg-white/5"
            >
              Export
            </Button>
            <Button
              size="lg"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-none bg-white text-black"
            >

              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-white/60">
          Configure your AI agent&apos;s behaviour and capabilities.
        </p>
      </div>

      {/* Main Tabs */}
      <div className="flex-shrink-0 border-b border-white/10 px-6">
        <div className="py-3">
          <BrandTabsResponsive
            id="agent-dna-tabs"
            tabs={tabs}
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as MainTab)}
            breakpoint="md"
          >
            {/* Empty children - content is rendered below */}
            <div className="hidden" />
          </BrandTabsResponsive>
        </div>
      </div>

      {/* Settings Sub-Tabs + JSON Toggle */}
      {activeTab === "settings" && (
        <div className="flex-shrink-0 border-b border-white/10 px-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={() => setSettingsSubTab("general")}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-colors",
                  settingsSubTab === "general"
                    ? "text-white border-b-2 border-white"
                    : "text-white/60 hover:text-white",
                )}
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontSize: "14px",
                  lineHeight: "18px",
                }}
              >
                General
              </button>
              <button
                onClick={() => setSettingsSubTab("content")}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-colors",
                  settingsSubTab === "content"
                    ? "text-white border-b-2 border-white"
                    : "text-white/60 hover:text-white",
                )}
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontSize: "14px",
                  lineHeight: "18px",
                }}
              >
                Content
              </button>
              <button
                onClick={() => setSettingsSubTab("style")}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-colors",
                  settingsSubTab === "style"
                    ? "text-white border-b-2 border-white"
                    : "text-white/60 hover:text-white",
                )}
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontSize: "14px",
                  lineHeight: "18px",
                }}
              >
                Style
              </button>
              <button
                onClick={() => setSettingsSubTab("avatar")}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-colors",
                  settingsSubTab === "avatar"
                    ? "text-white border-b-2 border-white"
                    : "text-white/60 hover:text-white",
                )}
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontSize: "14px",
                  lineHeight: "18px",
                }}
              >
                Avatar
              </button>
            </div>

            {/* JSON Toggle Switch */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-white/60">JSON</span>
              <button
                onClick={() => setShowJson(!showJson)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  showJson ? "bg-[#FF5800]" : "bg-white/20",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                    showJson ? "translate-x-5" : "translate-x-1",
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Full Height */}
      <div className="flex-1 overflow-hidden">
        {showJson ? (
          <JsonEditor
            character={character}
            onChange={onChange}
            onSave={onSave}
            hideActions={true}
          />
        ) : (
          <>
            {activeTab === "settings" && (
              <CharacterFormClean
                character={character}
                onChange={onChange}
                activeSubTab={settingsSubTab}
              />
            )}
            {activeTab === "model-calls" && (
              <div className="flex h-full flex-col overflow-y-auto p-6">
                <div className="space-y-6 max-w-2xl">
                  {/* Model Settings Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">
                        Model Configuration
                      </h3>
                      <p className="text-sm text-white/60">
                        Configure default model parameters for this agent
                      </p>
                    </div>

                    {/* Temperature */}
                    <div className="space-y-2">
                      <label
                        htmlFor="temperature"
                        className="text-xs font-medium text-white/70 uppercase tracking-wide"
                      >
                        Temperature
                      </label>
                      <input
                        id="temperature"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={
                          typeof character.settings?.temperature === "number"
                            ? character.settings.temperature
                            : 0.7
                        }
                        onChange={(e) =>
                          onChange({
                            ...character,
                            settings: {
                              ...character.settings,
                              temperature: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                      />
                      <p className="text-xs text-white/50">
                        Controls randomness: 0 = focused, 2 = creative (default: 0.7)
                      </p>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-2">
                      <label
                        htmlFor="max-tokens"
                        className="text-xs font-medium text-white/70 uppercase tracking-wide"
                      >
                        Max Tokens
                      </label>
                      <input
                        id="max-tokens"
                        type="number"
                        min="1"
                        max="32000"
                        step="1"
                        value={
                          typeof character.settings?.maxTokens === "number"
                            ? character.settings.maxTokens
                            : 2000
                        }
                        onChange={(e) =>
                          onChange({
                            ...character,
                            settings: {
                              ...character.settings,
                              maxTokens: parseInt(e.target.value, 10),
                            },
                          })
                        }
                        className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                      />
                      <p className="text-xs text-white/50">
                        Maximum length of generated responses (default: 2000)
                      </p>
                    </div>

                    {/* Top P */}
                    <div className="space-y-2">
                      <label
                        htmlFor="top-p"
                        className="text-xs font-medium text-white/70 uppercase tracking-wide"
                      >
                        Top P
                      </label>
                      <input
                        id="top-p"
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={
                          typeof character.settings?.topP === "number"
                            ? character.settings.topP
                            : 0.9
                        }
                        onChange={(e) =>
                          onChange({
                            ...character,
                            settings: {
                              ...character.settings,
                              topP: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                      />
                      <p className="text-xs text-white/50">
                        Nucleus sampling: considers top tokens (default: 0.9)
                      </p>
                    </div>

                    {/* Frequency Penalty */}
                    <div className="space-y-2">
                      <label
                        htmlFor="frequency-penalty"
                        className="text-xs font-medium text-white/70 uppercase tracking-wide"
                      >
                        Frequency Penalty
                      </label>
                      <input
                        id="frequency-penalty"
                        type="number"
                        min="-2"
                        max="2"
                        step="0.1"
                        value={
                          typeof character.settings?.frequencyPenalty === "number"
                            ? character.settings.frequencyPenalty
                            : 0
                        }
                        onChange={(e) =>
                          onChange({
                            ...character,
                            settings: {
                              ...character.settings,
                              frequencyPenalty: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                      />
                      <p className="text-xs text-white/50">
                        Reduces repetition of frequent tokens (default: 0)
                      </p>
                    </div>

                    {/* Presence Penalty */}
                    <div className="space-y-2">
                      <label
                        htmlFor="presence-penalty"
                        className="text-xs font-medium text-white/70 uppercase tracking-wide"
                      >
                        Presence Penalty
                      </label>
                      <input
                        id="presence-penalty"
                        type="number"
                        min="-2"
                        max="2"
                        step="0.1"
                        value={
                          typeof character.settings?.presencePenalty === "number"
                            ? character.settings.presencePenalty
                            : 0
                        }
                        onChange={(e) =>
                          onChange({
                            ...character,
                            settings: {
                              ...character.settings,
                              presencePenalty: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                      />
                      <p className="text-xs text-white/50">
                        Encourages new topics (default: 0)
                      </p>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="rounded-none bg-black/40 border border-white/10 p-4">
                    <p className="text-sm text-white/60">
                      These settings control how the AI model generates responses.
                      Adjust them to fine-tune your agent&apos;s behavior. Changes apply
                      to new conversations.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "memories" && (
              <div className="flex h-full flex-col overflow-y-auto p-6">
                <div className="space-y-6 max-w-2xl">
                  {/* Memories Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">
                        Agent Knowledge & Memories
                      </h3>
                      <p className="text-sm text-white/60">
                        Define knowledge sources and long-term memory for your agent
                      </p>
                    </div>

                    {/* Knowledge Section */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                        Knowledge Base
                      </label>
                      <textarea
                        value={
                          Array.isArray(character.knowledge)
                            ? character.knowledge
                              .map((k) =>
                                typeof k === "string" ? k : k.path,
                              )
                              .join("\n")
                            : ""
                        }
                        onChange={(e) => {
                          const lines = e.target.value
                            .split("\n")
                            .filter((l) => l.trim());
                          onChange({
                            ...character,
                            knowledge: lines,
                          });
                        }}
                        placeholder="Add knowledge sources (one per line)..."
                        rows={8}
                        className="w-full rounded-none border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800] font-mono text-sm"
                      />
                      <p className="text-xs text-white/50">
                        Enter file paths, URLs, or text snippets (one per line)
                      </p>
                    </div>

                    {/* Message Examples */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                        Conversation Examples
                      </label>
                      <div className="rounded-none bg-black/40 border border-white/10 p-4">
                        <p className="text-sm text-white/60 mb-2">
                          Message examples help the agent learn conversation patterns.
                        </p>
                        <p className="text-xs text-white/50">
                          {character.messageExamples &&
                            character.messageExamples.length > 0
                            ? `${character.messageExamples.length} conversation example(s) configured`
                            : "No message examples configured yet"}
                        </p>
                      </div>
                      <p className="text-xs text-white/50">
                        Configure detailed message examples in JSON mode
                      </p>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="rounded-none bg-black/40 border border-white/10 p-4">
                    <p className="text-sm text-white/60">
                      Knowledge and memories help your agent provide contextually relevant
                      responses. Knowledge sources can include documentation, FAQs, or any
                      text that should inform the agent&apos;s responses.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "uploads" && (
              <div className="flex h-full flex-col overflow-y-auto p-6">
                <div className="space-y-6 max-w-2xl">
                  {/* Uploads Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">
                        File Uploads & Documents
                      </h3>
                      <p className="text-sm text-white/60">
                        Upload and manage files for your agent&apos;s knowledge base
                      </p>
                    </div>

                    {/* Upload Area */}
                    <div className="rounded-none border-2 border-dashed border-white/20 bg-black/40 p-8 text-center">
                      <Upload className="h-12 w-12 text-white/40 mx-auto mb-4" />
                      <h4 className="text-base font-semibold text-white mb-2">
                        File Upload Coming Soon
                      </h4>
                      <p className="text-sm text-white/60 mb-4">
                        Direct file upload functionality will be available in a future
                        update.
                      </p>
                      <div className="text-xs text-white/50 text-left max-w-md mx-auto space-y-1">
                        <p className="font-medium text-white/70 mb-2">
                          Supported file types (planned):
                        </p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                          <li>Documents: PDF, TXT, MD, DOC, DOCX</li>
                          <li>Data: JSON, CSV, XML</li>
                          <li>Code: JS, TS, PY, and more</li>
                          <li>Maximum file size: 10MB</li>
                        </ul>
                      </div>
                    </div>

                    {/* Current Workaround */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                        Current Workaround
                      </label>
                      <div className="rounded-none bg-black/40 border border-white/10 p-4">
                        <p className="text-sm text-white/60 mb-2">
                          For now, you can add knowledge sources in the{" "}
                          <span className="text-[#FF5800] font-medium">Memories</span>{" "}
                          tab by:
                        </p>
                        <ul className="text-xs text-white/50 space-y-1 list-disc list-inside pl-2">
                          <li>Entering file paths to local documents</li>
                          <li>Adding URLs to online resources</li>
                          <li>Pasting text content directly</li>
                        </ul>
                      </div>
                    </div>

                    {/* Uploaded Files List (Placeholder) */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                        Uploaded Files
                      </label>
                      <div className="rounded-none bg-black/40 border border-white/10 p-6 text-center">
                        <p className="text-sm text-white/60">
                          No files uploaded yet
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="rounded-none bg-black/40 border border-white/10 p-4">
                    <p className="text-sm text-white/60">
                      File uploads will allow you to easily add documents and resources
                      to your agent&apos;s knowledge base. The system will automatically
                      process and index the content for efficient retrieval during
                      conversations.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
