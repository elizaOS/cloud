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
              <div className="flex h-full flex-col overflow-y-auto">
                {/* Header with Actions count, Search, and Filter */}
                <div className="flex-shrink-0 border-b border-white/10 px-6 py-6">
                  <div className="flex items-center justify-between gap-4">
                    {/* Actions Label with Count */}
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#ffffff",
                        }}
                      >
                        Actions
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-none bg-white/10"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#a1a1a1",
                        }}
                      >
                        4
                      </span>
                    </div>

                    {/* Search and Filter */}
                    <div className="flex items-center gap-3">
                      {/* Search Input */}
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M14 14L11.1 11.1M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z"
                              stroke="#6B7280"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <input
                          type="text"
                          placeholder="Search actions..."
                          className="h-11 w-64 pl-10 pr-3 rounded-none border border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "14px",
                          }}
                        />
                      </div>

                      {/* All Actions Dropdown */}
                      <button
                        className="h-11 px-4 rounded-none border border-white/10 bg-black/40 text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "14px",
                        }}
                      >
                        <span>All Actions</span>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M4 6L8 10L12 6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Date Separator */}
                <div className="px-6 py-4">
                  <p
                    className="text-center"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "12px",
                      fontWeight: 400,
                      color: "#a1a1a1",
                    }}
                  >
                    11/04/2025
                  </p>
                </div>

                {/* Action Cards List */}
                <div className="flex-1 px-6 pb-6 space-y-0">
                  {/* LLM Action Card */}
                  <div className="border border-white/10 bg-black/20">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-none bg-white/5 flex items-center justify-center">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <path
                              d="M5 7.5H6.5M9.5 7.5H11M6.5 10C6.5 10 7 11 8 11C9 11 9.5 10 9.5 10"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: "#ffffff",
                              }}
                            >
                              LLM
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/10"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              TEXT_LARGE
                            </span>
                          </div>

                          {/* Second Row - Type Badge */}
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4" style={{ color: "#a1a1a1" }} />
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              TEXT_LARGE
                            </span>
                          </div>

                          {/* Timestamp Row */}
                          <div className="flex items-center gap-2">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 4V8L10.5 10.5"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              0s ago
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/5"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              e362f395
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                            stroke="#a1a1a1"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M8 8H8.00667M8 5.33333H8.00667M8 10.6667H8.00667"
                            stroke="#a1a1a1"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "12px",
                            fontWeight: 400,
                            color: "#a1a1a1",
                          }}
                        >
                          Contains parameters and response data
                        </span>
                      </div>
                      <button
                        className="hover:text-white transition-colors"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#a1a1a1",
                        }}
                      >
                        View details
                      </button>
                    </div>
                  </div>

                  {/* Other Action Card */}
                  <div className="border border-white/10 border-t-0 bg-black/20">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-none bg-white/5 flex items-center justify-center">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M2 8H6M10 8H14M8 2L8 6M8 10L8 14"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: "#ffffff",
                              }}
                            >
                              Other
                            </span>
                          </div>

                          {/* Timestamp Row */}
                          <div className="flex items-center gap-2">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 4V8L10.5 10.5"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              0s ago
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/5"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              4bfd09b2
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Embedding Action Card 1 */}
                  <div className="border border-white/10 border-t-0 bg-black/20">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-none bg-white/5 flex items-center justify-center">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="9"
                              y="3"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="3"
                              y="9"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="9"
                              y="9"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: "#ffffff",
                              }}
                            >
                              Embedding
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/10"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              TEXT_EMBEDDING
                            </span>
                          </div>

                          {/* Second Row - Type Badge */}
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4" style={{ color: "#a1a1a1" }} />
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              TEXT_EMBEDDING
                            </span>
                          </div>

                          {/* Timestamp Row */}
                          <div className="flex items-center gap-2">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 4V8L10.5 10.5"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              0s ago
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/5"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              Cf36E0E1
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                            stroke="#a1a1a1"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M8 8H8.00667M8 5.33333H8.00667M8 10.6667H8.00667"
                            stroke="#a1a1a1"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "12px",
                            fontWeight: 400,
                            color: "#a1a1a1",
                          }}
                        >
                          Contains parameters and response data
                        </span>
                      </div>
                      <button
                        className="hover:text-white transition-colors"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#a1a1a1",
                        }}
                      >
                        View details
                      </button>
                    </div>
                  </div>

                  {/* Embedding Action Card 2 */}
                  <div className="border border-white/10 border-t-0 bg-black/20">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-none bg-white/5 flex items-center justify-center">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="9"
                              y="3"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="3"
                              y="9"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <rect
                              x="9"
                              y="9"
                              width="4"
                              height="4"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: "#ffffff",
                              }}
                            >
                              Embedding
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/10"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              TEXT_EMBEDDING
                            </span>
                          </div>

                          {/* Second Row - Type Badge */}
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4" style={{ color: "#a1a1a1" }} />
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              TEXT_EMBEDDING
                            </span>
                          </div>

                          {/* Timestamp Row */}
                          <div className="flex items-center gap-2">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 4V8L10.5 10.5"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              0s ago
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/5"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              Cf36E0E1
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                            stroke="#a1a1a1"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M8 8H8.00667M8 5.33333H8.00667M8 10.6667H8.00667"
                            stroke="#a1a1a1"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "12px",
                            fontWeight: 400,
                            color: "#a1a1a1",
                          }}
                        >
                          Contains parameters and response data
                        </span>
                      </div>
                      <button
                        className="hover:text-white transition-colors"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#a1a1a1",
                        }}
                      >
                        View details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "memories" && (
              <div className="flex h-full flex-col overflow-y-auto">
                {/* Header with Memories count, Search, and Filter */}
                <div className="flex-shrink-0 border-b border-white/10 px-6 py-6">
                  <div className="flex items-center justify-between gap-4">
                    {/* Memories Label with Count */}
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#ffffff",
                        }}
                      >
                        Memories
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-none bg-white/10"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#a1a1a1",
                        }}
                      >
                        2
                      </span>
                    </div>

                    {/* Search and Filter */}
                    <div className="flex items-center gap-3">
                      {/* Search Input */}
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M14 14L11.1 11.1M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z"
                              stroke="#6B7280"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <input
                          type="text"
                          placeholder="Search memories..."
                          className="h-11 w-56 pl-10 pr-3 rounded-none border border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "14px",
                          }}
                        />
                      </div>

                      {/* All Messages Dropdown */}
                      <button
                        className="h-11 px-4 rounded-none border border-white/10 bg-black/40 text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "14px",
                        }}
                      >
                        <span>All Messages</span>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M4 6L8 10L12 6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Date Separator */}
                <div className="px-6 py-4">
                  <p
                    className="text-center"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontSize: "12px",
                      fontWeight: 400,
                      color: "#a1a1a1",
                    }}
                  >
                    11/04/2025
                  </p>
                </div>

                {/* Memory Cards List */}
                <div className="flex-1 px-6 pb-6 space-y-0">
                  {/* Eliza Thought Memory Card */}
                  <div className="border border-white/10 bg-black/20">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-none bg-white/5 flex items-center justify-center">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect
                              x="3"
                              y="3"
                              width="10"
                              height="10"
                              rx="1"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                            />
                            <path
                              d="M6 6H10M6 8H8"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: "#ffffff",
                              }}
                            >
                              Eliza
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/10"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              Thought
                            </span>
                          </div>

                          {/* Timestamp Row */}
                          <div className="flex items-center gap-2 mb-3">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 4V8L10.5 10.5"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              01:57 PM
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/5"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              2ec54b78
                            </span>
                          </div>

                          {/* Message Content */}
                          <div
                            className="mb-3 px-2 py-2 bg-white/5 rounded-none"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "14px",
                              fontWeight: 400,
                              color: "#e5e5e5",
                              lineHeight: "1.5",
                            }}
                          >
                            Hey there! I&apos;m doing great, thanks for asking. How about you?
                          </div>

                          {/* Thought Process Section */}
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <rect
                                  x="2"
                                  y="2"
                                  width="8"
                                  height="8"
                                  rx="1"
                                  stroke="#a1a1a1"
                                  strokeWidth="1.2"
                                />
                              </svg>
                              <span
                                style={{
                                  fontFamily: "var(--font-roboto-mono)",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  color: "#a1a1a1",
                                }}
                              >
                                Thought process
                              </span>
                            </div>
                            <p
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                                lineHeight: "1.5",
                              }}
                            >
                              Engage with the user and ask how they&apos;re doing.
                            </p>
                          </div>

                          {/* Reply Button */}
                          <button
                            className="px-3 py-1.5 rounded-none bg-white/10 hover:bg-white/15 transition-colors"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "#ffffff",
                            }}
                          >
                            REPLY
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* User Memory Card */}
                  <div className="border border-white/10 border-t-0 bg-black/20">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-none bg-white/5 flex items-center justify-center">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M13 14V12.6667C13 11.9594 12.719 11.2811 12.219 10.781C11.7189 10.281 11.0406 10 10.3333 10H5.66667C4.95942 10 4.28115 10.281 3.78105 10.781C3.28095 11.2811 3 11.9594 3 12.6667V14M10.6667 4.66667C10.6667 6.13943 9.47276 7.33333 8 7.33333C6.52724 7.33333 5.33333 6.13943 5.33333 4.66667C5.33333 3.19391 6.52724 2 8 2C9.47276 2 10.6667 3.19391 10.6667 4.66667Z"
                              stroke="#a1a1a1"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: "#ffffff",
                              }}
                            >
                              User
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/10"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              User
                            </span>
                          </div>

                          {/* Timestamp Row */}
                          <div className="flex items-center gap-2 mb-3">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 4V8L10.5 10.5"
                                stroke="#a1a1a1"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "12px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              01:56 PM
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-none bg-white/5"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontSize: "10px",
                                fontWeight: 400,
                                color: "#a1a1a1",
                              }}
                            >
                              3b022fdc
                            </span>
                          </div>

                          {/* Message Content */}
                          <div
                            className="mb-3 px-2 py-2 bg-white/5 rounded-none"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "14px",
                              fontWeight: 400,
                              color: "#e5e5e5",
                              lineHeight: "1.5",
                            }}
                          >
                            Hey there! How are you?
                          </div>

                          {/* Tag */}
                          <div
                            className="inline-block px-2 py-1 rounded-none bg-white/10"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "11px",
                              fontWeight: 400,
                              color: "#a1a1a1",
                            }}
                          >
                            client_chat
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "uploads" && (
              <div className="flex h-full flex-col overflow-y-auto">
                {/* Header with Documents count, Search, and Filter */}
                <div className="flex-shrink-0 border-b border-white/10 px-6 py-6">
                  <div className="flex items-center justify-between gap-4">
                    {/* Documents Label with Count */}
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "14px",
                          fontWeight: 500,
                          lineHeight: "normal",
                          color: "#ffffff",
                        }}
                      >
                        Documents
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-none bg-white/10"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          lineHeight: "normal",
                          color: "#a1a1a1",
                        }}
                      >
                        0
                      </span>
                    </div>

                    {/* Right side: Search and Filter */}
                    <div className="flex items-center gap-2">
                      {/* Search Input */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search documents..."
                          className="w-[200px] h-8 bg-black/40 border border-white/10 rounded-none px-3 text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/20"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontSize: "12px",
                            fontWeight: 400,
                          }}
                        />
                      </div>

                      {/* Filter Dropdown */}
                      <button
                        className="h-8 px-3 bg-black/40 border border-white/10 rounded-none hover:bg-black/60 transition-colors"
                        style={{
                          fontFamily: "var(--font-roboto-mono)",
                          fontSize: "12px",
                          fontWeight: 400,
                          color: "#a1a1a1",
                        }}
                      >
                        All Documents
                      </button>
                    </div>
                  </div>
                </div>

                {/* Upload Section */}
                <div className="flex-1 px-6 py-6">
                  {/* Section Header */}
                  <div className="mb-6">
                    <h3
                      className="mb-1"
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "14px",
                        fontWeight: 500,
                        lineHeight: "normal",
                        color: "#ffffff",
                      }}
                    >
                      Upload documents
                    </h3>
                    <p
                      style={{
                        fontFamily: "var(--font-roboto-mono)",
                        fontSize: "12px",
                        fontWeight: 400,
                        lineHeight: "normal",
                        color: "#a1a1a1",
                      }}
                    >
                      Supported: PDF, TXT, MD, DOC, DOCX, JSON, and code files
                    </p>
                  </div>

                  {/* Upload Cards Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Add Document Card */}
                    <button className="group bg-[#161616] border border-white/10 hover:bg-black/40 transition-colors px-3 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        {/* Plus Circle Icon */}
                        <div className="w-12 h-12 flex items-center justify-center">
                          <svg
                            width="48"
                            height="48"
                            viewBox="0 0 48 48"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle
                              cx="24"
                              cy="24"
                              r="23"
                              stroke="#a1a1a1"
                              strokeWidth="2"
                              className="group-hover:stroke-white/70 transition-colors"
                            />
                            <path
                              d="M24 16V32M16 24H32"
                              stroke="#a1a1a1"
                              strokeWidth="2"
                              strokeLinecap="round"
                              className="group-hover:stroke-white/70 transition-colors"
                            />
                          </svg>
                        </div>

                        {/* Card Text */}
                        <div>
                          <h4
                            className="mb-1"
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "14px",
                              fontWeight: 500,
                              lineHeight: "normal",
                              color: "#ffffff",
                            }}
                          >
                            Add Document
                          </h4>
                          <p
                            style={{
                              fontFamily: "var(--font-roboto-mono)",
                              fontSize: "12px",
                              fontWeight: 400,
                              lineHeight: "normal",
                              color: "#a1a1a1",
                            }}
                          >
                            Upload your first document to get started with RAG
                          </p>
                        </div>
                      </div>
                    </button>


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
