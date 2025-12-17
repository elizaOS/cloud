"use client";

import { useState, useMemo } from "react";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Button } from "@/components/ui/button";
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
import type { Workflow, TestResult } from "./types";
import { getStatusColor } from "./types";
import { MonacoJsonEditor } from "@/components/chat/monaco-json-editor";

interface WorkflowTesterProps {
  workflow: Workflow;
  onBack: () => void;
}

export function WorkflowTester({ workflow, onBack }: WorkflowTesterProps) {
  const [testInput, setTestInput] = useState(`{
  "message": "Hello, world!",
  "data": {
    "key": "value",
    "items": ["item1", "item2"]
  },
  "options": {
    "debug": false,
    "timeout": 30000
  }
}`);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isValidJson, setIsValidJson] = useState(true);

  // Calculate editor height based on content (lineHeight: 20px + padding: 32px)
  const editorHeight = useMemo(() => {
    const lineCount = testInput.split("\n").length;
    const height = lineCount * 20 + 32;
    return Math.max(height, 80); // Minimum 80px
  }, [testInput]);

  function handleInputChange(value: string) {
    setTestInput(value);
    try {
      JSON.parse(value);
      setIsValidJson(true);
    } catch {
      setIsValidJson(false);
    }
  }

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

      const response = await fetch(
        `/api/v1/n8n/workflows/${workflow.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: inputData }),
        },
      );

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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-7 w-7 text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold text-white">{workflow.name}</h2>
        <span className="text-xs text-white/40">• Test</span>
      </div>

      <BrandCard>
        <CornerBrackets size="sm" className="opacity-20" />
        <div className="relative z-10 p-6 space-y-6">
          {/* Test Input Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
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
              <BrandButton
                variant="primary"
                onClick={handleTest}
                disabled={isTesting || !isValidJson}
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

            <div>
              <div 
                className="rounded-lg overflow-hidden border border-white/10 bg-black/30"
                style={{ height: `${editorHeight}px` }}
              >
                <MonacoJsonEditor
                  value={testInput}
                  onChange={handleInputChange}
                  isValid={isValidJson}
                  height={`${editorHeight}px`}
                />
              </div>
              {!isValidJson && (
                <p className="text-xs text-red-400">Invalid JSON syntax</p>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Test Result Section */}
          <div className="space-y-4">
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
                  <h3 className="text-lg font-semibold text-white">
                    Test Result
                  </h3>
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
                      className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(testResult.status)}`}
                    >
                      {testResult.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-white/40">Mode:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        testResult.executionMode === "real"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {testResult.executionMode === "real"
                        ? "n8n"
                        : "Simulated"}
                    </span>
                  </div>

                  {testResult.duration && (
                    <div className="flex items-center gap-2">
                      <span className="text-white/40">Duration:</span>
                      <span className="text-white/80">
                        {testResult.duration}ms
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-white/40">Started:</span>
                    <span className="text-white/80">
                      {formatDistanceToNow(new Date(testResult.startTime))} ago
                    </span>
                  </div>
                </div>

                {testResult.executionMode === "simulated" && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-amber-400">
                      <strong>Simulated execution:</strong> This workflow is not
                      deployed to an n8n instance. Deploy to n8n for real
                      execution with actual node processing.
                    </p>
                  </div>
                )}

                {testResult.n8nExecutionId && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white/40">n8n Execution ID:</span>
                    <code className="text-blue-400 font-mono">
                      {testResult.n8nExecutionId}
                    </code>
                  </div>
                )}

                {testResult.error && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-400 font-medium mb-1">
                      Error
                    </p>
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
              <div className="flex items-center justify-center py-8 text-white/40">
                <p>No test results yet</p>
              </div>
            )}
          </div>
        </div>
      </BrandCard>
    </div>
  );
}
