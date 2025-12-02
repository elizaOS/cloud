"use client";

import { useState } from "react";
import { CharacterForm } from "@/components/character-builder";
import { JsonEditor } from "@/components/character-creator/json-editor";
import { PluginsTab } from "@/components/chat/plugins-tab";
import type { ElizaCharacter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Download, Save, Zap, BookOpen, Upload, Sparkles } from "lucide-react";
import {
  Download,
  Save,
  Zap,
  BookOpen,
  Upload,
  Sparkles,
  Puzzle,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BrandTabsResponsive,
  type TabItem,
} from "@/components/brand/brand-tabs-responsive";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface CharacterEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
  onSave: () => Promise<void>;
}

type MainTab = "character" | "plugins" | "stats" | "uploads";

export function CharacterEditor({
  character,
  onChange,
  onSave,
}: CharacterEditorProps) {
  const [activeTab, setActiveTab] = useState<MainTab>("character");
  const [showJson, setShowJson] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const tabs: TabItem[] = [
    {
      value: "character",
      label: "Character",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      value: "plugins",
      label: "Plugins",
      icon: <Puzzle className="h-4 w-4" />,
    },
    {
      value: "stats",
      label: "Stats",
      icon: <BarChart3 className="h-4 w-4" />,
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
  const pathname = usePathname();
  const mode = pathname.includes("/build") ? "build" : "chat";

  return (
    <div className="flex h-full flex-col bg-black/40">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Character Builder</h2>
            <Zap
              className={cn([
                mode === "chat" ? "text-[#FF5800]" : "text-[#E500FF]",
                "h-5 w-5",
              ])}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="rounded-none border-white/10 bg-transparent text-white hover:bg-white/5"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className={cn([
                mode === "chat"
                  ? "text-white hover:bg-[#FF5800]/90 bg-[#FF5800]"
                  : "hover:bg-[#E500FF] bg-[#E500FF] text-white",
                "rounded-none",
              ])}
            >
              <Save
                className={cn([
                  mode === "chat" ? "text-[#FF5800]" : "text-white",
                  "mr-2 h-4 w-4",
                ])}
              />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-white/60">
          Design your AI agent&apos;s personality, voice, and behavior.
        </p>
      </div>

      {/* Responsive Tabs + JSON Toggle */}
      <div className="flex-shrink-0 border-b border-white/10 px-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 py-3">
          {/* Tabs - Dropdown on mobile, tabs on desktop */}
          <div className="flex-1 min-w-0">
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
          <div className="flex items-center gap-2 shrink-0 md:ml-auto md:pl-4">
            <span className="text-xs text-white/60">JSON</span>
            <button
              onClick={() => setShowJson(!showJson)}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                showJson ? "bg-[#E500FF]" : "bg-white/20"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                  showJson ? "translate-x-5" : "translate-x-1"
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
            {activeTab === "stats" && (
              <div className="flex h-full flex-col">
                <Tabs
                  defaultValue="model-calls"
                  className="flex flex-col h-full"
                >
                  <div className="flex-shrink-0 px-6 pt-4">
                    <TabsList className="bg-white/5 border border-white/10 rounded-lg p-1">
                      <TabsTrigger
                        value="model-calls"
                        className="data-[state=active]:bg-[#FF5800] data-[state=active]:text-white text-white/60 rounded-md px-4 py-1.5 text-sm"
                      >
                        <Zap className="h-3.5 w-3.5 mr-2" />
                        Model Calls
                      </TabsTrigger>
                      <TabsTrigger
                        value="memories"
                        className="data-[state=active]:bg-[#FF5800] data-[state=active]:text-white text-white/60 rounded-md px-4 py-1.5 text-sm"
                      >
                        <BookOpen className="h-3.5 w-3.5 mr-2" />
                        Memories
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="model-calls" className="flex-1 m-0">
                    <div className="flex h-full items-center justify-center p-6">
                      <div className="text-center">
                        <Zap className="h-12 w-12 text-white/40 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">
                          Model Calls
                        </h3>
                        <p className="text-sm text-white/60">
                          Configure model settings and API calls
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="memories" className="flex-1 m-0">
                    <div className="flex h-full items-center justify-center p-6">
                      <div className="text-center">
                        <BookOpen className="h-12 w-12 text-white/40 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">
                          Memories
                        </h3>
                        <p className="text-sm text-white/60">
                          View and manage agent memories
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
            {activeTab === "uploads" && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="text-center">
                  <Upload className="h-12 w-12 text-white/40 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Uploads
                  </h3>
                  <p className="text-sm text-white/60">
                    Upload files and documents
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
