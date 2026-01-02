/**
 * Character editor component with tabbed interface for editing character properties.
 * Supports form-based editing, JSON editing, plugins management, and knowledge uploads.
 *
 * @param props - Character editor configuration
 * @param props.character - Character data to edit
 * @param props.onChange - Callback when character data changes
 * @param props.onSave - Callback when save button is clicked
 */

"use client";

import { useState, useEffect } from "react";
import { CharacterForm } from "@/components/character-builder";
import { JsonEditor } from "@/components/character-creator/json-editor";
import { PluginsTab } from "@/components/chat/plugins-tab";
import { UploadsTab } from "@/components/chat/uploads-tab";
import type { ElizaCharacter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Zap,
  BookOpen,
  Sparkles,
  Puzzle,
  CloudUpload,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BrandTabsResponsive,
  type TabItem,
} from "@/components/brand/brand-tabs-responsive";
import { useSearchParams } from "next/navigation";
import type { PreUploadedFile } from "@/lib/types/knowledge";

interface CharacterEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
  onSave: () => Promise<void>;
  preUploadedFiles?: PreUploadedFile[];
  onPreUploadedFilesAdd?: (files: PreUploadedFile[]) => void;
  onPreUploadedFileRemove?: (fileId: string) => void;
}

type MainTab = "character" | "plugins" | "files";

export function CharacterEditor({
  character,
  onChange,
  onSave,
  preUploadedFiles,
  onPreUploadedFilesAdd,
  onPreUploadedFileRemove,
}: CharacterEditorProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") as MainTab | null;
  const validTabs = ["character", "plugins", "files"];
  const [activeTab, setActiveTab] = useState<MainTab>(
    initialTab && validTabs.includes(initialTab) ? initialTab : "character",
  );
  const [showJson, setShowJson] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Update tab when URL changes
  useEffect(() => {
    const tab = searchParams.get("tab") as MainTab | null;
    if (tab && validTabs.includes(tab)) {
      // Schedule state update to avoid synchronous setState in effect
      const rafId = requestAnimationFrame(() => setActiveTab(tab));
      return () => cancelAnimationFrame(rafId);
    }
  }, [searchParams]);

  const tabs: TabItem[] = [
    {
      value: "character",
      label: "Agent",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      value: "plugins",
      label: "Plugins",
      icon: <Puzzle className="h-4 w-4" />,
    },
    {
      value: "files",
      label: "Files",
      icon: <BookOpen className="h-4 w-4" />,
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
      <div className="flex-shrink-0 border-b border-white/10 px-3 py-2 md:px-6 md:py-4">
        <div className="flex items-center justify-between mb-1 md:mb-2">
          <div className="flex items-center gap-1.5 md:gap-2">
            <h2 className="text-base md:text-xl font-bold text-white">
              Agent Builder
            </h2>
            <Zap className="text-[#FF5800] h-4 w-4 md:h-5 md:w-5" />
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5 h-7 px-2 md:h-8 md:px-3 text-xs md:text-sm"
            >
              <Upload className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="ml-1.5 hidden sm:inline">Export</span>
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#FF5800] text-black hover:bg-[#FF5800]/90 active:bg-[#FF5800]/80 rounded-none h-7 px-2 md:h-8 md:px-3 text-xs md:text-sm"
              data-onboarding="build-save"
            >
              <CloudUpload className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="ml-1.5">
                {isSaving ? "..." : character.id ? "Save" : "Deploy"}
              </span>
            </Button>
          </div>
        </div>
        <p className="text-xs md:text-sm text-white/60 hidden md:block">
          Design your AI agent&apos;s personality, voice, and behavior.
        </p>
      </div>

      {/* Responsive Tabs + JSON Toggle */}
      <div className="flex-shrink-0 border-b border-white/10 px-3 md:px-6">
        <div className="flex items-center gap-2 md:gap-3 py-2 md:py-3">
          {/* Tabs - Dropdown on mobile, tabs on desktop with horizontal scroll */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <BrandTabsResponsive
              id="character-editor-tabs"
              tabs={tabs}
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as MainTab)}
              breakpoint="md"
            >
              {/* Empty children - content is rendered below */}
              <div className="hidden" />
            </BrandTabsResponsive>
          </div>

          {/* JSON Toggle Switch - Always inline, compact */}
          <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-white/10">
            <span className="text-[10px] md:text-xs text-white/60 whitespace-nowrap">
              JSON
            </span>
            <button
              onClick={() => setShowJson(!showJson)}
              className={cn(
                "relative inline-flex h-4 w-7 md:h-5 md:w-9 items-center rounded-full transition-colors",
                showJson ? "bg-[#FF5800]" : "bg-white/20",
              )}
            >
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 md:h-3 md:w-3 transform rounded-full bg-white transition-transform",
                  showJson
                    ? "translate-x-3.5 md:translate-x-5"
                    : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>
      </div>
      {/* Content Area - Full Height */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {showJson ? (
          <JsonEditor
            character={character}
            onChange={onChange}
            onSave={onSave}
            hideActions={true}
          />
        ) : (
          <>
            {activeTab === "character" && (
              <CharacterForm character={character} onChange={onChange} />
            )}
            {activeTab === "plugins" && (
              <PluginsTab
                character={character}
                onChange={(updates) => onChange({ ...character, ...updates })}
                onSave={onSave}
              />
            )}
            {activeTab === "files" && (
              <UploadsTab
                characterId={character.id || null}
                preUploadedFiles={preUploadedFiles}
                onPreUploadedFilesAdd={onPreUploadedFilesAdd}
                onPreUploadedFileRemove={onPreUploadedFileRemove}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
