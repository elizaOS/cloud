/**
 * AI SDK App Builder Service
 *
 * Single source of truth for AI-powered code generation in the App Builder.
 * Uses Vercel's AI SDK with streaming and full tool execution support.
 *
 * Key features:
 * - Uses AI Gateway for model flexibility (no hardcoded models)
 * - Real-time streaming responses
 * - Full tool execution with manual loop (SDK v6.0.x pattern)
 * - Abort signal support for cancellation
 * - Build checks only at the end (not per-file)
 */

import { streamText, tool } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { logger } from "@/lib/utils/logger";
import {
  buildFullAppPrompt,
  type FullAppTemplateType,
} from "@/lib/fragments/prompt";

// Import shared utilities from the sandbox module - single source of truth
import {
  type SandboxInstance,
  toolSchemas,
  executeToolCall as sharedExecuteToolCall,
  checkBuild,
  readFileViaSh,
} from "./sandbox/index";

// ============================================================================
// Types
// ============================================================================

export type { SandboxInstance } from "./sandbox";

export interface AppBuilderStreamCallbacks {
  onToolCall?: (toolName: string, args: unknown) => void | Promise<void>;
  onToolResult?: (
    toolName: string,
    args: unknown,
    result: string,
  ) => void | Promise<void>;
  onThinking?: (text: string) => void | Promise<void>;
}

export interface AppBuilderConfig {
  sandbox?: SandboxInstance;
  sandboxId?: string;
  systemPrompt?: string;
  templateType?: FullAppTemplateType;
  includeMonetization?: boolean;
  includeAnalytics?: boolean;
  model?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface AppBuilderResult {
  output: string;
  filesAffected: string[];
  success: boolean;
  error?: string;
  toolCallCount: number;
}

// Event types emitted by the stream
export type AppBuilderEvent =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; toolName: string; args: unknown }
  | { type: "tool_result"; toolName: string; args: unknown; result: string }
  | { type: "complete"; result: AppBuilderResult }
  | { type: "error"; error: string };

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ITERATIONS = 30;

// Default model - uses AI Gateway so any supported model works
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

// ============================================================================
// Available Models (fetched dynamically, these are suggestions)
// ============================================================================

const AVAILABLE_MODELS = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    description: "Best balance of speed and capability for coding tasks",
    isDefault: true,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    description: "Fastest model for quick iterations",
  },
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    description: "OpenAI's most capable model",
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    description: "Google's fast multimodal model",
  },
];

// ============================================================================
// Main Service Class
// ============================================================================

export class AppBuilderAISDK {
  /**
   * Execute AI-powered code generation with streaming and full tool execution.
   *
   * Uses manual multi-turn loop pattern (SDK v6.0.x compatible):
   * 1. Define tools with inputSchema (no execute)
   * 2. Stream text and get tool calls
   * 3. Execute tools manually and add results to conversation
   * 4. Continue until done
   */
  async *executeStream(
    prompt: string,
    config: AppBuilderConfig,
    callbacks?: AppBuilderStreamCallbacks,
  ): AsyncGenerator<AppBuilderEvent> {
    const {
      sandbox,
      sandboxId,
      systemPrompt,
      templateType = "blank",
      includeMonetization = false,
      includeAnalytics = true,
      model = DEFAULT_MODEL,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      abortSignal,
    } = config;

    if (!sandbox) {
      yield { type: "error", error: "No sandbox available" };
      yield {
        type: "complete",
        result: {
          output: "Error: No sandbox available",
          filesAffected: [],
          success: false,
          error: "No sandbox available",
          toolCallCount: 0,
        },
      };
      return;
    }

    if (abortSignal?.aborted) {
      yield { type: "error", error: "Operation aborted" };
      yield {
        type: "complete",
        result: {
          output: "Operation aborted",
          filesAffected: [],
          success: false,
          error: "Operation aborted",
          toolCallCount: 0,
        },
      };
      return;
    }

    const filesAffected: string[] = [];
    let outputText = "";
    let toolCallCount = 0;
    const startTime = Date.now();

    const checkTimeout = () => {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Operation timed out after ${timeoutMs / 1000}s`);
      }
    };

    const checkAbort = () => {
      if (abortSignal?.aborted) {
        throw new Error("Operation aborted by client");
      }
    };

    try {
      // Build context by reading current files IN PARALLEL for faster startup
      const [pageContent, globalsCss] = await Promise.all([
        readFileViaSh(sandbox, "src/app/page.tsx"),
        readFileViaSh(sandbox, "src/app/globals.css"),
      ]);

      const tailwindWarning =
        globalsCss &&
        (globalsCss.includes("@tailwind") ||
          globalsCss.includes("tailwindcss/tailwind.css"))
          ? `\n⚠️ CRITICAL: globals.css uses Tailwind v3 syntax. Replace with: @import "tailwindcss";\n`
          : "";

      const contextPrompt = `CURRENT FILES:

=== src/app/page.tsx ===
${pageContent || "(not found)"}

=== src/app/globals.css ===
${globalsCss || "(not found)"}
${tailwindWarning}
---
USER REQUEST: ${prompt}

GUIDELINES:
1. You CAN modify any file at any time - including ones you've already written
2. Do NOT import files that don't exist yet - install packages first if needed
3. When adding features, update the necessary files (page.tsx, components, etc.)

WRITE FILES PROGRESSIVELY - users see live updates!
- Write layout.tsx FIRST with unique metadata
- Write page.tsx EARLY, then iterate on it as needed
- Write components ONE BY ONE
- Feel free to update existing files to add new features

BUILD CHECK: Call check_build ONLY ONCE at the end!
- Do NOT check after every file - HMR auto-refreshes
- Fix any errors before finishing`;

      const finalSystemPrompt =
        systemPrompt ||
        buildFullAppPrompt({
          templateType,
          includeMonetization,
          includeAnalytics,
        });

      logger.info("Starting AI execution", {
        model,
        sandboxId,
        promptLength: prompt.length,
      });

      // Messages array for multi-turn conversation
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: contextPrompt },
      ];

      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        checkTimeout();
        checkAbort();

        // Stream with tools (no execute functions - SDK v6.0.x pattern)
        const result = streamText({
          model: gateway.languageModel(model),
          system: finalSystemPrompt,
          messages,
          tools: {
            install_packages: tool({
              description:
                "Install npm packages BEFORE writing files that import them.",
              inputSchema: toolSchemas.install_packages,
            }),
            write_file: tool({
              description:
                "Write a file. HMR auto-refreshes - no build check needed per file.",
              inputSchema: toolSchemas.write_file,
            }),
            read_file: tool({
              description: "Read a file's content.",
              inputSchema: toolSchemas.read_file,
            }),
            check_build: tool({
              description:
                "Check build status. Call ONCE at the end, not after each file.",
              inputSchema: toolSchemas.check_build,
            }),
            list_files: tool({
              description: "List files in a directory.",
              inputSchema: toolSchemas.list_files,
            }),
            run_command: tool({
              description: "Run a shell command.",
              inputSchema: toolSchemas.run_command,
            }),
          },
          abortSignal,
        });

        // Stream text chunks as "thinking"
        let assistantText = "";
        for await (const chunk of result.textStream) {
          checkTimeout();
          checkAbort();
          if (chunk) {
            assistantText += chunk;
            yield { type: "thinking", text: chunk };
            if (callbacks?.onThinking) await callbacks.onThinking(chunk);
          }
        }

        if (assistantText.trim()) {
          outputText += assistantText + "\n";
        }

        // Get tool calls
        const toolCalls = await result.toolCalls;

        // Execute tools using shared executor
        const toolResults: Array<{ toolName: string; result: string }> = [];
        for (const tc of toolCalls) {
          const tcAny = tc as {
            args?: unknown;
            input?: unknown;
            toolName: string;
          };
          const toolArgs = (tcAny.args ?? tcAny.input ?? {}) as Record<
            string,
            unknown
          >;

          yield { type: "tool_call", toolName: tc.toolName, args: toolArgs };
          if (callbacks?.onToolCall)
            await callbacks.onToolCall(tc.toolName, toolArgs);

          toolCallCount++;

          // Use shared tool executor
          const { result: toolResult, filesAffected: affected } =
            await sharedExecuteToolCall(sandbox, tc.toolName, toolArgs, {
              sandboxId,
            });

          if (affected) {
            filesAffected.push(...affected);
          }

          toolResults.push({ toolName: tc.toolName, result: toolResult });
          yield {
            type: "tool_result",
            toolName: tc.toolName,
            args: toolArgs,
            result: toolResult,
          };
          if (callbacks?.onToolResult) {
            await callbacks.onToolResult(tc.toolName, toolArgs, toolResult);
          }
        }

        // Continue conversation or finish
        if (toolResults.length > 0) {
          messages.push({
            role: "assistant",
            content: assistantText || "Executing tools...",
          });

          // Build results content with file tracking to prevent duplicate writes
          let resultsContent = toolResults
            .map((tr) => `Tool: ${tr.toolName}\nResult: ${tr.result}`)
            .join("\n\n");

          // Remind AI of files already written to prevent duplicates
          const uniqueFiles = [...new Set(filesAffected)];
          if (uniqueFiles.length > 0) {
            resultsContent += `\n\n---\nFILES ALREADY WRITTEN (do NOT re-write unless fixing errors):\n${uniqueFiles.join("\n")}`;
          }

          messages.push({ role: "user", content: resultsContent });
        } else {
          // No tool calls - check if build has errors
          if (filesAffected.length > 0 && iteration < MAX_ITERATIONS - 3) {
            const buildCheck = await checkBuild(sandbox);
            if (buildCheck.includes("BUILD ERRORS")) {
              logger.info("Build errors detected, asking AI to fix", {
                sandboxId,
                iteration,
              });
              messages.push({
                role: "assistant",
                content: assistantText || "Done.",
              });
              messages.push({
                role: "user",
                content: `BUILD ERRORS - fix these:\n\n${buildCheck}`,
              });
              continue;
            }
          }
          break; // Done!
        }
      }

      // Final build check
      if (filesAffected.length > 0) {
        const finalBuild = await checkBuild(sandbox);
        if (finalBuild.includes("BUILD ERRORS")) {
          outputText += `\n\n⚠️ Build errors:\n${finalBuild}`;
        }
      }

      logger.info("AI execution complete", {
        model,
        sandboxId,
        filesAffected: filesAffected.length,
        toolCallCount,
        iterations: iteration,
        durationMs: Date.now() - startTime,
      });

      yield {
        type: "complete",
        result: {
          output: outputText || "Changes applied!",
          filesAffected: [...new Set(filesAffected)],
          success: true,
          toolCallCount,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("AI execution failed", { sandboxId, error: errorMessage });

      yield { type: "error", error: errorMessage };
      yield {
        type: "complete",
        result: {
          output: outputText || "Operation failed",
          filesAffected: [...new Set(filesAffected)],
          success: false,
          error: errorMessage,
          toolCallCount,
        },
      };
    }
  }

  /**
   * Execute synchronously (non-streaming) - collects all events and returns final result.
   */
  async execute(
    prompt: string,
    config: AppBuilderConfig,
    callbacks?: AppBuilderStreamCallbacks,
  ): Promise<AppBuilderResult> {
    let finalResult: AppBuilderResult | null = null;
    for await (const event of this.executeStream(prompt, config, callbacks)) {
      if (event.type === "complete") finalResult = event.result;
    }
    return (
      finalResult || {
        output: "No result returned",
        filesAffected: [],
        success: false,
        error: "No result",
        toolCallCount: 0,
      }
    );
  }

  /**
   * Get available models for the UI.
   */
  getAvailableModels() {
    return AVAILABLE_MODELS;
  }

  /**
   * Get the default model ID.
   */
  getDefaultModel() {
    return DEFAULT_MODEL;
  }
}

export const appBuilderAISDK = new AppBuilderAISDK();
