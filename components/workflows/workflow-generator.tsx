"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Loader2, Sparkles, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface WorkflowGeneratorProps {
  onWorkflowGenerated?: (workflow: GeneratedWorkflow) => void;
}

interface GeneratedWorkflow {
  workflow: Record<string, unknown>;
  savedWorkflow?: {
    id: string;
    name: string;
    status: string;
    version: number;
  };
  validation: {
    valid: boolean;
    errors: string[];
  };
  metadata: {
    model: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    cost: number;
  };
}

export function WorkflowGenerator({ onWorkflowGenerated }: WorkflowGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [autoSave, setAutoSave] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Please enter a workflow description");
      return;
    }

    if (autoSave && !workflowName.trim()) {
      toast.error("Please enter a workflow name for auto-save");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/v1/n8n/generate-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          autoSave,
          workflowName: autoSave ? workflowName : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate workflow");
      }

      const result: GeneratedWorkflow = await response.json();
      setGeneratedWorkflow(result);
      onWorkflowGenerated?.(result);

      if (result.savedWorkflow) {
        toast.success(`Workflow "${result.savedWorkflow.name}" saved successfully!`);
      } else {
        toast.success("Workflow generated successfully!");
      }

      if (!result.validation.valid) {
        toast.warning(`Validation warnings: ${result.validation.errors.join(", ")}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate workflow");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <BrandCard>
        <CornerBrackets size="sm" className="opacity-20" />
        <div className="relative z-10 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FF5800]/20">
              <Wand2 className="h-5 w-5 text-[#FF5800]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">AI Workflow Generator</h3>
              <p className="text-sm text-white/60">
                Describe your workflow in natural language and let AI build it
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt" className="text-white/80">
                Workflow Description
              </Label>
              <Textarea
                id="prompt"
                placeholder="Describe what you want your workflow to do...&#10;&#10;Example: Create a workflow that monitors a webhook for new orders, sends them to the chat API for processing, and stores the results in IPFS storage."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[150px] bg-white/5 border-white/10 text-white placeholder:text-white/40 resize-none"
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Switch
                  id="auto-save"
                  checked={autoSave}
                  onCheckedChange={setAutoSave}
                />
                <Label htmlFor="auto-save" className="text-white/80 cursor-pointer">
                  Auto-save workflow
                </Label>
              </div>

              {autoSave && (
                <div className="flex-1">
                  <Input
                    placeholder="Workflow name"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                </div>
              )}
            </div>

            <BrandButton
              variant="primary"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating with Claude Opus 4.5...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Workflow
                </>
              )}
            </BrandButton>
          </div>
        </div>
      </BrandCard>

      {generatedWorkflow && (
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Generated Workflow</h3>
              <div className="flex items-center gap-2">
                {generatedWorkflow.validation.valid ? (
                  <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">
                    Valid
                  </span>
                ) : (
                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                    Has Warnings
                  </span>
                )}
                <span className="text-xs text-white/40">
                  {generatedWorkflow.metadata.cost.toFixed(4)} credits
                </span>
              </div>
            </div>

            <div className="bg-black/30 rounded-lg p-4 overflow-auto max-h-[400px]">
              <pre className="text-sm text-white/80 font-mono">
                {JSON.stringify(generatedWorkflow.workflow, null, 2)}
              </pre>
            </div>

            {generatedWorkflow.savedWorkflow && (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Save className="h-4 w-4" />
                Saved as &quot;{generatedWorkflow.savedWorkflow.name}&quot; (v{generatedWorkflow.savedWorkflow.version})
              </div>
            )}

            {!generatedWorkflow.validation.valid && (
              <div className="text-sm text-yellow-400">
                <p className="font-medium">Validation warnings:</p>
                <ul className="list-disc list-inside mt-1">
                  {generatedWorkflow.validation.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </BrandCard>
      )}
    </div>
  );
}

