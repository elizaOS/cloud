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
 * Execute a tool call with timeout protection.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
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
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Execute a tool call from the AI.
 * Returns the result string and any affected files.
 */
export async function executeToolCall(
  sandbox: SandboxInstance,
  toolName: string,
  args: Record<string, unknown>,
  options: {
    sandboxId?: string;
  } = {},
): Promise<ToolExecutionResult> {
  const { sandboxId } = options;
  const filesAffected: string[] = [];
  let result: string;

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

    // Execute with timeout
    result = await withTimeout(execution(), TOOL_TIMEOUT_MS, toolName);
  } catch (toolError) {
    const toolErrorMsg =
      toolError instanceof Error ? toolError.message : String(toolError);
    logger.error("Tool execution error", {
      sandboxId,
      tool: toolName,
      error: toolErrorMsg,
    });
    result = `Error executing ${toolName}: ${toolErrorMsg}`;
  }

  return { result, filesAffected };
}
