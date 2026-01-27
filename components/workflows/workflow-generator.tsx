"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wand2,
} from "lucide-react";

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
          <label className="text-sm font-medium">Connected Services</label>
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

        {/* Intent textarea */}
        <div className="space-y-2">
          <label className="text-sm font-medium">What do you want to automate?</label>
          <Textarea
            placeholder="Describe your workflow in plain English..."
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            className="min-h-[120px] resize-none"
            disabled={isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            {intent.length}/10 minimum characters
          </p>
        </div>

        {/* Example prompts */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Try an example:</label>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.slice(0, 2).map((example, i) => (
              <button
                key={i}
                onClick={() => handleExampleClick(example)}
                className="text-xs text-primary hover:underline text-left"
                disabled={isGenerating}
              >
                "{example.substring(0, 50)}..."
              </button>
            ))}
          </div>
        </div>

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

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || intent.trim().length < 10}
            className="flex-1"
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
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
