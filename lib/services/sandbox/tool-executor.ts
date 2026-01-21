/**
 * Tool execution logic for AI-powered code generation.
 */

import { logger } from "@/lib/utils/logger";
import type { SandboxInstance } from "./types";
import { isCommandAllowed } from "./security";
import { readFileViaSh, writeFileViaSh, listFilesViaSh } from "./file-ops";
import { installPackages } from "./package-manager";
import { checkBuild } from "./build-tools";

// Timeout for individual tool calls (60 seconds)
const TOOL_TIMEOUT_MS = 60000;

export interface ToolExecutionResult {
  result: string;
  filesAffected?: string[];
}

/**
 * Execute a tool call with timeout and abort signal protection.
 * Races the promise against both a timeout and an optional abort signal.
 */
async function withTimeoutAndAbort<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
  abortSignal?: AbortSignal,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(`Tool '${toolName}' timed out after ${timeoutMs / 1000}s`),
        ),
      timeoutMs,
    );
  });

  // If we have an abort signal, add it to the race
  const abortPromise = abortSignal
    ? new Promise<never>((_, reject) => {
        if (abortSignal.aborted) {
          reject(new Error("Operation aborted by client"));
        }
        abortSignal.addEventListener("abort", () => {
          reject(new Error("Operation aborted by client"));
        });
      })
    : null;

  const racers: Promise<T | never>[] = [promise, timeoutPromise];
  if (abortPromise) {
    racers.push(abortPromise);
  }

  return Promise.race(racers);
}

/**
 * Execute a tool call from the AI.
 * Returns the result string and any affected files.
 *
 * @param sandbox - The sandbox instance to execute commands in
 * @param toolName - Name of the tool to execute
 * @param args - Arguments for the tool
 * @param options - Optional settings including sandboxId and abortSignal
 */
export async function executeToolCall(
  sandbox: SandboxInstance,
  toolName: string,
  args: Record<string, unknown>,
  options: {
    sandboxId?: string;
    abortSignal?: AbortSignal;
  } = {},
): Promise<ToolExecutionResult> {
  const { sandboxId, abortSignal } = options;
  const filesAffected: string[] = [];
  let result: string;

  // Check for abort before starting
  if (abortSignal?.aborted) {
    return {
      result: "Operation aborted by client",
      filesAffected: [],
    };
  }

  try {
    const execution = async (): Promise<string> => {
      switch (toolName) {
        case "install_packages": {
          const packages = args?.packages as string[] | undefined;
          if (!packages || !Array.isArray(packages)) {
            return `Error: install_packages called without packages array. Args received: ${JSON.stringify(args)}`;
          }
          return await installPackages(sandbox, packages);
        }

        case "write_file": {
          const path = args?.path as string | undefined;
          const content = args?.content as string | undefined;

          if (!path) {
            return `Error: write_file called without a path. Args received: ${JSON.stringify(args)}`;
          }
          if (content === undefined || content === null) {
            return `Error: write_file called with empty content for ${path}. Please provide the file content.`;
          }

          await writeFileViaSh(sandbox, path, content);
          filesAffected.push(path);

          logger.info("File written", { sandboxId, path });
          return `Wrote ${path}`;
        }

        case "read_file": {
          const path = args?.path as string | undefined;
          if (!path) {
            return `Error: read_file called without a path. Args received: ${JSON.stringify(args)}`;
          }
          const content = await readFileViaSh(sandbox, path);
          return content || `File not found: ${path}`;
        }

        case "check_build": {
          const buildResult = await checkBuild(sandbox);
          logger.info("Build check", {
            sandboxId,
            ok: buildResult.includes("BUILD OK"),
          });
          return buildResult;
        }

        case "list_files": {
          const path = (args?.path as string | undefined) || ".";
          const files = await listFilesViaSh(sandbox, path);
          return files.join("\n") || `Empty: ${path}`;
        }

        case "run_command": {
          const command = args?.command as string | undefined;
          if (!command) {
            return `Error: run_command called without a command. Args received: ${JSON.stringify(args)}`;
          }

          const commandCheck = isCommandAllowed(command);
          if (!commandCheck.allowed) {
            logger.warn("Blocked command attempt", {
              sandboxId,
              command,
              reason: commandCheck.reason,
            });
            return `Command blocked: ${commandCheck.reason}`;
          }

          const r = await sandbox.runCommand({
            cmd: "sh",
            args: ["-c", command],
          });
          return `Exit ${r.exitCode}: ${await r.stdout()} ${await r.stderr()}`.trim();
        }

        default:
          return `Unknown tool: ${toolName}`;
      }
    };

    // Execute with timeout and abort signal support
    result = await withTimeoutAndAbort(
      execution(),
      TOOL_TIMEOUT_MS,
      toolName,
      abortSignal,
    );
  } catch (toolError) {
    const toolErrorMsg =
      toolError instanceof Error ? toolError.message : String(toolError);

    // Log abort errors at info level, others at error level
    if (toolErrorMsg.includes("aborted")) {
      logger.info("Tool execution aborted", {
        sandboxId,
        tool: toolName,
      });
    } else {
      logger.error("Tool execution error", {
        sandboxId,
        tool: toolName,
        error: toolErrorMsg,
      });
    }
    result = `Error executing ${toolName}: ${toolErrorMsg}`;
  }

  return { result, filesAffected };
}
