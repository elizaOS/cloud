import { logger } from "@/lib/utils/logger";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  loadSandboxSecrets,
  isSecretsConfigured,
} from "@/lib/services/secrets";

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
      "Install packages (bun). Use this BEFORE writing files that import external packages.",
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

const SYSTEM_PROMPT = `You are an expert Next.js developer building production-ready apps on Eliza Cloud.

## Tech Stack
Next.js 15 (App Router) | React 19 | TypeScript | Tailwind CSS 4

## Project Structure
\`\`\`
src/
├── app/           # Pages: layout.tsx, page.tsx, [routes]/
├── components/
│   ├── ui/        # button.tsx, card.tsx, input.tsx
│   └── layout/    # header.tsx, sidebar.tsx
├── lib/
│   ├── eliza.ts   # Eliza Cloud API client ⭐
│   └── utils.ts
├── hooks/
│   └── use-eliza.ts  # React hook for Eliza ⭐
└── types/
\`\`\`

## ⚡ WORKFLOW
1. install_packages (if needed)
2. Create lib/eliza.ts (API client)
3. Create hooks/use-eliza.ts
4. Create components/ui/* 
5. Create components/layout/*
6. Create app pages
7. check_build after each file → fix → repeat

## 🎨 TAILWIND CSS 4
- Standard classes ONLY: bg-gray-900, text-white, border-gray-700
- NO custom utilities (border-border, bg-background)
- globals.css: just @tailwind directives

## 📁 REQUIRED: lib/eliza.ts
\`\`\`typescript
const API = '';
class ElizaClient {
  constructor(private apiKey: string) {}
  private async fetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(\`\${API}\${path}\`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.apiKey, ...opts.headers },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  chat = (messages: Array<{role: string; content: string}>, model = 'gpt-4o') =>
    this.fetch('/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages, model }) });
  async *chatStream(messages: Array<{role: string; content: string}>, model = 'gpt-4o') {
    const res = await fetch('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.apiKey },
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
  generateImage = (prompt: string) => this.fetch<{url: string}>('/api/v1/generate-image', { method: 'POST', body: JSON.stringify({ prompt }) });
  generateVideo = (prompt: string) => this.fetch<{jobId: string}>('/api/v1/generate-video', { method: 'POST', body: JSON.stringify({ prompt }) });
  listFiles = () => this.fetch<{items: Array<{id: string; url: string}>}>('/api/v1/storage');
  getBalance = () => this.fetch<{balance: number}>('/api/v1/credits/balance');
  getUsage = (limit = 20) => this.fetch<{usage: Array<{type: string; cost: number}>}>(\`/api/v1/usage?limit=\${limit}\`);
  listAgents = () => this.fetch<{agents: Array<{id: string; name: string}>}>('/api/v1/agents');
  chatWithAgent = (agentId: string, message: string, roomId?: string) =>
    this.fetch<{response: string; roomId: string}>('/api/v1/agents/chat', { method: 'POST', body: JSON.stringify({ agentId, message, roomId }) });
  saveMemory = (content: string, roomId: string, type = 'fact') =>
    this.fetch<{memoryId: string}>('/api/v1/memory', { method: 'POST', body: JSON.stringify({ content, roomId, type }) });
  searchMemories = (query: string, roomId?: string) =>
    this.fetch<{memories: Array<{id: string; content: string}>}>('/api/v1/memory/search', { method: 'POST', body: JSON.stringify({ query, roomId }) });
  listWorkflows = () => this.fetch<{workflows: Array<{id: string; name: string}>}>('/api/v1/n8n/workflows');
  executeWorkflow = (id: string, data: Record<string, unknown>) =>
    this.fetch<{executionId: string}>(\`/api/v1/n8n/workflows/\${id}/execute\`, { method: 'POST', body: JSON.stringify({ data }) });
}
export const eliza = (apiKey: string) => new ElizaClient(apiKey);
\`\`\`

## 📁 REQUIRED: hooks/use-eliza.ts
\`\`\`typescript
'use client';
import { useState, useMemo, useCallback } from 'react';
import { eliza } from '@/lib/eliza';
export function useEliza(apiKey: string) {
  const client = useMemo(() => eliza(apiKey), [apiKey]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call = useCallback(async <T>(fn: (c: ReturnType<typeof eliza>) => Promise<T>) => {
    setLoading(true); setError(null);
    try { return await fn(client); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); return null; }
    finally { setLoading(false); }
  }, [client]);
  return { client, call, loading, error };
}
\`\`\`

## 🔑 API Key
- Use process.env.NEXT_PUBLIC_ELIZA_API_KEY
- Or prompt user to enter (store in localStorage)

## 📋 API Quick Reference
| Endpoint | Method | Use |
|----------|--------|-----|
| /api/v1/chat/completions | POST | AI chat (stream: true) |
| /api/v1/generate-image | POST | Images |
| /api/v1/generate-video | POST | Videos |
| /api/v1/storage | GET | List files |
| /api/v1/credits/balance | GET | Check balance |
| /api/v1/agents | GET | List agents |
| /api/v1/agents/chat | POST | Chat with agent |
| /api/v1/memory | POST | Save memory |
| /api/v1/memory/search | POST | Search memories |
| /api/v1/n8n/workflows | GET | List workflows |
| /api/v1/n8n/workflows/:id/execute | POST | Run workflow |

BUILD COMPLETE MULTI-PAGE APPS with proper architecture!`;

const ALLOWED_PATHS = [
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
  "package.json",
  "tsconfig.json",
  "tailwind.config.ts",
  "tailwind.config.js",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "postcss.config.js",
  "postcss.config.mjs",
  ".env.local",
  ".env.example",
];

function isPathAllowed(filePath: string): boolean {
  const normalized = filePath.replace(/^\.\//, "").replace(/\.\.\//g, "");
  return ALLOWED_PATHS.some(
    (allowed) => normalized.startsWith(allowed) || normalized === allowed,
  );
}

async function writeFileViaSh(
  sandbox: SandboxInstance,
  filePath: string,
  content: string,
): Promise<void> {
  if (!isPathAllowed(filePath)) {
    throw new Error(
      `Path not allowed: ${filePath}. Files must be in: ${ALLOWED_PATHS.join(", ")}`,
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
  filePath: string,
): Promise<string | null> {
  const result = await sandbox.runCommand({ cmd: "cat", args: [filePath] });
  return result.exitCode === 0 ? await result.stdout() : null;
}

async function listFilesViaSh(
  sandbox: SandboxInstance,
  dirPath: string,
): Promise<string[]> {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `find ${dirPath} -type f 2>/dev/null | head -50`],
  });
  return result.exitCode === 0
    ? (await result.stdout()).split("\n").filter(Boolean)
    : [];
}

/**
 * Install packages (bun)
 */
async function installPackages(
  sandbox: SandboxInstance,
  packages: string[],
): Promise<string> {
  if (!packages || packages.length === 0) return "No packages specified";

  logger.info("Installing packages", { packages });

  let result = await sandbox.runCommand({
    cmd: "bun",
    args: ["add", ...packages],
  });
  if (result.exitCode !== 0) {
    result = await sandbox.runCommand({
      cmd: "pnpm",
      args: ["add", ...packages],
    });
  }

  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    return `❌ Install failed: ${stderr}`;
  }

  return `✅ Installed: ${packages.join(", ")}`;
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
    return "✅ BUILD OK - No errors detected!";
  }

  return `❌ BUILD ERRORS:\n${[...new Set(errors)].slice(0, 10).join("\n")}\n\n⚠️ Please fix these errors!`;
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
      organizationId,
      projectId,
      onProgress,
    } = config;

    const encryptedSecrets =
      organizationId && isSecretsConfigured()
        ? await loadSandboxSecrets({ organizationId, appId: projectId })
        : {};

    const mergedEnv = { ...encryptedSecrets, ...env };
    const creds = getSandboxCredentials();

    if (!creds.hasOIDC && !creds.hasAccessToken) {
      throw new Error(
        "Vercel Sandbox credentials not configured. Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.",
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

    const sandbox = (await Sandbox.create(createOptions)) as SandboxInstance;
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
    maxAttempts = 45,
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

  async executeClaudeCode(
    sandboxId: string,
    prompt: string,
    options: {
      systemPrompt?: string;
      onToolUse?: (tool: string, input: unknown, result: string) => void;
      onThinking?: (text: string) => void;
    } = {},
  ): Promise<{ output: string; filesAffected: string[]; success: boolean }> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    logger.info("Starting Claude execution", {
      sandboxId,
      promptLength: prompt.length,
    });

    const anthropic = this.getAnthropicClient();
    const filesAffected: string[] = [];
    let outputText = "";

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

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        system: options.systemPrompt || SYSTEM_PROMPT,
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
        if (block.type === "text") {
          if (options.onThinking && block.text.trim()) {
            options.onThinking(block.text);
          }
          outputText += block.text + "\n";
        } else if (block.type === "tool_use") {
          logger.info("Tool use", { sandboxId, tool: block.name, iteration });

          let result: string;
          if (block.name === "install_packages") {
            const { packages } = block.input as { packages: string[] };
            result = await installPackages(sandbox, packages);
          } else if (block.name === "write_file") {
            const { path, content } = block.input as {
              path: string;
              content: string;
            };
            await writeFileViaSh(sandbox, path, content);
            filesAffected.push(path);

            await new Promise((r) => setTimeout(r, 1500));
            const buildStatus = await checkBuild(sandbox);
            result = `✅ Wrote ${path}\n\nBuild Status: ${buildStatus}`;

            if (buildStatus.includes("❌")) {
              result += `\n\n⚠️ Please fix the errors above!`;
            }

            logger.info("File written", {
              sandboxId,
              path,
              buildOk: !buildStatus.includes("❌"),
            });
          } else if (block.name === "read_file") {
            const { path } = block.input as { path: string };
            const content = await readFileViaSh(sandbox, path);
            result = content || `File not found: ${path}`;
          } else if (block.name === "check_build") {
            result = await checkBuild(sandbox);
            logger.info("Build check", {
              sandboxId,
              ok: result.includes("✅"),
            });
          } else if (block.name === "list_files") {
            const { path } = block.input as { path: string };
            const files = await listFilesViaSh(sandbox, path);
            result = files.join("\n") || `Empty: ${path}`;
          } else if (block.name === "run_command") {
            const { command } = block.input as { command: string };
            const r = await sandbox.runCommand({
              cmd: "sh",
              args: ["-c", command],
            });
            result =
              `Exit ${r.exitCode}: ${await r.stdout()} ${await r.stderr()}`.trim();
          } else {
            result = `Unknown tool: ${block.name}`;
          }

          if (options.onToolUse) {
            options.onToolUse(block.name, block.input, result);
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

    const finalBuild = await checkBuild(sandbox);
    if (finalBuild.includes("❌")) {
      outputText += `\n\n⚠️ Note: There may still be build errors. ${finalBuild}`;
    }

    logger.info("Claude complete", {
      sandboxId,
      filesAffected: filesAffected.length,
      iteration,
    });

    return {
      output: outputText || "Changes applied!",
      filesAffected: [...new Set(filesAffected)],
      success: true,
    };
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
    content: string,
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
    packages: string[],
  ): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    return await installPackages(sandbox, packages);
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
