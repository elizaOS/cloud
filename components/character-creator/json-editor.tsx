"use client";

import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Download, Save, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";
import { BrandButton } from "@/components/brand";

interface JsonEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
  onSave: () => Promise<void>;
}

export function JsonEditor({ character, onChange, onSave }: JsonEditorProps) {
  const [jsonText, setJsonText] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setJsonText(JSON.stringify(character, null, 2));
  }, [character]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);

    try {
      const parsed = JSON.parse(value);
      setIsValid(true);
      setError(null);
      onChange(parsed as ElizaCharacter);
    } catch (err) {
      setIsValid(false);
      setError((err as Error).message);
    }
  };

  const handleExport = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
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
    if (!isValid) {
      toast.error("Cannot save invalid JSON");
      return;
    }

    setIsSaving(true);
    try {
      await onSave();
      toast.success("Character saved successfully!");
    } catch (error) {
      toast.error("Failed to save character");
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-black/60">
      <div className="flex-shrink-0 border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">Character JSON</h3>
            {isValid ? (
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
              disabled={!isValid}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </BrandButton>
            <BrandButton
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!isValid || isSaving}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </BrandButton>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-rose-400">
            <strong>Error:</strong> {error}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <Textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          className={`h-full resize-none rounded-none border-0 bg-transparent font-mono text-sm text-white ${
            isValid ? "" : "border-rose-500"
          }`}
          placeholder="Character JSON will appear here..."
        />
      </div>
    </div>
  );
}
