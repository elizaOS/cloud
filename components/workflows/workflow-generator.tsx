"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Loader2, Sparkles, Save, Wand2, FileCode } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WORKFLOW_TEMPLATES = [
  {
    id: "webhook-ai-storage",
    name: "Webhook → AI → Storage",
    description: "Process webhook data with AI and store results",
    prompt:
      "Create a workflow that: 1) Receives data via webhook, 2) Processes it with the chat API to extract insights, 3) Stores the results in IPFS storage",
  },
  {
    id: "scheduled-report",
    name: "Scheduled Report",
    description: "Generate and send periodic reports",
    prompt:
      "Create a workflow that runs on a schedule (every day at 9am) to: 1) Query an API for data, 2) Generate a summary report using AI, 3) Send results via HTTP POST to a notification endpoint",
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline",
    description: "ETL workflow with transformation",
    prompt:
      "Create a data pipeline workflow that: 1) Fetches data from an HTTP API, 2) Transforms the data using a code node (filter and map), 3) Splits into batches for processing, 4) Makes API calls for each batch",
  },
  {
    id: "content-moderation",
    name: "Content Moderation",
    description: "AI-powered content review pipeline",
    prompt:
      "Create a content moderation workflow: 1) Receive content via webhook, 2) Use AI to analyze for policy violations, 3) Branch based on result (approve/flag/reject), 4) Store decision and notify via HTTP",
  },
  {
    id: "agent-orchestration",
    name: "Agent Orchestration",
    description: "Multi-step AI agent workflow",
    prompt:
      "Create an agent orchestration workflow: 1) Receive a task via webhook, 2) Use AI to break it into subtasks, 3) Execute each subtask with separate AI calls, 4) Merge results and return comprehensive response",
  },
];

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

export function WorkflowGenerator({
  onWorkflowGenerated,
}: WorkflowGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [autoSave, setAutoSave] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] =
    useState<GeneratedWorkflow | null>(null);

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
        toast.success(
          `Workflow "${result.savedWorkflow.name}" saved successfully!`,
        );
      } else {
        toast.success("Workflow generated successfully!");
      }

      if (!result.validation.valid) {
        toast.warning(
          `Validation warnings: ${result.validation.errors.join(", ")}`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate workflow",
      );
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
              <h3 className="text-lg font-semibold text-white">
                AI Workflow Generator
              </h3>
              <p className="text-sm text-white/60">
                Describe your workflow in natural language and let AI build it
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-white/80">Quick Start Templates</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {WORKFLOW_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setPrompt(template.prompt)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    prompt === template.prompt
                      ? "bg-[#FF5800]/20 border-[#FF5800]/50"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="h-4 w-4 text-[#FF5800]" />
                    <span className="text-sm font-medium text-white">
                      {template.name}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt" className="text-white/80">
                Workflow Description
              </Label>
              <Textarea
                id="prompt"
                placeholder="Describe what you want your workflow to do, or select a template above...&#10;&#10;Example: Create a workflow that monitors a webhook for new orders, sends them to the chat API for processing, and stores the results in IPFS storage."
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
                <Label
                  htmlFor="auto-save"
                  className="text-white/80 cursor-pointer"
                >
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
                  Generating...
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
              <h3 className="text-lg font-semibold text-white">
                Generated Workflow
              </h3>
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
                Saved as &quot;{generatedWorkflow.savedWorkflow.name}&quot; (v
                {generatedWorkflow.savedWorkflow.version})
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
