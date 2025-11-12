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

export function AgentDnaEditor({
  character,
  onChange,
  onSave,
}: AgentDnaEditorProps) {
  const [activeTab, setActiveTab] = useState<MainTab>("settings");
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
            <Zap className="h-5 w-5 text-[#FF5800]" />
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
              className="rounded-none bg-[#FF5800] text-white hover:bg-[#FF5800]/90"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-white/60">
          Configure your AI agent&apos;s behaviour and capabilities.
        </p>
      </div>

      {/* Responsive Tabs + JSON Toggle */}
      <div className="flex-shrink-0 border-b border-white/10 px-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 py-3">
          {/* Tabs - Dropdown on mobile, tabs on desktop */}
          <div className="flex-1 min-w-0">
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

          {/* JSON Toggle Switch */}
          <div className="flex items-center gap-2 shrink-0 md:ml-auto md:pl-4">
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
              <CharacterFormClean character={character} onChange={onChange} />
            )}
            {activeTab === "model-calls" && (
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
            )}
            {activeTab === "memories" && (
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
