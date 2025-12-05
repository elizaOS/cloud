"use client";

import { useState, useEffect } from "react";
import { Download, Save, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";
import { BrandButton } from "@/components/brand";
import { MonacoJsonEditor } from "@/components/chat/monaco-json-editor";

interface JsonEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
  onSave: () => Promise<void>;
  hideActions?: boolean;
}

interface EditorState {
  jsonText: string;
  isValid: boolean;
  error: string | null;
  isSaving: boolean;
}

export function JsonEditor({
  character,
  onChange,
  onSave,
  hideActions = false,
}: JsonEditorProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    jsonText: "",
    isValid: true,
    error: null,
    isSaving: false,
  });

  const updateEditor = (updates: Partial<EditorState>) => {
    setEditorState((prev) => ({ ...prev, ...updates }));
  };

  useEffect(() => {
    updateEditor({ jsonText: JSON.stringify(character, null, 2) });
  }, [character]);

  const handleJsonChange = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      updateEditor({ jsonText: value, isValid: true, error: null });
      onChange(parsed as ElizaCharacter);
    } catch (err) {
      updateEditor({ jsonText: value, isValid: false, error: (err as Error).message });
    }
  };

  const handleExport = () => {
    const blob = new Blob([editorState.jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${character.name || "character"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Character exported successfully!");
  };

  const handleSave = async () => {
    if (!editorState.isValid) {
      toast.error("Cannot save invalid JSON");
      return;
    }

    updateEditor({ isSaving: true });
    try {
      await onSave();
      toast.success("Character saved successfully!");
    } catch (error) {
      toast.error("Failed to save character");
      console.error("Save error:", error);
    } finally {
      updateEditor({ isSaving: false });
    }
  };

  return (
    <div className="flex h-full flex-col bg-black/60">
      {!hideActions && (
        <div className="flex-shrink-0 border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Character JSON</h3>
              {editorState.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-400" />
              )}
            </div>
            <div className="flex gap-2">
              <BrandButton
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!editorState.isValid}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </BrandButton>
              <BrandButton
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={!editorState.isValid || editorState.isSaving}
              >
                <Save className="mr-2 h-4 w-4" />
                {editorState.isSaving ? "Saving..." : "Save"}
              </BrandButton>
            </div>
          </div>
          {editorState.error && (
            <p className="mt-2 text-sm text-rose-400">
              <strong>Error:</strong> {editorState.error}
            </p>
          )}
        </div>
      )}
      {hideActions && editorState.error && (
        <div className="flex-shrink-0 border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <p className="text-sm text-rose-400">
              <strong>Error:</strong> {editorState.error}
            </p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <MonacoJsonEditor
          value={editorState.jsonText}
          onChange={handleJsonChange}
          isValid={editorState.isValid}
        />
      </div>
    </div>
  );
}
