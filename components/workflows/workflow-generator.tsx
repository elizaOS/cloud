"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wand2,
  LayoutTemplate,
} from "lucide-react";
import { TemplateBrowser, type WorkflowTemplate } from "./template-browser";

interface ServiceStatus {
  serviceId: string;
  connected: boolean;
  scopes?: string[];
}

interface GeneratedWorkflow {
  id: string;
  name: string;
  description: string;
  code: string;
  serviceDependencies: string[];
  executionPlan: Array<{
    step: number;
    serviceId: string;
    operation: string;
  }>;
  status: string;
  validation: {
    syntaxValid?: boolean;
    hasErrorHandling?: boolean;
    hasTypedReturn?: boolean;
    warnings?: string[];
  };
}

interface WorkflowGeneratorProps {
  connectedServices: ServiceStatus[];
  onGenerated: (workflow: GeneratedWorkflow) => void;
  onCancel?: () => void;
}

const SERVICE_NAMES: Record<string, string> = {
  google: "Google",
  twilio: "Twilio SMS",
  blooio: "iMessage",
  notion: "Notion",
};

const EXAMPLE_PROMPTS = [
  "When I receive an SMS asking about my calendar, check my Google Calendar and respond with my availability for today.",
  "Forward important emails to my phone via SMS when they contain the word 'urgent'.",
  "Send a daily summary of my calendar events via iMessage every morning at 8am.",
  "When someone texts me 'remind', create a Google Calendar event for 1 hour later.",
];

export function WorkflowGenerator({
  connectedServices,
  onGenerated,
  onCancel,
}: WorkflowGeneratorProps) {
  const [intent, setIntent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingServices, setMissingServices] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"create" | "templates">("create");
  const [isCreatingFromTemplate, setIsCreatingFromTemplate] = useState(false);

  const handleGenerate = async () => {
    if (intent.trim().length < 10) {
      setError("Please describe what you want to automate in more detail (at least 10 characters).");
      return;
    }

    setError(null);
    setMissingServices([]);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/v1/workflows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIntent: intent }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.missingServices) {
          setMissingServices(data.missingServices);
          setError(data.suggestion || "Missing required service connections");
        } else {
          setError(data.error || "Failed to generate workflow");
        }
        return;
      }

      toast.success("Workflow generated successfully!");
      onGenerated(data.workflow);
      setIntent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate workflow");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setIntent(example);
  };

  const handleTemplateSelect = async (template: WorkflowTemplate) => {
    setIsCreatingFromTemplate(true);
    setError(null);
    
    try {
      // Create a workflow from the template
      const response = await fetch("/api/v1/workflows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userIntent: template.description,
          templateId: template.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.missingServices) {
          setMissingServices(data.missingServices);
          setError(data.suggestion || "Missing required service connections");
        } else {
          setError(data.error || "Failed to create workflow from template");
        }
        return;
      }

      toast.success(`Workflow created from template "${template.name}"!`);
      onGenerated(data.workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow from template");
    } finally {
      setIsCreatingFromTemplate(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          Create New Workflow
        </CardTitle>
        <CardDescription>
          Describe what you want to automate in plain English. Our AI will generate the workflow for you.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connected services indicator */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Connected Services</p>
          <div className="flex flex-wrap gap-2">
            {connectedServices.map((service) => (
              <Badge
                key={service.serviceId}
                variant={service.connected ? "default" : "outline"}
                className={
                  service.connected
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "text-muted-foreground"
                }
              >
                {service.connected ? (
                  <CheckCircle className="h-3 w-3 mr-1" />
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                {SERVICE_NAMES[service.serviceId] || service.serviceId}
              </Badge>
            ))}
          </div>
          {connectedServices.filter((s) => s.connected).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Connect services in Settings → Connections to use them in workflows.
            </p>
          )}
        </div>

        {/* Tabs for Create vs Templates */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "templates")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              Browse Templates
            </TabsTrigger>
          </TabsList>

          {/* Create New Tab */}
          <TabsContent value="create" className="space-y-4 mt-4">
            {/* Intent textarea */}
            <div className="space-y-2">
              <label htmlFor="workflow-intent" className="text-sm font-medium">
                What do you want to automate?
              </label>
              <Textarea
                id="workflow-intent"
                placeholder="Describe your workflow in plain English..."
                value={intent}
                onChange={(e) => {
                  e.preventDefault();
                  setIntent(e.target.value);
                }}
                onInput={(e) => {
                  // Fallback for cases where onChange might not fire
                  const target = e.target as HTMLTextAreaElement;
                  if (target.value !== intent) {
                    setIntent(target.value);
                  }
                }}
                className="min-h-[120px] resize-none"
                disabled={isGenerating}
                data-testid="workflow-intent-input"
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  <span className={intent.length >= 10 ? "text-green-500" : "text-yellow-500"}>
                    {intent.length}
                  </span>
                  {" "}/ 10 minimum characters
                </p>
                {intent.length > 0 && intent.length < 10 && (
                  <p className="text-xs text-yellow-500">
                    Need {10 - intent.length} more characters
                  </p>
                )}
              </div>
            </div>

            {/* Example prompts */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.slice(0, 2).map((example) => (
                  <button
                    type="button"
                    key={example.substring(0, 20)}
                    onClick={() => handleExampleClick(example)}
                    className="text-xs text-primary hover:underline text-left"
                    disabled={isGenerating}
                  >
                    &ldquo;{example.substring(0, 50)}...&rdquo;
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || intent.trim().length < 10}
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
            </Button>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="mt-4">
            <TemplateBrowser 
              onSelect={handleTemplateSelect}
              className="max-h-[400px]"
            />
            {isCreatingFromTemplate && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Creating workflow from template...</span>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Error display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Missing services warning */}
        {missingServices.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Missing services: </span>
              {missingServices.map((s) => SERVICE_NAMES[s] || s).join(", ")}
              <br />
              <span className="text-xs">
                Please connect these services in Settings → Connections to use this workflow.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Cancel button */}
        {onCancel && (
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onCancel} disabled={isGenerating || isCreatingFromTemplate}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
