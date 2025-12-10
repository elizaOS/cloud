"use client";

import { useState } from "react";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
}

interface TestResult {
  success: boolean;
  executionId: string;
  status: "completed" | "failed" | "running";
  startTime: string;
  endTime?: string;
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
}

interface WorkflowTesterProps {
  workflow: Workflow;
  onBack: () => void;
}

export function WorkflowTester({ workflow, onBack }: WorkflowTesterProps) {
  const [testInput, setTestInput] = useState("{}");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);

    try {
      let inputData = {};
      try {
        inputData = JSON.parse(testInput);
      } catch {
        throw new Error("Invalid JSON input");
      }

      const response = await fetch(`/api/v1/n8n/workflows/${workflow.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: inputData }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Test failed");
      }

      const result = await response.json();
      setTestResult(result);

      if (result.success) {
        toast.success("Workflow test completed successfully!");
      } else {
        toast.error("Workflow test failed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
      setTestResult({
        success: false,
        executionId: "error",
        status: "failed",
        startTime: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTesting(false);
    }
  }

  function copyOutput() {
    if (testResult?.output) {
      navigator.clipboard.writeText(JSON.stringify(testResult.output, null, 2));
      toast.success("Output copied to clipboard");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-white">{workflow.name}</h2>
          <p className="text-sm text-white/60">Test your workflow with sample input</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#FF5800]/20">
                <Play className="h-5 w-5 text-[#FF5800]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Test Input</h3>
                <p className="text-sm text-white/60">
                  Provide JSON input for the workflow
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-input" className="text-white/80">
                Input JSON
              </Label>
              <Textarea
                id="test-input"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder='{"key": "value"}'
                className="min-h-[200px] font-mono text-sm bg-black/30 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <BrandButton
              variant="primary"
              onClick={handleTest}
              disabled={isTesting}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running Test...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Test
                </>
              )}
            </BrandButton>
          </div>
        </BrandCard>

        {/* Output Panel */}
        <BrandCard>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {testResult ? (
                  testResult.success ? (
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-red-500/20">
                      <XCircle className="h-5 w-5 text-red-400" />
                    </div>
                  )
                ) : (
                  <div className="p-2 rounded-lg bg-white/5">
                    <Clock className="h-5 w-5 text-white/40" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-white">Test Result</h3>
                  <p className="text-sm text-white/60">
                    {testResult
                      ? testResult.success
                        ? "Test completed successfully"
                        : "Test failed"
                      : "Run a test to see results"}
                  </p>
                </div>
              </div>

              {testResult?.output && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyOutput}
                  className="text-white/60 hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>

            {testResult && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-white/40">Status:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        testResult.status === "completed"
                          ? "bg-green-500/20 text-green-400"
                          : testResult.status === "running"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {testResult.status}
                    </span>
                  </div>

                  {testResult.duration && (
                    <div className="flex items-center gap-2">
                      <span className="text-white/40">Duration:</span>
                      <span className="text-white/80">{testResult.duration}ms</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-white/40">Started:</span>
                    <span className="text-white/80">
                      {formatDistanceToNow(new Date(testResult.startTime))} ago
                    </span>
                  </div>
                </div>

                {testResult.error && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-400 font-medium mb-1">Error</p>
                    <p className="text-sm text-red-300">{testResult.error}</p>
                  </div>
                )}

                {testResult.output && (
                  <div className="bg-black/30 rounded-lg p-4 overflow-auto max-h-[300px]">
                    <pre className="text-sm text-white/80 font-mono">
                      {JSON.stringify(testResult.output, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {!testResult && (
              <div className="flex items-center justify-center py-12 text-white/40">
                <p>No test results yet</p>
              </div>
            )}
          </div>
        </BrandCard>
      </div>
    </div>
  );
}

