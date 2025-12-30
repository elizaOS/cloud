import { logger } from "@/lib/utils/logger";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { buildFullAppPrompt } from "@/lib/fragments/prompt";
import { dbRead, dbWrite } from "@/db/client";
import {
  sessionFileSnapshots,
  sessionRestoreHistory,
  type NewSessionFileSnapshot,
} from "@/db/schemas/app-sandboxes";
import { eq, and, desc } from "drizzle-orm";

const ELIZA_SDK_FILE = `const apiKey = process.env.NEXT_PUBLIC_ELIZA_API_KEY || '';
const apiBase = process.env.NEXT_PUBLIC_ELIZA_API_URL || 'https://eliza.gg';

interface ChatMessage {
  role: string;
  content: string;
}

export async function chat(messages: ChatMessage[], model = 'gpt-4o') {
  const res = await fetch(\`\${apiBase}/api/v1/chat/completions\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ messages, model }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function* chatStream(messages: ChatMessage[], model = 'gpt-4o') {
  const res = await fetch(\`\${apiBase}/api/v1/chat/completions\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ messages, model, stream: true }),
  });
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\\n')) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

export async function generateImage(prompt: string, options?: { model?: string; width?: number; height?: number }) {
  const res = await fetch(\`\${apiBase}/api/v1/generate-image\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ prompt, ...options }),
  });
  return res.json() as Promise<{ url: string; id: string }>;
}

export async function uploadFile(file: File | Blob, filename: string) {
  const formData = new FormData();
  formData.append('file', file, filename);
  const res = await fetch(\`\${apiBase}/api/v1/storage/upload\`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: formData,
  });
  return res.json() as Promise<{ id: string; url: string }>;
}

export async function getBalance() {
  const res = await fetch(\`\${apiBase}/api/v1/credits/balance\`, {
    headers: { 'X-Api-Key': apiKey },
  });
  return res.json() as Promise<{ balance: number }>;
}

export async function listAgents() {
  const res = await fetch(\`\${apiBase}/api/v1/agents\`, {
    headers: { 'X-Api-Key': apiKey },
  });
  return res.json() as Promise<{ agents: Array<{ id: string; name: string; bio: string }> }>;
}

export async function chatWithAgent(agentId: string, message: string, roomId?: string) {
  const res = await fetch(\`\${apiBase}/api/v1/agents/chat\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ agentId, message, roomId }),
  });
  return res.json() as Promise<{ response: string; roomId: string }>;
}
`;

const ELIZA_HOOK_FILE = `'use client';
import { useState, useCallback } from 'react';

type ChatMessage = { role: string; content: string };

export function useChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (messages: ChatMessage[]) => {
    setLoading(true);
    setError(null);
    try {
      const { chat } = await import('@/lib/eliza');
      return await chat(messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { send, loading, error };
}

export function useChatStream() {
  const [loading, setLoading] = useState(false);

  const stream = useCallback(async function* (messages: ChatMessage[]) {
    setLoading(true);
    try {
      const { chatStream } = await import('@/lib/eliza');
      yield* chatStream(messages);
    } finally {
      setLoading(false);
    }
  }, []);

  return { stream, loading };
}
`;

interface SandboxInstance {
  id?: string;
  status: string;
  domain: (port: number) => string;
  runCommand: (params: RunCommandOptions) => Promise<CommandResult>;
  stop: () => Promise<void>;
  extendTimeout: (durationMs: number) => Promise<void>;
}

interface RunCommandOptions {
  cmd: string;
  args?: string[];
  stderr?: NodeJS.WritableStream;
  stdout?: NodeJS.WritableStream;
  detached?: boolean;
  sudo?: boolean;
  env?: Record<string, string>;
}

interface CommandResult {
  exitCode: number;
  stdout: () => Promise<string>;
  stderr: () => Promise<string>;
}

export type SandboxProgress =
  | { step: "creating"; message: string }
  | { step: "installing"; message: string }
  | { step: "starting"; message: string }
  | { step: "ready"; message: string }
  | { step: "error"; message: string };

export interface SandboxConfig {
  templateUrl?: string;
  timeout?: number;
  vcpus?: number;
  ports?: number[];
  env?: Record<string, string>;
  organizationId?: string;
  projectId?: string;
  onProgress?: (progress: SandboxProgress) => void;
}

export interface SandboxSessionData {
  sandboxId: string;
  sandboxUrl: string;
  status: "initializing" | "ready" | "generating" | "error" | "stopped";
  devServerUrl?: string;
  startedAt?: Date;
}

const DEFAULT_TEMPLATE_URL =
  "https://github.com/elizaOS/sandbox-template-cloud.git";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

declare global {
  var __sandboxInstances: Map<string, SandboxInstance> | undefined;
}

const getActiveSandboxes = (): Map<string, SandboxInstance> => {
  if (!global.__sandboxInstances) {
    global.__sandboxInstances = new Map<string, SandboxInstance>();
  }
  return global.__sandboxInstances;
};

function getSandboxCredentials() {
  const hasOIDC = !!process.env.VERCEL_OIDC_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const token = process.env.VERCEL_TOKEN;
  const hasAccessToken = !!(teamId && projectId && token);
  return { hasOIDC, hasAccessToken, teamId, projectId, token };
}

function extractSandboxIdFromUrl(url: string): string {
  const hostname = new URL(url).hostname;
  return hostname.split(".")[0] || `sandbox-${crypto.randomUUID().slice(0, 8)}`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "install_packages",
    description:
      "Install packages (pnpm/npm). Use this BEFORE writing files that import external packages.",
    input_schema: {
      type: "object" as const,
      properties: {
        packages: {
          type: "array",
          items: { type: "string" },
          description: "Package names to install",
        },
      },
      required: ["packages"],
    },
  },
  {
    name: "write_file",
    description:
      "Write or update a file. The build status will be checked automatically after writing.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path (e.g., 'src/app/page.tsx')",
        },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "read_file",
    description: "Read a file's content.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "check_build",
    description:
      "Check if the app builds successfully and get any error messages. Use this after making changes to verify they work.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_files",
    description: "List files in a directory.",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string", description: "Directory path" } },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Command to run" },
      },
      required: ["command"],
    },
  },
];

const getDefaultSystemPrompt = () =>
  buildFullAppPrompt({
    templateType: "blank",
    includeAnalytics: true,
    includeMonetization: false,
  });

const ALLOWED_DIRECTORIES = [
  "src/",
  "app/",
  "components/",
  "lib/",
  "public/",
  "styles/",
  "pages/",
  "utils/",
  "hooks/",
  "types/",
  "context/",
  "store/",
  "services/",
  "api/",
  "layouts/",
  "templates/",
  "features/",
  "modules/",
  "assets/",
  "config/",
];

const ALLOWED_ROOT_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^bun\.lockb$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^tsconfig.*\.json$/,
  /^next\.config\.(ts|js|mjs)$/,
  /^tailwind\.config\.(ts|js)$/,
  /^postcss\.config\.(js|mjs)$/,
  /^.*\.md$/,
  /^.*\.txt$/,
  /^LICENSE.*$/,
  /^\.gitignore$/,
  /^\.eslintrc\.(js|json)$/,
  /^eslint\.config\.(js|mjs)$/,
  /^\.prettierrc(\.json)?$/,
  /^prettier\.config\.(js|mjs)$/,
  /^\.editorconfig$/,
  /^\.nvmrc$/,
  /^\.node-version$/,
  /^\.env(\.[a-z]+)?\.example$/,
];

const ALLOWED_COMMANDS = [
  "pnpm",
  "npm",
  "npx",
  "node",
  "tsc",
  "next",
  "prettier",
  "eslint",
  "cat",
  "ls",
  "pwd",
  "echo",
  "head",
  "tail",
  "grep",
  "find",
  "wc",
];

const BLOCKED_COMMAND_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /curl\s/i,
  /wget\s/i,
  /chmod\s/i,
  /chown\s/i,
  /sudo\s/i,
  /eval\s/i,
  /exec\s/i,
  /\|\s*(bash|sh|zsh)/i,
  />\s*\/etc\//i,
  /\.env(?!\.(example|sample|template)\b)/i,
  /process\.env/i,
  /export\s+\w+=/i,
];

function isCommandAllowed(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmed = command.trim();
  const baseCommand = trimmed.split(/\s+/)[0];

  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: `Command contains blocked pattern: ${pattern}`,
      };
    }
  }

  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    return {
      allowed: false,
      reason: `Command '${baseCommand}' not in allowlist. Allowed: ${ALLOWED_COMMANDS.join(", ")}`,
    };
  }

  return { allowed: true };
}

function isPathAllowed(filePath: string): boolean {
  const normalized = filePath.replace(/^\.\//, "").replace(/\.\.\//g, "");

  if (normalized.includes("..")) {
    return false;
  }

  if (ALLOWED_DIRECTORIES.some((dir) => normalized.startsWith(dir))) {
    return true;
  }

  if (!normalized.includes("/")) {
    return ALLOWED_ROOT_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  return false;
}

async function writeFileViaSh(
  sandbox: SandboxInstance,
  filePath: string,
  content: string
): Promise<void> {
  if (!isPathAllowed(filePath)) {
    throw new Error(
      `Path not allowed: ${filePath}. Files must be in allowed directories (${ALLOWED_DIRECTORIES.join(", ")}) or match allowed root patterns (*.md, *.txt, config files, etc.)`
    );
  }

  const base64Content = Buffer.from(content, "utf-8").toString("base64");
  const dir = filePath.split("/").slice(0, -1).join("/");

  if (dir) {
    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dir] });
  }

  const script = `require('fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2], 'base64').toString('utf-8'))`;
  const result = await sandbox.runCommand({
    cmd: "node",
    args: ["-e", script, filePath, base64Content],
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to write ${filePath}: ${await result.stderr()}`);
  }
}

async function readFileViaSh(
  sandbox: SandboxInstance,
  filePath: string
): Promise<string | null> {
  const result = await sandbox.runCommand({ cmd: "cat", args: [filePath] });
  return result.exitCode === 0 ? await result.stdout() : null;
}

async function listFilesViaSh(
  sandbox: SandboxInstance,
  dirPath: string
): Promise<string[]> {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `find ${dirPath} -type f 2>/dev/null | head -50`],
  });
  return result.exitCode === 0
    ? (await result.stdout()).split("\n").filter(Boolean)
    : [];
}

async function installPackages(
  sandbox: SandboxInstance,
  packages: string[]
): Promise<string> {
  if (!packages || packages.length === 0) return "No packages specified";

  logger.info("Installing packages", { packages });

  let result = await sandbox.runCommand({
    cmd: "pnpm",
    args: ["add", ...packages],
  });

  if (result.exitCode !== 0) {
    logger.info("pnpm failed, trying npm", { packages });
    result = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", ...packages],
    });
  }

  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    return `Failed to install: ${stderr}`;
  }

  return `Installed: ${packages.join(", ")}`;
}

async function installDependencies(sandbox: SandboxInstance): Promise<string> {
  logger.info("Installing dependencies from package.json");

  let result = await sandbox.runCommand({
    cmd: "pnpm",
    args: ["install"],
  });

  if (result.exitCode !== 0) {
    logger.info("pnpm install failed, trying npm install");
    result = await sandbox.runCommand({
      cmd: "npm",
      args: ["install"],
    });
  }

  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    logger.warn("Failed to install dependencies", { stderr });
    return `Failed to install dependencies: ${stderr}`;
  }

  return "Dependencies installed successfully";
}

async function checkBuild(sandbox: SandboxInstance): Promise<string> {
  await new Promise((r) => setTimeout(r, 2000));

  const logsResult = await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "tail -100 /tmp/next-dev.log 2>/dev/null | grep -i -E 'error|failed|cannot|warning' | tail -20",
    ],
  });
  const logs = await logsResult.stdout();

  const curlResult = await sandbox.runCommand({
    cmd: "curl",
    args: ["-s", "-w", "\n---STATUS:%{http_code}---", "http://localhost:3000"],
  });
  const response = await curlResult.stdout();

  const statusMatch = response.match(/---STATUS:(\d+)---/);
  const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
  const body = response.replace(/---STATUS:\d+---/, "");

  const errors: string[] = [];

  if (statusCode >= 400 || statusCode === 0) {
    errors.push(`HTTP ${statusCode}: Page failed to load`);
  }

  const errorPatterns = [
    /Error:([^<]+)/gi,
    /Cannot ([^<]+)/gi,
    /Module not found([^<]+)/gi,
    /SyntaxError([^<]+)/gi,
    /TypeError([^<]+)/gi,
    /Build Error/gi,
    /CssSyntaxError([^<]+)/gi,
  ];

  for (const pattern of errorPatterns) {
    const matches = body.matchAll(pattern);
    for (const match of matches) {
      const err = match[0].substring(0, 200).trim();
      if (!errors.includes(err)) {
        errors.push(err);
      }
    }
  }

  if (logs.trim()) {
    const logErrors = logs
      .split("\n")
      .filter((l) => l.trim())
      .slice(0, 5);
    errors.push(...logErrors);
  }

  if (errors.length === 0) {
    return "BUILD OK - No errors detected!";
  }

  return `BUILD ERRORS:\n${[...new Set(errors)].slice(0, 10).join("\n")}\n\nPlease fix these errors!`;
}

export class SandboxService {
  private anthropic: Anthropic | null = null;

  private getAnthropicClient(): Anthropic {
    if (!this.anthropic) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.anthropic;
  }

  async create(config: SandboxConfig = {}): Promise<SandboxSessionData> {
    const {
      templateUrl = DEFAULT_TEMPLATE_URL,
      timeout = DEFAULT_TIMEOUT_MS,
      vcpus = 4,
      ports = [3000],
      env = {},
      onProgress,
    } = config;

    const mergedEnv = { ...env };
    const creds = getSandboxCredentials();

    if (!creds.hasOIDC && !creds.hasAccessToken) {
      throw new Error(
        "Vercel Sandbox credentials not configured. Run 'vercel env pull' to get OIDC token, or set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID."
      );
    }

    const { Sandbox } = await import("@vercel/sandbox");

    logger.info("Creating sandbox", { templateUrl, vcpus });
    onProgress?.({ step: "creating", message: "Creating sandbox instance..." });

    const createOptions: Record<string, unknown> = {
      source: { url: templateUrl, type: "git" },
      resources: { vcpus },
      timeout,
      ports,
      runtime: "node22",
    };

    if (creds.hasAccessToken) {
      createOptions.teamId = creds.teamId;
      createOptions.projectId = creds.projectId;
      createOptions.token = creds.token;
    }

    let sandbox: SandboxInstance;
    try {
      sandbox = (await Sandbox.create(createOptions)) as SandboxInstance;
    } catch (error) {
      if (error instanceof Error && error.message.includes("OIDC")) {
        throw new Error(
          `OIDC token expired or invalid. Run 'vercel env pull' to refresh it. Original error: ${error.message}`
        );
      }
      throw error;
    }
    const devServerUrl = sandbox.domain(3000);
    const sandboxId = sandbox.id ?? extractSandboxIdFromUrl(devServerUrl);

    logger.info("Sandbox created", { sandboxId, devServerUrl });
    getActiveSandboxes().set(sandboxId, sandbox);
    onProgress?.({ step: "creating", message: "Sandbox instance created" });

    logger.info("Installing dependencies", { sandboxId });
    onProgress?.({ step: "installing", message: "Installing dependencies..." });
    let install = await sandbox.runCommand({ cmd: "pnpm", args: ["install"] });
    if (install.exitCode !== 0) {
      install = await sandbox.runCommand({ cmd: "npm", args: ["install"] });
      if (install.exitCode !== 0) {
        throw new Error(`Install failed: ${await install.stderr()}`);
      }
    }

    onProgress?.({ step: "installing", message: "Dependencies installed" });

    logger.info("Writing SDK files", { sandboxId });
    onProgress?.({ step: "installing", message: "Setting up SDK..." });

    const srcCheck = await sandbox.runCommand({ cmd: "test", args: ["-d", "src"] });
    const useSrc = srcCheck.exitCode === 0;
    const libPath = useSrc ? "src/lib" : "lib";
    const hooksPath = useSrc ? "src/hooks" : "hooks";

    logger.info("SDK paths determined", { sandboxId, useSrc, libPath, hooksPath });

    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", libPath, hooksPath] });

    const sdkBase64 = Buffer.from(ELIZA_SDK_FILE, "utf-8").toString("base64");
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `echo '${sdkBase64}' | base64 -d > ${libPath}/eliza.ts`],
    });

    const hookBase64 = Buffer.from(ELIZA_HOOK_FILE, "utf-8").toString("base64");
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `echo '${hookBase64}' | base64 -d > ${hooksPath}/use-eliza.ts`],
    });

    logger.info("SDK files written", { sandboxId });

    if (Object.keys(mergedEnv).length > 0) {
      logger.info("Writing .env.local", { sandboxId, envCount: Object.keys(mergedEnv).length });
      const envContent = Object.entries(mergedEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      const envBase64 = Buffer.from(envContent, "utf-8").toString("base64");
      await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", `echo '${envBase64}' | base64 -d > .env.local`],
      });
    }

    logger.info("Starting dev server", {
      sandboxId,
      envVarCount: Object.keys(mergedEnv).length,
    });
    onProgress?.({ step: "starting", message: "Starting dev server..." });
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "pnpm dev 2>&1 | tee /tmp/next-dev.log &"],
      detached: true,
      env: mergedEnv,
    });

    await this.waitForDevServer(sandbox, 3000);

    logger.info("Sandbox ready", { sandboxId, devServerUrl });
    onProgress?.({ step: "ready", message: "Sandbox is ready!" });

    return {
      sandboxId,
      sandboxUrl: devServerUrl,
      status: "ready",
      devServerUrl,
      startedAt: new Date(),
    };
  }

  private async waitForDevServer(
    sandbox: SandboxInstance,
    port: number,
    maxAttempts = 45
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await sandbox.runCommand({
        cmd: "curl",
        args: [
          "-s",
          "-o",
          "/dev/null",
          "-w",
          "%{http_code}",
          `http://localhost:${port}`,
        ],
      });
      const statusCode = await result.stdout();
      if (statusCode === "200" || statusCode === "304") return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Dev server did not start within ${maxAttempts}s`);
  }

  private async callAnthropicWithRetry(
    anthropic: Anthropic,
    params: Anthropic.MessageCreateParams,
    maxRetries = 3
  ): Promise<Anthropic.Message> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await anthropic.messages.create(params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();

        const isRetryable =
          errorMessage.includes("overloaded") ||
          errorMessage.includes("rate limit") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("network") ||
          errorMessage.includes("econnreset") ||
          errorMessage.includes("socket hang up") ||
          errorMessage.includes("529") ||
          errorMessage.includes("503") ||
          errorMessage.includes("502");

        if (!isRetryable || attempt === maxRetries - 1) {
          throw lastError;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        logger.warn("Anthropic API call failed, retrying", {
          attempt: attempt + 1,
          maxRetries,
          error: errorMessage,
          delayMs: delay,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Failed to call Anthropic API");
  }

  async executeClaudeCode(
    sandboxId: string,
    prompt: string,
    options: {
      systemPrompt?: string;
      onToolUse?: (tool: string, input: unknown, result: string) => void;
      onThinking?: (text: string) => void;
      abortSignal?: AbortSignal;
      timeoutMs?: number;
    } = {}
  ): Promise<{ output: string; filesAffected: string[]; success: boolean; error?: string }> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    const { abortSignal, timeoutMs = 5 * 60 * 1000 } = options;

    if (abortSignal?.aborted) {
      throw new Error("Operation aborted before starting");
    }

    const operationStartTime = Date.now();

    const checkTimeout = () => {
      if (Date.now() - operationStartTime > timeoutMs) {
        throw new Error(`Operation timed out after ${timeoutMs / 1000}s`);
      }
    };

    const checkAbort = () => {
      if (abortSignal?.aborted) {
        throw new Error("Operation aborted by client");
      }
    };

    logger.info("Starting Claude execution", {
      sandboxId,
      promptLength: prompt.length,
      timeoutMs,
    });

    const anthropic = this.getAnthropicClient();
    const filesAffected: string[] = [];
    let outputText = "";

    try {
      checkAbort();

      const pageContent = await readFileViaSh(sandbox, "src/app/page.tsx");
      const globalsCss = await readFileViaSh(sandbox, "src/app/globals.css");

      const contextPrompt = `CURRENT FILES:

=== src/app/page.tsx ===
${pageContent || "(file not found)"}

=== src/app/globals.css ===
${globalsCss || "(file not found)"}

---
USER REQUEST: ${prompt}

REMEMBER:
1. Use standard Tailwind classes only (no custom utilities)
2. Keep globals.css minimal
3. Use check_build after changes to verify
4. Fix any errors before finishing`;

      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: contextPrompt },
      ];
      let continueLoop = true;
      let iteration = 0;
      const MAX_ITERATIONS = 50;

      while (continueLoop && iteration < MAX_ITERATIONS) {
        iteration++;
        checkAbort();
        checkTimeout();

        const response = await this.callAnthropicWithRetry(anthropic, {
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8192,
          system: options.systemPrompt || getDefaultSystemPrompt(),
          tools: TOOLS,
          messages,
        });

        logger.info("Claude response", {
          sandboxId,
          stopReason: response.stop_reason,
          iteration,
        });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          checkAbort();

          if (block.type === "text") {
            if (options.onThinking && block.text.trim()) {
              try {
                options.onThinking(block.text);
              } catch {
              }
            }
            outputText += block.text + "\n";
          } else if (block.type === "tool_use") {
            logger.info("Tool use", { sandboxId, tool: block.name, iteration });

            let result: string;
            try {
              if (block.name === "install_packages") {
                const { packages } = block.input as { packages: string[] };
                result = await installPackages(sandbox, packages);
              } else if (block.name === "write_file") {
                const { path, content } = block.input as {
                  path: string;
                  content: string;
                };

                if (content === undefined || content === null) {
                  result = `Error: write_file called with empty content for ${path}. Please provide the file content.`;
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: result,
                  });
                  continue;
                }
                await writeFileViaSh(sandbox, path, content);
                filesAffected.push(path);

                await new Promise((r) => setTimeout(r, 1500));
                const buildStatus = await checkBuild(sandbox);
                result = `Wrote ${path}\n\nBuild Status: ${buildStatus}`;

                if (buildStatus.includes("BUILD ERRORS")) {
                  result += `\n\nPlease fix the errors above!`;
                }

                logger.info("File written", {
                  sandboxId,
                  path,
                  buildOk: !buildStatus.includes("BUILD ERRORS"),
                });
              } else if (block.name === "read_file") {
                const { path } = block.input as { path: string };
                const content = await readFileViaSh(sandbox, path);
                result = content || `File not found: ${path}`;
              } else if (block.name === "check_build") {
                result = await checkBuild(sandbox);
                logger.info("Build check", {
                  sandboxId,
                  ok: result.includes("BUILD OK"),
                });
              } else if (block.name === "list_files") {
                const { path } = block.input as { path: string };
                const files = await listFilesViaSh(sandbox, path);
                result = files.join("\n") || `Empty: ${path}`;
              } else if (block.name === "run_command") {
                const { command } = block.input as { command: string };
                const commandCheck = isCommandAllowed(command);
                if (!commandCheck.allowed) {
                  result = `Command blocked: ${commandCheck.reason}`;
                  logger.warn("Blocked command attempt", {
                    sandboxId,
                    command,
                    reason: commandCheck.reason,
                  });
                } else {
                  const r = await sandbox.runCommand({
                    cmd: "sh",
                    args: ["-c", command],
                  });
                  result =
                    `Exit ${r.exitCode}: ${await r.stdout()} ${await r.stderr()}`.trim();
                }
              } else {
                result = `Unknown tool: ${block.name}`;
              }
            } catch (toolError) {
              const toolErrorMsg = toolError instanceof Error ? toolError.message : String(toolError);
              logger.error("Tool execution error", {
                sandboxId,
                tool: block.name,
                error: toolErrorMsg,
              });
              result = `Error executing ${block.name}: ${toolErrorMsg}`;
            }

            if (options.onToolUse) {
              try {
                options.onToolUse(block.name, block.input, result);
              } catch {
              }
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        if (toolResults.length > 0) {
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: toolResults });
        }

        if (response.stop_reason === "end_turn" || toolResults.length === 0) {
          continueLoop = false;
        }
      }

      checkAbort();

      const finalBuild = await checkBuild(sandbox);
      if (finalBuild.includes("BUILD ERRORS")) {
        outputText += `\n\nNote: There may still be build errors. ${finalBuild}`;
      }

      logger.info("Claude complete", {
        sandboxId,
        filesAffected: filesAffected.length,
        iteration,
        durationMs: Date.now() - operationStartTime,
      });

      return {
        output: outputText || "Changes applied!",
        filesAffected: [...new Set(filesAffected)],
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("Claude execution failed", {
        sandboxId,
        error: errorMessage,
        filesAffected: filesAffected.length,
        durationMs: Date.now() - operationStartTime,
      });

      if (errorMessage.includes("aborted") || errorMessage.includes("cancelled")) {
        throw error;
      }

      return {
        output: outputText || "Operation failed",
        filesAffected: [...new Set(filesAffected)],
        success: false,
        error: errorMessage,
      };
    }
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    const content = await readFileViaSh(sandbox, path);
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }

  async writeFile(
    sandboxId: string,
    path: string,
    content: string
  ): Promise<void> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    await writeFileViaSh(sandbox, path, content);
  }

  async listFiles(sandboxId: string, path: string): Promise<string[]> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    return await listFilesViaSh(sandbox, path);
  }

  async checkBuild(sandboxId: string): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    return await checkBuild(sandbox);
  }

  async installPackages(
    sandboxId: string,
    packages: string[]
  ): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    return await installPackages(sandbox, packages);
  }

  async installDependencies(sandboxId: string): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    return await installDependencies(sandbox);
  }

  async extendTimeout(sandboxId: string, durationMs: number): Promise<void> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    await sandbox.extendTimeout(durationMs);
  }

  async getLogs(sandboxId: string, tail: number = 50): Promise<string[]> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) return [];
    const logsResult = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `tail -${tail} /tmp/next-dev.log 2>/dev/null || echo ""`],
    });
    const stdout = await logsResult.stdout();
    return stdout.split("\n").filter((l: string) => l.trim());
  }

  async backupFiles(
    sandboxId: string,
    sessionId: string,
    options: {
      snapshotType?: "auto" | "manual" | "pre_expiry" | "prompt_complete";
      specificFiles?: string[];
    } = {}
  ): Promise<{ filesBackedUp: number; totalSize: number }> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) {
      logger.warn("Cannot backup - sandbox not found", { sandboxId });
      return { filesBackedUp: 0, totalSize: 0 };
    }

    const { snapshotType = "auto", specificFiles } = options;

    logger.info("Starting file backup", { sandboxId, sessionId, snapshotType });

    const filesToBackup = specificFiles || await this.getModifiedFiles(sandboxId);

    if (filesToBackup.length === 0) {
      logger.info("No files to backup", { sandboxId });
      return { filesBackedUp: 0, totalSize: 0 };
    }

    const snapshots: NewSessionFileSnapshot[] = [];
    let totalSize = 0;

    for (const filePath of filesToBackup) {
      try {
        const content = await readFileViaSh(sandbox, filePath);
        if (content === null) continue;

        const contentHash = crypto.createHash("sha256").update(content).digest("hex");
        const fileSize = Buffer.byteLength(content, "utf-8");
        totalSize += fileSize;

        snapshots.push({
          sandbox_session_id: sessionId,
          file_path: filePath,
          content,
          content_hash: contentHash,
          file_size: fileSize,
          snapshot_type: snapshotType,
        });
      } catch (error) {
        logger.warn("Failed to read file for backup", { sandboxId, filePath, error });
      }
    }

    if (snapshots.length === 0) {
      return { filesBackedUp: 0, totalSize: 0 };
    }

    await dbWrite.transaction(async (tx) => {
      for (const snapshot of snapshots) {
        await tx
          .delete(sessionFileSnapshots)
          .where(
            and(
              eq(sessionFileSnapshots.sandbox_session_id, sessionId),
              eq(sessionFileSnapshots.file_path, snapshot.file_path)
            )
          );
      }
      await tx.insert(sessionFileSnapshots).values(snapshots);
    });

    logger.info("File backup completed", {
      sandboxId,
      sessionId,
      filesBackedUp: snapshots.length,
      totalSize,
    });

    return { filesBackedUp: snapshots.length, totalSize };
  }

  async restoreFiles(
    sandboxId: string,
    sessionId: string,
    options: {
      onProgress?: (current: number, total: number, filePath: string) => void;
    } = {}
  ): Promise<{ filesRestored: number; errors: string[] }> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found for restore`);
    }

    logger.info("Starting file restore", { sandboxId, sessionId });

    const startTime = Date.now();
    const errors: string[] = [];

    const [restoreRecord] = await dbWrite
      .insert(sessionRestoreHistory)
      .values({
        sandbox_session_id: sessionId,
        new_sandbox_id: sandboxId,
        status: "in_progress",
      })
      .returning();

    const snapshots = await dbRead
      .select()
      .from(sessionFileSnapshots)
      .where(eq(sessionFileSnapshots.sandbox_session_id, sessionId))
      .orderBy(desc(sessionFileSnapshots.created_at));

    const latestSnapshots = new Map<string, typeof snapshots[0]>();
    for (const snapshot of snapshots) {
      if (!latestSnapshots.has(snapshot.file_path)) {
        latestSnapshots.set(snapshot.file_path, snapshot);
      }
    }

    const filesToRestore = Array.from(latestSnapshots.values());
    let filesRestored = 0;

    for (let i = 0; i < filesToRestore.length; i++) {
      const snapshot = filesToRestore[i];
      try {
        options.onProgress?.(i + 1, filesToRestore.length, snapshot.file_path);
        await writeFileViaSh(sandbox, snapshot.file_path, snapshot.content);
        filesRestored++;
        logger.debug("Restored file", { sandboxId, filePath: snapshot.file_path });
      } catch (error) {
        const errorMsg = `Failed to restore ${snapshot.file_path}: ${error instanceof Error ? error.message : "Unknown error"}`;
        errors.push(errorMsg);
        logger.warn("Failed to restore file", { sandboxId, filePath: snapshot.file_path, error });
      }
    }

    const duration = Date.now() - startTime;

    await dbWrite
      .update(sessionRestoreHistory)
      .set({
        files_restored: filesRestored,
        restore_duration_ms: duration,
        status: errors.length === 0 ? "completed" : "completed",
        error_message: errors.length > 0 ? errors.join("; ") : null,
        completed_at: new Date(),
      })
      .where(eq(sessionRestoreHistory.id, restoreRecord.id));

    logger.info("File restore completed", {
      sandboxId,
      sessionId,
      filesRestored,
      errors: errors.length,
      durationMs: duration,
    });

    return { filesRestored, errors };
  }

  async getModifiedFiles(sandboxId: string): Promise<string[]> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) return [];

    const dirsToScan = ["src", "app", "components", "lib", "public", "styles"];
    const allFiles: string[] = [];

    for (const dir of dirsToScan) {
      try {
        const files = await listFilesViaSh(sandbox, dir);
        allFiles.push(...files.filter((f) => !f.includes("node_modules") && !f.includes(".next")));
      } catch {
        continue;
      }
    }

    const configFiles = [
      "package.json",
      "tailwind.config.ts",
      "tailwind.config.js",
      "next.config.ts",
      "next.config.js",
      "tsconfig.json",
    ];

    for (const file of configFiles) {
      const content = await readFileViaSh(sandbox, file);
      if (content) allFiles.push(file);
    }

    return [...new Set(allFiles)];
  }

  async hasSnapshots(sessionId: string): Promise<boolean> {
    const result = await dbRead
      .select({ count: sessionFileSnapshots.id })
      .from(sessionFileSnapshots)
      .where(eq(sessionFileSnapshots.sandbox_session_id, sessionId))
      .limit(1);
    return result.length > 0;
  }

  async getSnapshotStats(sessionId: string): Promise<{
    fileCount: number;
    totalSize: number;
    lastBackup: Date | null;
  }> {
    const snapshots = await dbRead
      .select()
      .from(sessionFileSnapshots)
      .where(eq(sessionFileSnapshots.sandbox_session_id, sessionId))
      .orderBy(desc(sessionFileSnapshots.created_at));

    if (snapshots.length === 0) {
      return { fileCount: 0, totalSize: 0, lastBackup: null };
    }

    const latestSnapshots = new Map<string, typeof snapshots[0]>();
    for (const snapshot of snapshots) {
      if (!latestSnapshots.has(snapshot.file_path)) {
        latestSnapshots.set(snapshot.file_path, snapshot);
      }
    }

    const uniqueSnapshots = Array.from(latestSnapshots.values());
    const totalSize = uniqueSnapshots.reduce((sum, s) => sum + s.file_size, 0);
    const lastBackup = uniqueSnapshots[0]?.created_at || null;

    return {
      fileCount: uniqueSnapshots.length,
      totalSize,
      lastBackup,
    };
  }

  async stop(sandboxId: string): Promise<void> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) return;
    await sandbox.stop();
    getActiveSandboxes().delete(sandboxId);
    logger.info("Sandbox stopped", { sandboxId });
  }

  getStatus(sandboxId: string): "running" | "stopped" | "unknown" {
    return getActiveSandboxes().has(sandboxId) ? "running" : "unknown";
  }

  getActiveSandboxes(): string[] {
    return Array.from(getActiveSandboxes().keys());
  }

  static isConfigured(): boolean {
    const creds = getSandboxCredentials();
    return creds.hasOIDC || creds.hasAccessToken;
  }
}

export const sandboxService = new SandboxService();
