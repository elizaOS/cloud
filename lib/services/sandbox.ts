import { logger } from "@/lib/utils/logger";
import {
  ELIZA_SDK_FILE,
  ELIZA_HOOK_FILE,
  ELIZA_ANALYTICS_COMPONENT,
} from "./sandbox-sdk-templates";
import { getGitCredentials, getAuthenticatedCloneUrl } from "./github-repos";

/**
 * Sandbox Service
 * 
 * Manages Vercel Sandbox instances connected to GitHub repositories.
 * Each app is a private GitHub repo.
 */

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

export interface SandboxConfig {
  repoName?: string;
  templateUrl?: string;
  timeout?: number;
  vcpus?: number;
  ports?: number[];
  env?: Record<string, string>;
  organizationId?: string;
  projectId?: string;
  onProgress?: (progress: SandboxProgress) => void;
}

export interface SandboxProgress {
  step: "creating" | "cloning" | "installing" | "starting" | "ready" | "error";
  message: string;
}

export interface SandboxSessionData {
  sandboxId: string;
  sandboxUrl: string;
  sandbox: SandboxInstance;
}

const DEFAULT_TEMPLATE_URL = "https://github.com/elizacloud-apps/sandbox-template";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// Track active sandboxes (Note: lost on server restart - see cleanup job)
const activeSandboxes = new Map<string, SandboxInstance>();

/**
 * Get active sandboxes map (used by cleanup job)
 */
export function getActiveSandboxes(): Map<string, SandboxInstance> {
  return activeSandboxes;
}

/**
 * Sanitize file path to prevent command injection and path traversal
 */
function sanitizeFilePath(filePath: string): string {
  // Decode any URL-encoded characters first to catch encoded traversal attempts
  let decoded = filePath;
  try {
    // Decode multiple times to catch double-encoding
    let prev = "";
    while (prev !== decoded) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    // If decoding fails, use original
  }
  
  // Normalize path separators
  decoded = decoded.replace(/\\/g, "/");
  
  // Remove any characters that could break shell commands
  // Allow only alphanumeric, dots, hyphens, underscores, and forward slashes
  const sanitized = decoded.replace(/[^a-zA-Z0-9._/-]/g, "");
  
  // Security checks
  if (
    sanitized.includes("..") ||       // Path traversal
    sanitized.startsWith("/") ||       // Absolute paths
    sanitized.includes("//") ||        // Double slashes
    /^[a-zA-Z]:/.test(sanitized)      // Windows drive letters
  ) {
    throw new Error("Invalid file path: potentially dangerous path");
  }
  
  // Ensure path doesn't escape project directory
  const normalized = sanitized.split("/").filter(Boolean).join("/");
  if (!normalized || normalized.length > 500) {
    throw new Error("Invalid file path: path too long or empty");
  }
  
  return normalized;
}

function extractSandboxIdFromUrl(url: string): string {
  const match = url.match(/([a-z0-9-]+)\.vercel/);
  return match?.[1] || `sandbox-${Date.now()}`;
}

function getSandboxCredentials(): {
  hasOIDC: boolean;
  hasAccessToken: boolean;
  teamId?: string;
  projectId?: string;
  token?: string;
} {
  return {
    hasOIDC: !!process.env.VERCEL_OIDC_TOKEN,
    hasAccessToken:
      !!process.env.VERCEL_TOKEN &&
      !!process.env.VERCEL_TEAM_ID &&
      !!process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
    token: process.env.VERCEL_TOKEN,
  };
}

async function readFileViaSh(
  sandbox: SandboxInstance,
  filePath: string
): Promise<string | null> {
  const safePath = sanitizeFilePath(filePath);
  try {
    const result = await sandbox.runCommand({
      cmd: "cat",
      args: [safePath],
    });
    if (result.exitCode !== 0) return null;
    return await result.stdout();
  } catch {
    return null;
  }
}

async function writeFileViaSh(
  sandbox: SandboxInstance,
  filePath: string,
  content: string
): Promise<void> {
  const safePath = sanitizeFilePath(filePath);
  const dirPath = safePath.substring(0, safePath.lastIndexOf("/"));
  
  if (dirPath) {
    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dirPath] });
  }
  
  // Use base64 to safely pass content without shell interpretation
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `printf '%s' '${encoded}' | base64 -d > '${safePath}'`],
  });
}

export class SandboxService {
  async create(config: SandboxConfig = {}): Promise<SandboxSessionData> {
    const {
      repoName,
      templateUrl = DEFAULT_TEMPLATE_URL,
      timeout = DEFAULT_TIMEOUT_MS,
      vcpus = 4,
      ports = [3000],
      env = {},
      onProgress,
    } = config;

    const creds = getSandboxCredentials();
    if (!creds.hasOIDC && !creds.hasAccessToken) {
      throw new Error(
        "Vercel Sandbox credentials not configured. Set VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID."
      );
    }

    const { Sandbox } = await import("@vercel/sandbox");

    let source: { url: string; type: "git"; username?: string; password?: string };
    
    if (repoName) {
      const credentials = getGitCredentials();
      source = {
        url: getAuthenticatedCloneUrl(repoName),
        type: "git",
        username: credentials.username,
        password: credentials.password,
      };
      logger.info("Creating sandbox from GitHub repo", { repoName });
    } else {
      source = { url: templateUrl, type: "git" };
      logger.info("Creating sandbox from template", { templateUrl });
    }

    onProgress?.({ step: "creating", message: "Creating sandbox instance..." });

    const createOptions: Record<string, unknown> = {
      source,
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

    logger.info("Sandbox created", { sandboxId });
    activeSandboxes.set(sandboxId, sandbox);
    onProgress?.({ step: "cloning", message: "Repository cloned" });

    // Configure git
    if (repoName) {
      await sandbox.runCommand({
        cmd: "git",
        args: ["config", "user.email", "sandbox@elizacloud.ai"],
      });
      await sandbox.runCommand({
        cmd: "git",
        args: ["config", "user.name", "ElizaCloud Sandbox"],
      });
    }

    // Install dependencies
    onProgress?.({ step: "installing", message: "Installing dependencies..." });
    const install = await sandbox.runCommand({ cmd: "pnpm", args: ["install"] });
    if (install.exitCode !== 0) {
      await sandbox.runCommand({ cmd: "npm", args: ["install"] });
    }

    // Inject SDK
    await this.injectElizaSDK(sandbox, sandboxId);

    // Set up env vars
    const mergedEnv = { ...env };
    const isLocalDev =
      process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") ||
      process.env.NEXT_PUBLIC_APP_URL?.includes("127.0.0.1");

    if (isLocalDev && process.env.NEXT_PUBLIC_APP_URL) {
      mergedEnv.NEXT_PUBLIC_ELIZA_PROXY_URL = process.env.NEXT_PUBLIC_APP_URL;
      mergedEnv.NEXT_PUBLIC_ELIZA_API_URL = "https://elizacloud.ai";
    }

    if (Object.keys(mergedEnv).length > 0) {
      const envContent = Object.entries(mergedEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      const envBase64 = Buffer.from(envContent, "utf-8").toString("base64");
      await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", `printf '%s' '${envBase64}' | base64 -d > .env.local`],
      });
    }

    // Start dev server
    onProgress?.({ step: "starting", message: "Starting dev server..." });
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "pnpm dev 2>&1 | tee /tmp/next-dev.log &"],
      detached: true,
    });

    await this.waitForServer(devServerUrl, 60000);
    onProgress?.({ step: "ready", message: "Sandbox ready!" });

    return { sandboxId, sandboxUrl: devServerUrl, sandbox };
  }

  private async injectElizaSDK(sandbox: SandboxInstance, sandboxId: string): Promise<void> {
    await sandbox.runCommand({
      cmd: "mkdir",
      args: ["-p", "lib", "hooks", "components"],
    });

    await writeFileViaSh(sandbox, "lib/eliza.ts", ELIZA_SDK_FILE);
    await writeFileViaSh(sandbox, "hooks/use-eliza.ts", ELIZA_HOOK_FILE);
    await writeFileViaSh(sandbox, "components/ElizaAnalytics.tsx", ELIZA_ANALYTICS_COMPONENT);

    logger.info("Injected Eliza SDK files", { sandboxId });
  }

  private async waitForServer(url: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok || response.status === 404) return;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Server did not start within ${timeoutMs}ms`);
  }

  async commitAndPush(sandboxId: string, message: string): Promise<{ commitSha: string; filesChanged: number }> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");

    await sandbox.runCommand({ cmd: "git", args: ["add", "-A"] });

    const status = await sandbox.runCommand({ cmd: "git", args: ["status", "--porcelain"] });
    const statusOutput = await status.stdout();

    if (!statusOutput.trim()) {
      return { commitSha: "", filesChanged: 0 };
    }

    const filesChanged = statusOutput.trim().split("\n").length;

    await sandbox.runCommand({ cmd: "git", args: ["commit", "-m", message] });

    const sha = await sandbox.runCommand({ cmd: "git", args: ["rev-parse", "HEAD"] });
    const commitSha = (await sha.stdout()).trim();

    await sandbox.runCommand({ cmd: "git", args: ["push", "origin", "main"] });

    logger.info("Committed and pushed", { sandboxId, filesChanged });
    return { commitSha, filesChanged };
  }

  async pullLatest(sandboxId: string): Promise<boolean> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");
    const result = await sandbox.runCommand({ cmd: "git", args: ["pull", "origin", "main"] });
    return result.exitCode === 0;
  }

  async getGitStatus(sandboxId: string): Promise<{
    branch: string;
    commitSha: string;
    hasChanges: boolean;
    changedFiles: string[];
  }> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");

    const [branch, sha, status] = await Promise.all([
      sandbox.runCommand({ cmd: "git", args: ["rev-parse", "--abbrev-ref", "HEAD"] }),
      sandbox.runCommand({ cmd: "git", args: ["rev-parse", "HEAD"] }),
      sandbox.runCommand({ cmd: "git", args: ["status", "--porcelain"] }),
    ]);

    const statusOutput = await status.stdout();
    const changedFiles = statusOutput.trim().split("\n").filter(Boolean).map((l) => l.slice(3));

    return {
      branch: (await branch.stdout()).trim(),
      commitSha: (await sha.stdout()).trim(),
      hasChanges: changedFiles.length > 0,
      changedFiles,
    };
  }

  async stop(sandboxId: string): Promise<void> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) return;
    await sandbox.stop();
    activeSandboxes.delete(sandboxId);
    logger.info("Sandbox stopped", { sandboxId });
  }

  async extendTimeout(sandboxId: string, durationMs: number): Promise<void> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");
    await sandbox.extendTimeout(durationMs);
  }

  async readFile(sandboxId: string, filePath: string): Promise<string | null> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");
    return readFileViaSh(sandbox, filePath);
  }

  async writeFile(sandboxId: string, filePath: string, content: string): Promise<void> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");
    await writeFileViaSh(sandbox, filePath, content);
  }

  async runCommand(sandboxId: string, cmd: string, args?: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");
    const result = await sandbox.runCommand({ cmd, args });
    return {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  }

  async getLogs(sandboxId: string, options?: { tail?: number }): Promise<string[]> {
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error("Sandbox not found");
    
    const { tail = 100 } = options || {};
    
    try {
      const result = await sandbox.runCommand({
        cmd: "tail",
        args: ["-n", String(tail), "/tmp/next-dev.log"],
      });
      
      if (result.exitCode !== 0) {
        return [];
      }
      
      const output = await result.stdout();
      return output.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}

export const sandboxService = new SandboxService();
