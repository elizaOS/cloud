/**
 * Interpreter Service - Quick stateless code execution
 * Python: requires `python3` on host. JS/TS: vm sandbox. Shell: pattern-filtered.
 */
import { db } from "@/db";
import { eq } from "drizzle-orm";
import {
  interpreterExecutions,
  type NewInterpreterExecution,
} from "@/db/schemas/code-agent-sessions";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { hasSufficientCredits } from "@/lib/utils/credit-guard";
import { logger } from "@/lib/utils/logger";
import type { InterpreterParams, InterpreterResult } from "./types";

const COST_CENTS = 1;
const TIMEOUT_MS = 30000;
const MAX_OUTPUT = 100000;

type ExecResult = {
  output: string;
  error: string | null;
  exitCode: number;
  durationMs: number;
};

// Shared spawn executor for Python and Shell
async function spawnShell(cmd: string, timeout: number): Promise<ExecResult> {
  const start = Date.now();
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    let out = "",
      err = "",
      timedOut = false;
    const proc = spawn("sh", ["-c", cmd]);
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeout);

    proc.stdout.on("data", (d) => {
      out += d;
      if (out.length > MAX_OUTPUT) {
        out = out.substring(0, MAX_OUTPUT) + "\n...truncated";
        proc.kill("SIGKILL");
      }
    });
    proc.stderr.on("data", (d) => {
      err += d;
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        output: out.trim(),
        error: err.trim() || (timedOut ? "Timed out" : null),
        exitCode: timedOut ? 124 : (code ?? 1),
        durationMs: Date.now() - start,
      });
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        output: "",
        error: e.message,
        exitCode: 1,
        durationMs: Date.now() - start,
      });
    });
  });
}

function executePython(
  code: string,
  packages: string[],
  timeout: number,
): Promise<ExecResult> {
  const escaped = code.replace(/'/g, "'\\''");
  const cmd = packages.length
    ? `pip install ${packages.join(" ")} 2>/dev/null && python3 -c '${escaped}'`
    : `python3 -c '${escaped}'`;
  return spawnShell(cmd, timeout);
}

const DANGEROUS = [
  /rm\s+-rf\s+\//,
  /sudo/,
  /chmod\s+777/,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\//,
  /curl.*\|\s*sh/,
  /wget.*\|\s*sh/,
  /curl.*\|\s*bash/,
  /wget.*\|\s*bash/,
  /\|\s*bash/,
  /bash\s+-c/,
  /eval\s*\(/,
  /\$\([^)]*\)/,
  /`[^`]*`/,
  /\/etc\/passwd/,
  /\/etc\/shadow/,
  /chown\s+root/,
  /nc\s+-[el]/,
  /ncat\s+-[el]/,
];

function executeShell(
  code: string,
  _packages: string[],
  timeout: number,
): Promise<ExecResult> {
  if (DANGEROUS.some((p) => p.test(code))) {
    return Promise.resolve({
      output: "",
      error: "Dangerous command blocked",
      exitCode: 1,
      durationMs: 0,
    });
  }
  return spawnShell(code, timeout);
}

async function executeJavaScript(
  code: string,
  packages: string[],
  timeout: number,
): Promise<ExecResult> {
  const start = Date.now();
  if (packages.length)
    return {
      output: "",
      error: "Packages not supported in interpreter mode",
      exitCode: 1,
      durationMs: 0,
    };

  const vm = await import("vm");
  let out = "";
  const log = (...args: unknown[]) => {
    out += args.map(String).join(" ") + "\n";
  };
  const ctx = vm.createContext({
    console: { log, error: log, warn: log, info: log },
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
    const result = new vm.Script(code).runInContext(ctx, { timeout });
    if (result instanceof Promise) {
      const v = await result;
      if (v !== undefined) out += String(v) + "\n";
      return {
        output: out.trim(),
        error: null,
        exitCode: 0,
        durationMs: Date.now() - start,
      };
    }
    if (result !== undefined) out += String(result) + "\n";
    return {
      output: out.trim(),
      error: null,
      exitCode: 0,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes("timed out")
        ? "Timed out"
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      output: out.trim(),
      error: msg,
      exitCode: 1,
      durationMs: Date.now() - start,
    };
  }
}

const EXECUTORS = {
  python: executePython,
  javascript: executeJavaScript,
  typescript: executeJavaScript,
  shell: executeShell,
} as const;

class InterpreterService {
  async execute(params: InterpreterParams): Promise<InterpreterResult> {
    const {
      organizationId,
      userId,
      language,
      code,
      packages = [],
      timeout = TIMEOUT_MS,
    } = params;
    const cost = COST_CENTS / 100;

    const { sufficient, currentBalance } = await hasSufficientCredits(
      organizationId,
      cost,
    );
    if (!sufficient)
      throw new Error(`Insufficient credits: $${currentBalance.toFixed(2)}`);

    const deduction = await creditsService.deductCredits({
      organizationId,
      amount: cost,
      description: `Interpreter: ${language}`,
      metadata: { user_id: userId, language },
    });
    if (!deduction.success) throw new Error("Failed to deduct credits");

    const executor = EXECUTORS[language as keyof typeof EXECUTORS];
    if (!executor) throw new Error(`Unsupported language: ${language}`);

    const [exec] = await db
      .insert(interpreterExecutions)
      .values({
        organization_id: organizationId,
        user_id: userId,
        language,
        code: code.substring(0, 10000),
        packages,
        status: "running",
      } satisfies NewInterpreterExecution)
      .returning();

    const result = await executor(code, packages, timeout);

    await db
      .update(interpreterExecutions)
      .set({
        status: result.exitCode === 0 ? "success" : "error",
        output: result.output.substring(0, MAX_OUTPUT),
        error: result.error,
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        cost_cents: COST_CENTS,
        completed_at: new Date(),
      })
      .where(eq(interpreterExecutions.id, exec.id));

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

    return {
      success: result.exitCode === 0,
      executionId: exec.id,
      output: result.output,
      error: result.error ?? undefined,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      costCents: COST_CENTS,
    };
  }

  async getExecution(
    executionId: string,
    organizationId: string,
  ): Promise<InterpreterResult | null> {
    const exec = await db.query.interpreterExecutions.findFirst({
      where: (e, { eq, and }) =>
        and(eq(e.id, executionId), eq(e.organization_id, organizationId)),
    });
    if (!exec) return null;
    return {
      success: exec.status === "success",
      executionId: exec.id,
      output: exec.output || "",
      error: exec.error ?? undefined,
      exitCode: exec.exit_code ?? 1,
      durationMs: exec.duration_ms ?? 0,
      memoryMbPeak: exec.memory_mb_peak ?? undefined,
      costCents: exec.cost_cents,
    };
  }
}

export const interpreterService = new InterpreterService();
