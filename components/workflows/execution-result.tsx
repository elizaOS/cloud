"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Zap,
  RefreshCw,
} from "lucide-react";

export interface StepResult {
  stepName: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface ExecutionResultData {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  executionTimeMs: number;
  steps?: StepResult[];
}

interface ExecutionResultProps {
  result: ExecutionResultData;
  onRerun?: () => void;
  showRerun?: boolean;
}

export function ExecutionResult({ result, onRerun, showRerun = true }: ExecutionResultProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const formatOutput = (output: unknown): string => {
    if (output === undefined || output === null) return "No output";
    if (typeof output === "string") return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  };

  return (
    <Card className={result.success ? "border-green-500/30" : "border-red-500/30"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400" />
            )}
            Execution {result.success ? "Successful" : "Failed"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {result.executionTimeMs}ms
            </Badge>
            {showRerun && onRerun && (
              <Button variant="outline" size="sm" onClick={onRerun}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Re-run
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error Message */}
        {result.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-400">{result.error}</p>
          </div>
        )}

        {/* Steps */}
        {result.steps && result.steps.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Execution Steps ({result.steps.length})
            </p>
            {result.steps.map((step, index) => (
              <Collapsible
                key={`step-${step.stepName}-${index}`}
                open={expandedSteps.has(index)}
                onOpenChange={() => toggleStep(index)}
              >
                <div
                  className={`rounded-lg border ${
                    step.success
                      ? "border-green-500/20 bg-green-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <CollapsibleTrigger asChild>
                    <button type="button" className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="w-6 h-6 p-0 flex items-center justify-center"
                        >
                          {index + 1}
                        </Badge>
                        {step.success ? (
                          <CheckCircle className="h-4 w-4 text-green-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-400" />
                        )}
                        <span className="text-sm font-medium">{step.stepName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          {step.durationMs}ms
                        </Badge>
                        {expandedSteps.has(index) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2">
                      {step.error && (
                        <div className="bg-red-500/10 rounded p-2">
                          <p className="text-xs text-red-400">
                            <strong>Error:</strong> {step.error}
                          </p>
                        </div>
                      )}
                      {step.output !== undefined && step.output !== null && (
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-xs text-muted-foreground mb-1">Output:</p>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                            {formatOutput(step.output)}
                          </pre>
                        </div>
                      )}
                      {!step.error && !step.output && (
                        <p className="text-xs text-muted-foreground italic">
                          No output data
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Final Output */}
        {result.success && result.output && Object.keys(result.output).length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Final Output</p>
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {formatOutput(result.output)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
