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
import { Download, Zap, BookOpen, Sparkles, Puzzle, CloudUpload, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BrandTabsResponsive,
  type TabItem,
} from "@/components/brand/brand-tabs-responsive";
import { usePathname, useSearchParams } from "next/navigation";

interface CharacterEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
  onSave: () => Promise<void>;
}

type MainTab = "character" | "plugins" | "files";

export function CharacterEditor({
  character,
  onChange,
  onSave,
}: CharacterEditorProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") as MainTab | null;
  const [activeTab, setActiveTab] = useState<MainTab>(
    initialTab && ["character", "plugins", "files"].includes(initialTab)
      ? initialTab
      : "character",
  );
  const [showJson, setShowJson] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Update tab when URL changes
  useEffect(() => {
    const tab = searchParams.get("tab") as MainTab | null;
    if (tab && ["character", "plugins", "files"].includes(tab)) {
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
    await onSave();
    setIsSaving(false);
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
  const pathname = usePathname();
  const mode = pathname.includes("/build") ? "build" : "chat";

  return (
    <div className="flex h-full flex-col bg-black/40">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Agent Builder</h2>
            <Zap className="text-[#FF5800] h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
            >
              <Upload className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="text-white hover:bg-[#FF5800]/90 bg-[#FF5800] rounded-none"
            >
              <CloudUpload className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Deploy"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-white/60">
          Design your AI agent&apos;s personality, voice, and behavior.
        </p>
      </div>

      {/* Responsive Tabs + JSON Toggle */}
      <div className="flex-shrink-0 border-b border-white/10 px-6">
        <div className="space-y-4 xl:space-y-0 flex flex-col xl:flex-row xl:items-center gap-3 py-3">
          {/* Tabs - Dropdown on mobile, tabs on desktop with horizontal scroll */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
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

          {/* JSON Toggle Switch */}
          <div className="flex items-center gap-2 shrink-0 xl:ml-auto xl:pl-4">
            <span className="text-xs text-white/60 whitespace-nowrap">
              JSON
            </span>
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
              <UploadsTab characterId={character.id || null} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
