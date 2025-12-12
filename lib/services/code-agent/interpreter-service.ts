/**
 * Code Interpreter Service - Quick stateless code execution
 */

import { db } from "@/db";
import { eq } from "drizzle-orm";
import {
  interpreterExecutions,
  type NewInterpreterExecution,
} from "@/db/schemas/code-agent-sessions";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { logger } from "@/lib/utils/logger";
import type { InterpreterParams, InterpreterResult } from "./types";

const COST_PER_EXECUTION_CENTS = 0.1;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_LENGTH = 100000;

async function executePython(
  code: string,
  packages: string[],
  timeout: number
): Promise<{ output: string; error: string | null; exitCode: number; durationMs: number }> {
  const startTime = Date.now();

  // For now, use a simple approach with Node's child_process
  // In production, this would use Cloudflare Workers or dedicated containers
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    let output = "";
    let errorOutput = "";
    let timedOut = false;

    // Install packages if needed
    const setupCommands: string[] = [];
    if (packages.length > 0) {
      setupCommands.push(`pip install ${packages.join(" ")} 2>/dev/null`);
    }

    const fullCode = setupCommands.length > 0
      ? `${setupCommands.join(" && ")} && python3 -c "${code.replace(/"/g, '\\"')}"`
      : code;

    const process = spawn("python3", ["-c", fullCode], {
      timeout,
      shell: true,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      process.kill("SIGKILL");
    }, timeout);

    process.stdout.on("data", (data) => {
      output += data.toString();
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n... (output truncated)";
        process.kill("SIGKILL");
      }
    });

    process.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    process.on("close", (exitCode) => {
      clearTimeout(timeoutId);
      resolve({
        output: output.trim(),
        error: errorOutput.trim() || (timedOut ? "Execution timed out" : null),
        exitCode: timedOut ? 124 : (exitCode ?? 1),
        durationMs: Date.now() - startTime,
      });
    });

    process.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        output: "",
        error: err.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

async function executeJavaScript(
  code: string,
  _packages: string[],
  timeout: number
): Promise<{ output: string; error: string | null; exitCode: number; durationMs: number }> {
  const startTime = Date.now();

  // Use Node.js vm module for sandboxed execution
  const vm = await import("vm");

  return new Promise((resolve) => {
    let output = "";
    let errorOutput: string | null = null;

    // Create a sandboxed console
    const consoleMethods = {
      log: (...args: unknown[]) => {
        output += args.map((a) => String(a)).join(" ") + "\n";
      },
      error: (...args: unknown[]) => {
        output += args.map((a) => String(a)).join(" ") + "\n";
      },
      warn: (...args: unknown[]) => {
        output += args.map((a) => String(a)).join(" ") + "\n";
      },
      info: (...args: unknown[]) => {
        output += args.map((a) => String(a)).join(" ") + "\n";
      },
    };

    const context = vm.createContext({
      console: consoleMethods,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Buffer,
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      Promise,
      Symbol,
    });

    try {
      const script = new vm.Script(code, { timeout });
      const result = script.runInContext(context, { timeout });

      // If the result is a promise, wait for it
      if (result instanceof Promise) {
        result
          .then((value) => {
            if (value !== undefined) {
              output += String(value) + "\n";
            }
            resolve({
              output: output.trim(),
              error: null,
              exitCode: 0,
              durationMs: Date.now() - startTime,
            });
          })
          .catch((err) => {
            resolve({
              output: output.trim(),
              error: err instanceof Error ? err.message : String(err),
              exitCode: 1,
              durationMs: Date.now() - startTime,
            });
          });
      } else {
        if (result !== undefined) {
          output += String(result) + "\n";
        }
        resolve({
          output: output.trim(),
          error: null,
          exitCode: 0,
          durationMs: Date.now() - startTime,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Script execution timed out")) {
        errorOutput = "Execution timed out";
      } else {
        errorOutput = err instanceof Error ? err.message : String(err);
      }

      resolve({
        output: output.trim(),
        error: errorOutput,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    }
  });
}

async function executeShell(
  code: string,
  timeout: number
): Promise<{ output: string; error: string | null; exitCode: number; durationMs: number }> {
  const startTime = Date.now();
  const { spawn } = await import("child_process");

  // Security: Only allow safe commands
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,
    /sudo/,
    /chmod\s+777/,
    /mkfs/,
    /dd\s+if=/,
    />\s*\/dev\//,
    /curl.*\|\s*sh/,
    /wget.*\|\s*sh/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return {
        output: "",
        error: "Command contains potentially dangerous patterns",
        exitCode: 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  return new Promise((resolve) => {
    let output = "";
    let errorOutput = "";
    let timedOut = false;

    const process = spawn("sh", ["-c", code], {
      timeout,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      process.kill("SIGKILL");
    }, timeout);

    process.stdout.on("data", (data) => {
      output += data.toString();
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n... (output truncated)";
        process.kill("SIGKILL");
      }
    });

    process.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    process.on("close", (exitCode) => {
      clearTimeout(timeoutId);
      resolve({
        output: output.trim(),
        error: errorOutput.trim() || (timedOut ? "Execution timed out" : null),
        exitCode: timedOut ? 124 : (exitCode ?? 1),
        durationMs: Date.now() - startTime,
      });
    });

    process.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        output: "",
        error: err.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

class InterpreterService {
  async execute(params: InterpreterParams): Promise<InterpreterResult> {
    const {
      organizationId,
      userId,
      language,
      code,
      packages = [],
      timeout = DEFAULT_TIMEOUT_MS,
    } = params;

    logger.info("[InterpreterService] Executing code", {
      organizationId,
      language,
      codeLength: code.length,
      packages,
    });

    // Check credits
    const balance = await creditsService.getBalance(organizationId);
    if (balance.balance < 0.01) {
      throw new Error("Insufficient credits for code execution");
    }

    // Deduct credits upfront
    const cost = COST_PER_EXECUTION_CENTS / 100; // Convert cents to dollars
    await creditsService.deductCredits({
      organizationId,
      amount: cost,
      description: `Code interpreter: ${language}`,
      metadata: { user_id: userId, language },
    });

    const [execution] = await db
      .insert(interpreterExecutions)
      .values({
        organization_id: organizationId,
        user_id: userId,
        language,
        code: code.substring(0, 10000),
        packages: packages,
        status: "running",
      } satisfies NewInterpreterExecution)
      .returning();

    try {
      let result: { output: string; error: string | null; exitCode: number; durationMs: number };

      switch (language) {
        case "python":
          result = await executePython(code, packages, timeout);
          break;

        case "javascript":
        case "typescript":
          result = await executeJavaScript(code, packages, timeout);
          break;

        case "shell":
          result = await executeShell(code, timeout);
          break;

        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      // Update execution record
      await db
        .update(interpreterExecutions)
        .set({
          status: result.exitCode === 0 ? "success" : "error",
          output: result.output.substring(0, MAX_OUTPUT_LENGTH),
          error: result.error,
          exit_code: result.exitCode,
          duration_ms: result.durationMs,
          cost_cents: COST_PER_EXECUTION_CENTS,
          completed_at: new Date(),
        })
        .where(eq(interpreterExecutions.id, execution.id));

      // Track usage
      await usageService.create({
        organization_id: organizationId,
        user_id: userId,
        api_key_id: null,
        type: "code_interpreter",
        model: language,
        provider: "eliza-cloud",
        input_tokens: code.length,
        output_tokens: result.output.length,
        input_cost: String(cost / 2),
        output_cost: String(cost / 2),
        is_successful: result.exitCode === 0,
      });

      logger.info("[InterpreterService] Execution completed", {
        executionId: execution.id,
        language,
        success: result.exitCode === 0,
        durationMs: result.durationMs,
      });

      return {
        success: result.exitCode === 0,
        executionId: execution.id,
        output: result.output,
        error: result.error || undefined,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        costCents: COST_PER_EXECUTION_CENTS,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db
        .update(interpreterExecutions)
        .set({
          status: "error",
          error: errorMessage,
          completed_at: new Date(),
        })
        .where(eq(interpreterExecutions.id, execution.id));

      logger.error("[InterpreterService] Execution failed", {
        executionId: execution.id,
        error,
      });

      return {
        success: false,
        executionId: execution.id,
        output: "",
        error: errorMessage,
        exitCode: 1,
        durationMs: 0,
        costCents: COST_PER_EXECUTION_CENTS,
      };
    }
  }

  async getExecution(executionId: string, organizationId: string): Promise<InterpreterResult | null> {
    const execution = await db.query.interpreterExecutions.findFirst({
      where: (e, { eq, and }) =>
        and(eq(e.id, executionId), eq(e.organization_id, organizationId)),
    });

    if (!execution) return null;

    return {
      success: execution.status === "success",
      executionId: execution.id,
      output: execution.output || "",
      error: execution.error || undefined,
      exitCode: execution.exit_code ?? 1,
      durationMs: execution.duration_ms ?? 0,
      memoryMbPeak: execution.memory_mb_peak ?? undefined,
      costCents: execution.cost_cents,
    };
  }
}

export const interpreterService = new InterpreterService();

