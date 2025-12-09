/**
 * Vercel Sandbox Service
 *
 * Manages ephemeral sandbox instances for AI-powered app building.
 * Uses Claude API with tool-use for reliable code generation.
 * Includes build error checking to help Claude fix issues.
 */

import { logger } from "@/lib/utils/logger";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";

// Types for Vercel Sandbox
interface SandboxInstance {
  id?: string;
  status: "creating" | "running" | "stopped" | "error";
  domain: (port: number) => string;
  runCommand: (options: RunCommandOptions) => Promise<CommandResult>;
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

export interface SandboxConfig {
  templateUrl?: string;
  timeout?: number;
  vcpus?: number;
  ports?: number[];
  env?: Record<string, string>;
}

export interface SandboxSessionData {
  sandboxId: string;
  sandboxUrl: string;
  status: "initializing" | "ready" | "generating" | "error" | "stopped";
  devServerUrl?: string;
  startedAt?: Date;
}

const DEFAULT_TEMPLATE_URL = "https://github.com/vercel/sandbox-example-next.git";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// Global storage
declare global {
  // eslint-disable-next-line no-var
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
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0] || `sandbox-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `sandbox-${crypto.randomUUID().slice(0, 8)}`;
  }
}

// Tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: "install_packages",
    description: "Install npm packages. Use this BEFORE writing files that import external packages.",
    input_schema: {
      type: "object" as const,
      properties: {
        packages: {
          type: "array",
          items: { type: "string" },
          description: "Package names to install"
        }
      },
      required: ["packages"]
    }
  },
  {
    name: "write_file",
    description: "Write or update a file. The build status will be checked automatically after writing.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path (e.g., 'src/app/page.tsx')" },
        content: { type: "string", description: "Complete file content" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "read_file",
    description: "Read a file's content.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path to read" }
      },
      required: ["path"]
    }
  },
  {
    name: "check_build",
    description: "Check if the app builds successfully and get any error messages. Use this after making changes to verify they work.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "list_files",
    description: "List files in a directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path" }
      },
      required: ["path"]
    }
  },
  {
    name: "run_command",
    description: "Run a shell command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Command to run" }
      },
      required: ["command"]
    }
  }
];

const SYSTEM_PROMPT = `You are an expert Next.js 16 developer building a live web application.

TECH STACK:
- Next.js 16 with App Router + Turbopack
- React 19
- TypeScript  
- Tailwind CSS 4 (NOT v3!)

⚠️ TAILWIND CSS 4 IMPORTANT:
- Don't use custom utility classes like "border-border" or "bg-background"
- Don't add @layer or @apply rules that reference non-standard utilities
- Use standard Tailwind classes: bg-gray-100, border-gray-200, text-gray-900, etc.
- Keep globals.css simple with just: @tailwind base; @tailwind components; @tailwind utilities;

PROJECT STRUCTURE:
src/app/
├── layout.tsx
├── page.tsx  
├── globals.css (keep it simple!)

⚠️ WORKFLOW - ALWAYS FOLLOW:
1. If you need packages → install_packages first
2. Write your files
3. Use check_build to verify no errors
4. If errors → read the file and FIX them
5. check_build again until clean

WHEN MODIFYING globals.css:
- Keep it minimal
- DON'T add custom CSS variables or @layer rules
- Use standard Tailwind only

Example safe globals.css:
\`\`\`css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, sans-serif;
}
\`\`\`

KEY RULES:
1. Files are in src/app/ (not app/)
2. Write COMPLETE, valid TypeScript
3. Every page needs: export default function
4. Use 'use client' for hooks/event handlers
5. ALWAYS check_build after changes
6. FIX any errors before finishing

BUILD BEAUTIFUL UIs with standard Tailwind classes!`;

/**
 * Write file via shell
 */
async function writeFileViaSh(sandbox: SandboxInstance, filePath: string, content: string): Promise<void> {
  const base64Content = Buffer.from(content, 'utf-8').toString('base64');
  const dir = filePath.split('/').slice(0, -1).join('/');
  
  if (dir) {
    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dir] });
  }
  
  const script = `require('fs').writeFileSync('${filePath}', Buffer.from('${base64Content}', 'base64').toString('utf-8'))`;
  const result = await sandbox.runCommand({ cmd: "node", args: ["-e", script] });
  
  if (result.exitCode !== 0) {
    throw new Error(`Failed to write ${filePath}: ${await result.stderr()}`);
  }
}

async function readFileViaSh(sandbox: SandboxInstance, filePath: string): Promise<string | null> {
  const result = await sandbox.runCommand({ cmd: "cat", args: [filePath] });
  return result.exitCode === 0 ? await result.stdout() : null;
}

async function listFilesViaSh(sandbox: SandboxInstance, dirPath: string): Promise<string[]> {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `find ${dirPath} -type f 2>/dev/null | head -50`],
  });
  return result.exitCode === 0 ? (await result.stdout()).split('\n').filter(Boolean) : [];
}

/**
 * Install npm packages
 */
async function installPackages(sandbox: SandboxInstance, packages: string[]): Promise<string> {
  if (!packages || packages.length === 0) return "No packages specified";

  logger.info("Installing packages", { packages });

  let result = await sandbox.runCommand({ cmd: "pnpm", args: ["add", ...packages] });
  if (result.exitCode !== 0) {
    result = await sandbox.runCommand({ cmd: "npm", args: ["install", ...packages] });
  }

  const stdout = await result.stdout();
  const stderr = await result.stderr();

  if (result.exitCode !== 0) {
    return `❌ Install failed: ${stderr}`;
  }

  return `✅ Installed: ${packages.join(', ')}`;
}

/**
 * Check build status by fetching the page and checking for errors
 */
async function checkBuild(sandbox: SandboxInstance): Promise<string> {
  // Wait for hot reload
  await new Promise(r => setTimeout(r, 2000));

  // Get recent dev server logs
  const logsResult = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", "tail -100 /tmp/next-dev.log 2>/dev/null | grep -i -E 'error|failed|cannot|warning' | tail -20"],
  });
  const logs = await logsResult.stdout();

  // Try to fetch the page
  const curlResult = await sandbox.runCommand({
    cmd: "curl",
    args: ["-s", "-w", "\n---STATUS:%{http_code}---", "http://localhost:3000"],
  });
  const response = await curlResult.stdout();
  
  // Extract status code
  const statusMatch = response.match(/---STATUS:(\d+)---/);
  const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
  const body = response.replace(/---STATUS:\d+---/, '');

  // Check for error indicators in HTML
  const errors: string[] = [];
  
  if (statusCode >= 400 || statusCode === 0) {
    errors.push(`HTTP ${statusCode}: Page failed to load`);
  }

  // Parse error messages from response
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

  // Add log errors
  if (logs.trim()) {
    const logErrors = logs.split('\n').filter(l => l.trim()).slice(0, 5);
    errors.push(...logErrors);
  }

  if (errors.length === 0) {
    return "✅ BUILD OK - No errors detected!";
  }

  return `❌ BUILD ERRORS:\n${[...new Set(errors)].slice(0, 10).join('\n')}\n\n⚠️ Please fix these errors!`;
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
    } = config;

    const creds = getSandboxCredentials();
    
    if (!creds.hasOIDC && !creds.hasAccessToken) {
      throw new Error(
        "Vercel Sandbox credentials not configured. " +
        "Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID."
      );
    }

    try {
      const { Sandbox } = await import("@vercel/sandbox");

      logger.info("Creating sandbox", { templateUrl, vcpus });

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

      const sandbox = await Sandbox.create(createOptions);
      const devServerUrl = sandbox.domain(3000);
      const sandboxId = sandbox.id || extractSandboxIdFromUrl(devServerUrl);

      logger.info("Sandbox created", { sandboxId, devServerUrl });
      getActiveSandboxes().set(sandboxId, sandbox);

      // Install dependencies
      logger.info("Installing dependencies", { sandboxId });
      let install = await sandbox.runCommand({ cmd: "pnpm", args: ["install"] });
      if (install.exitCode !== 0) {
        install = await sandbox.runCommand({ cmd: "npm", args: ["install"] });
        if (install.exitCode !== 0) {
          throw new Error(`Install failed: ${await install.stderr()}`);
        }
      }

      // Start dev server with logging
      logger.info("Starting dev server", { sandboxId });
      await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", "pnpm dev 2>&1 | tee /tmp/next-dev.log &"],
        detached: true,
        env,
      });

      await this.waitForDevServer(sandbox, 3000);

      logger.info("Sandbox ready", { sandboxId, devServerUrl });

      return {
        sandboxId,
        sandboxUrl: devServerUrl,
        status: "ready",
        devServerUrl,
        startedAt: new Date(),
      };
    } catch (error) {
      logger.error("Failed to create sandbox", { error });
      throw error;
    }
  }

  private async waitForDevServer(sandbox: SandboxInstance, port: number, maxAttempts = 45): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await sandbox.runCommand({
          cmd: "curl",
          args: ["-s", "-o", "/dev/null", "-w", "%{http_code}", `http://localhost:${port}`],
        });
        const statusCode = await result.stdout();
        if (statusCode === "200" || statusCode === "304") return;
      } catch { /* not ready */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`Dev server did not start within ${maxAttempts}s`);
  }

  async executeClaudeCode(
    sandboxId: string,
    prompt: string,
    options: { systemPrompt?: string } = {}
  ): Promise<{ output: string; filesAffected: string[]; success: boolean }> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      logger.info("Starting Claude execution", { sandboxId, promptLength: prompt.length });

      const anthropic = this.getAnthropicClient();
      const filesAffected: string[] = [];
      let outputText = "";

      // Read current files for context
      const pageContent = await readFileViaSh(sandbox, "src/app/page.tsx");
      const globalsCss = await readFileViaSh(sandbox, "src/app/globals.css");
      
      let contextPrompt = `CURRENT FILES:

=== src/app/page.tsx ===
${pageContent || '(file not found)'}

=== src/app/globals.css ===
${globalsCss || '(file not found)'}

---
USER REQUEST: ${prompt}

REMEMBER:
1. Use standard Tailwind classes only (no custom utilities)
2. Keep globals.css minimal
3. Use check_build after changes to verify
4. Fix any errors before finishing`;

      const messages: Anthropic.MessageParam[] = [{ role: "user", content: contextPrompt }];
      let continueLoop = true;
      let iteration = 0;

      while (continueLoop && iteration < 20) {
        iteration++;
        
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8192,
          system: options.systemPrompt || SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        });

        logger.info("Claude response", { sandboxId, stopReason: response.stop_reason, iteration });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        
        for (const block of response.content) {
          if (block.type === "text") {
            outputText += block.text + "\n";
          } else if (block.type === "tool_use") {
            logger.info("Tool use", { sandboxId, tool: block.name, iteration });
            
            let result: string;
            try {
              if (block.name === "install_packages") {
                const { packages } = block.input as { packages: string[] };
                result = await installPackages(sandbox, packages);
              } else if (block.name === "write_file") {
                const { path, content } = block.input as { path: string; content: string };
                await writeFileViaSh(sandbox, path, content);
                filesAffected.push(path);
                
                // Auto-check build after writing
                await new Promise(r => setTimeout(r, 1500));
                const buildStatus = await checkBuild(sandbox);
                result = `✅ Wrote ${path}\n\nBuild Status: ${buildStatus}`;
                
                if (buildStatus.includes('❌')) {
                  result += `\n\n⚠️ Please fix the errors above!`;
                }
                
                logger.info("File written", { sandboxId, path, buildOk: !buildStatus.includes('❌') });
              } else if (block.name === "read_file") {
                const { path } = block.input as { path: string };
                const content = await readFileViaSh(sandbox, path);
                result = content || `File not found: ${path}`;
              } else if (block.name === "check_build") {
                result = await checkBuild(sandbox);
                logger.info("Build check", { sandboxId, ok: result.includes('✅') });
              } else if (block.name === "list_files") {
                const { path } = block.input as { path: string };
                const files = await listFilesViaSh(sandbox, path);
                result = files.join('\n') || `Empty: ${path}`;
              } else if (block.name === "run_command") {
                const { command } = block.input as { command: string };
                const r = await sandbox.runCommand({ cmd: "sh", args: ["-c", command] });
                result = `Exit ${r.exitCode}: ${await r.stdout()} ${await r.stderr()}`.trim();
              } else {
                result = `Unknown tool: ${block.name}`;
              }
            } catch (err) {
              result = `Error: ${err}`;
              logger.error("Tool error", { sandboxId, tool: block.name, error: err });
            }

            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
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

      // Final build check
      const finalBuild = await checkBuild(sandbox);
      if (finalBuild.includes('❌')) {
        outputText += `\n\n⚠️ Note: There may still be build errors. ${finalBuild}`;
      }

      logger.info("Claude complete", { sandboxId, filesAffected: filesAffected.length, iteration });

      return {
        output: outputText || "Changes applied!",
        filesAffected: [...new Set(filesAffected)],
        success: true,
      };
    } catch (error) {
      logger.error("Claude error", { sandboxId, error });
      throw error;
    }
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    const content = await readFileViaSh(sandbox, path);
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
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

  async installPackages(sandboxId: string, packages: string[]): Promise<string> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    return await installPackages(sandbox, packages);
  }

  async extendTimeout(sandboxId: string, durationMs: number): Promise<void> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
    await sandbox.extendTimeout(durationMs);
  }

  async stop(sandboxId: string): Promise<void> {
    const sandbox = getActiveSandboxes().get(sandboxId);
    if (!sandbox) return;
    try {
      await sandbox.stop();
      getActiveSandboxes().delete(sandboxId);
      logger.info("Sandbox stopped", { sandboxId });
    } catch (error) {
      logger.error("Stop failed", { sandboxId, error });
    }
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
