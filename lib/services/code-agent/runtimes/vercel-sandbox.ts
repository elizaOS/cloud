import { logger } from "@/lib/utils/logger";
import type { CodeAgentRuntime, RuntimeCreateParams, RuntimeInstance, FileEntry } from "../types";

interface SandboxHandle {
  id?: string;
  status: string;
  domain: (port: number) => string;
  runCommand: (params: RunCommandParams) => Promise<CommandResultHandle>;
  stop: () => Promise<void>;
  extendTimeout: (durationMs: number) => Promise<void>;
}

interface RunCommandParams {
  cmd: string;
  args?: string[];
  stderr?: NodeJS.WritableStream;
  stdout?: NodeJS.WritableStream;
  detached?: boolean;
  sudo?: boolean;
  env?: Record<string, string>;
}

interface CommandResultHandle {
  exitCode: number;
  stdout: () => Promise<string>;
  stderr: () => Promise<string>;
}

declare global {
  var __codeAgentSandboxes: Map<string, SandboxHandle> | undefined;
}

function getSandboxRegistry(): Map<string, SandboxHandle> {
  if (!global.__codeAgentSandboxes) {
    global.__codeAgentSandboxes = new Map<string, SandboxHandle>();
  }
  return global.__codeAgentSandboxes;
}

class VercelSandboxInstance implements RuntimeInstance {
  readonly type = "vercel" as const;

  constructor(
    public readonly id: string,
    public readonly url: string | null,
    private sandbox: SandboxHandle
  ) {}

  get status(): "running" | "stopped" | "error" {
    return this.sandbox.status === "running" ? "running" : "stopped";
  }

  async readFile(path: string): Promise<string | null> {
    const result = await this.sandbox.runCommand({
      cmd: "cat",
      args: [path],
    });

    if (result.exitCode !== 0) {
      return null;
    }

    return result.stdout();
  }

  async writeFile(path: string, content: string): Promise<void> {
    const dir = path.split("/").slice(0, -1).join("/");

    if (dir) {
      await this.sandbox.runCommand({
        cmd: "mkdir",
        args: ["-p", dir],
      });
    }

    const base64Content = Buffer.from(content, "utf-8").toString("base64");
    const script = `require('fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2], 'base64').toString('utf-8'))`;

    const result = await this.sandbox.runCommand({
      cmd: "node",
      args: ["-e", script, path, base64Content],
    });

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(`Failed to write file: ${stderr}`);
    }
  }

  async listFiles(path: string): Promise<FileEntry[]> {
    const result = await this.sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `find ${path} -maxdepth 3 \\( -type f -o -type d \\) -exec stat -c '%n|%F|%s|%Y' {} \\; 2>/dev/null | head -200`,
      ],
    });

    if (result.exitCode !== 0) {
      const fallback = await this.sandbox.runCommand({
        cmd: "sh",
        args: [
          "-c",
          `find ${path} -maxdepth 3 \\( -type f -o -type d \\) -exec stat -f '%N|%HT|%z|%m' {} \\; 2>/dev/null | head -200`,
        ],
      });

      if (fallback.exitCode !== 0) return [];

      const stdout = await fallback.stdout();
      return stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [filePath, fileType, size, mtime] = line.split("|");
          const isDir = fileType?.toLowerCase().includes("directory");
          return {
            path: filePath,
            type: isDir ? "directory" : "file",
            size: isDir ? undefined : parseInt(size || "0", 10),
            modifiedAt: mtime ? new Date(parseInt(mtime, 10) * 1000).toISOString() : undefined,
          } as FileEntry;
        });
    }

    const stdout = await result.stdout();
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [filePath, fileType, size, mtime] = line.split("|");
        const isDir = fileType === "directory";
        return {
          path: filePath,
          type: isDir ? "directory" : "file",
          size: isDir ? undefined : parseInt(size || "0", 10),
          modifiedAt: mtime ? new Date(parseInt(mtime, 10) * 1000).toISOString() : undefined,
        } as FileEntry;
      });
  }

  async deleteFile(path: string): Promise<void> {
    const result = await this.sandbox.runCommand({
      cmd: "rm",
      args: ["-rf", path],
    });

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(`Failed to delete: ${stderr}`);
    }
  }

  async runCommand(
    cmd: string,
    args?: string[],
    options?: { env?: Record<string, string>; cwd?: string; timeout?: number }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    let fullCommand = cmd;
    if (args && args.length > 0) {
      fullCommand = `${cmd} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
    }

    if (options?.cwd) {
      fullCommand = `cd "${options.cwd}" && ${fullCommand}`;
    }

    const result = await this.sandbox.runCommand({
      cmd: "sh",
      args: ["-c", fullCommand],
      env: options?.env,
    });

    return {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  }

  async createArchive(paths: string[]): Promise<Buffer> {
    const tarFile = `/tmp/snapshot-${Date.now()}.tar.gz`;
    const pathArgs = paths.join(" ");

    const result = await this.sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `tar -czf ${tarFile} ${pathArgs} 2>/dev/null`],
    });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create archive: ${await result.stderr()}`);
    }

    const base64Result = await this.sandbox.runCommand({
      cmd: "base64",
      args: [tarFile],
    });

    if (base64Result.exitCode !== 0) {
      throw new Error(`Failed to encode archive`);
    }

    await this.sandbox.runCommand({
      cmd: "rm",
      args: ["-f", tarFile],
    });

    return Buffer.from(await base64Result.stdout(), "base64");
  }

  async extractArchive(archive: Buffer, targetPath: string): Promise<void> {
    const tarFile = `/tmp/restore-${Date.now()}.tar.gz`;
    const base64Content = archive.toString("base64");

    const writeResult = await this.sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `echo "${base64Content}" | base64 -d > ${tarFile}`],
    });

    if (writeResult.exitCode !== 0) {
      throw new Error(`Failed to write archive`);
    }

    await this.sandbox.runCommand({
      cmd: "mkdir",
      args: ["-p", targetPath],
    });

    const extractResult = await this.sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `tar -xzf ${tarFile} -C ${targetPath}`],
    });

    await this.sandbox.runCommand({
      cmd: "rm",
      args: ["-f", tarFile],
    });

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract archive: ${await extractResult.stderr()}`);
    }
  }

  async stop(): Promise<void> {
    await this.sandbox.stop();
    getSandboxRegistry().delete(this.id);
  }
}

const DEFAULT_TEMPLATE_URL = "https://github.com/elizaOS/sandbox-template-cloud.git";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function getCredentials() {
  const hasOIDC = !!process.env.VERCEL_OIDC_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const token = process.env.VERCEL_TOKEN;
  const hasAccessToken = !!(teamId && projectId && token);
  return { hasOIDC, hasAccessToken, teamId, projectId, token };
}

function extractIdFromUrl(url: string): string {
  const hostname = new URL(url).hostname;
  return hostname.split(".")[0] || `sandbox-${crypto.randomUUID().slice(0, 8)}`;
}

export class VercelSandboxRuntime implements CodeAgentRuntime {
  readonly type = "vercel" as const;

  static isConfigured(): boolean {
    const creds = getCredentials();
    return creds.hasOIDC || creds.hasAccessToken;
  }

  static validateCredentials(): { valid: boolean; missing: string[] } {
    const creds = getCredentials();
    if (creds.hasOIDC) return { valid: true, missing: [] };
    
    const missing: string[] = [];
    if (!process.env.VERCEL_TOKEN) missing.push("VERCEL_TOKEN");
    if (!process.env.VERCEL_TEAM_ID) missing.push("VERCEL_TEAM_ID");
    if (!process.env.VERCEL_PROJECT_ID) missing.push("VERCEL_PROJECT_ID");
    
    return { valid: missing.length === 0, missing };
  }

  async create(params: RuntimeCreateParams): Promise<RuntimeInstance> {
    const validation = VercelSandboxRuntime.validateCredentials();
    if (!validation.valid) {
      throw new Error(
        `Vercel Sandbox not configured. Missing: ${validation.missing.join(", ")}`
      );
    }

    const creds = getCredentials();

    const { Sandbox } = await import("@vercel/sandbox");

    const templateUrl = params.templateUrl || DEFAULT_TEMPLATE_URL;
    const timeout = params.timeout || DEFAULT_TIMEOUT_MS;
    const vcpus = params.vcpus || 4;
    const ports = params.ports || [3000];

    logger.info("[VercelSandboxRuntime] Creating sandbox", {
      templateUrl,
      vcpus,
      timeout,
    });

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

    const sandbox = (await Sandbox.create(createOptions)) as SandboxHandle;
    const url = sandbox.domain(3000);
    const sandboxId = sandbox.id ?? extractIdFromUrl(url);

    getSandboxRegistry().set(sandboxId, sandbox);

    let install = await sandbox.runCommand({ cmd: "pnpm", args: ["install"] });
    if (install.exitCode !== 0) {
      install = await sandbox.runCommand({ cmd: "npm", args: ["install"] });
      if (install.exitCode !== 0) throw new Error(`Install failed: ${await install.stderr()}`);
    }

    if (params.env && Object.keys(params.env).length > 0) {
      const envBase64 = Buffer.from(Object.entries(params.env).map(([k, v]) => `${k}=${v}`).join("\n")).toString("base64");
      await sandbox.runCommand({ cmd: "sh", args: ["-c", `echo "${envBase64}" | base64 -d >> .env.local`] });
    }

    await sandbox.runCommand({ cmd: "sh", args: ["-c", "pnpm dev 2>&1 | tee /tmp/next-dev.log &"], detached: true, env: params.env });
    await this.waitForDevServer(sandbox, 3000);
    logger.info("[VercelSandboxRuntime] Ready", { sandboxId, url });

    return new VercelSandboxInstance(sandboxId, url, sandbox);
  }

  async connect(runtimeId: string): Promise<RuntimeInstance> {
    // Check in-memory cache first
    const cached = getSandboxRegistry().get(runtimeId);
    if (cached) {
      const url = cached.domain(3000);
      return new VercelSandboxInstance(runtimeId, url, cached);
    }

    // Reconnect to existing sandbox (survives serverless cold starts)
    const validation = VercelSandboxRuntime.validateCredentials();
    if (!validation.valid) {
      throw new Error(`Cannot reconnect: ${validation.missing.join(", ")} not configured`);
    }

    const { Sandbox } = await import("@vercel/sandbox");
    const creds = getCredentials();
    
    const getParams: { sandboxId: string; token?: string; teamId?: string; projectId?: string } = {
      sandboxId: runtimeId,
    };
    
    if (!creds.hasOIDC && creds.hasAccessToken) {
      getParams.token = creds.token!;
      getParams.teamId = creds.teamId!;
      getParams.projectId = creds.projectId!;
    }

    const sandbox = await Sandbox.get(getParams) as SandboxHandle;
    getSandboxRegistry().set(runtimeId, sandbox);
    
    logger.info("[VercelSandboxRuntime] Reconnected to sandbox", { runtimeId });
    const url = sandbox.domain(3000);
    return new VercelSandboxInstance(runtimeId, url, sandbox);
  }

  async terminate(runtimeId: string): Promise<void> {
    const sandbox = getSandboxRegistry().get(runtimeId);
    if (sandbox) {
      await sandbox.stop();
      getSandboxRegistry().delete(runtimeId);
      logger.info("[VercelSandboxRuntime] Sandbox terminated", { runtimeId });
    }
  }

  async isHealthy(runtimeId: string): Promise<boolean> {
    const sandbox = getSandboxRegistry().get(runtimeId);
    if (!sandbox) return false;

    const result = await sandbox.runCommand({
      cmd: "curl",
      args: ["-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:3000"],
    });

    const statusCode = await result.stdout();
    return statusCode === "200" || statusCode === "304";
  }

  async extendTimeout(runtimeId: string, durationMs: number): Promise<void> {
    const sandbox = getSandboxRegistry().get(runtimeId);
    if (!sandbox) {
      throw new Error(`Sandbox ${runtimeId} not found`);
    }

    await sandbox.extendTimeout(durationMs);
    logger.info("[VercelSandboxRuntime] Timeout extended", { runtimeId, durationMs });
  }

  private async waitForDevServer(
    sandbox: SandboxHandle,
    port: number,
    maxAttempts = 45
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await sandbox.runCommand({
        cmd: "curl",
        args: ["-s", "-o", "/dev/null", "-w", "%{http_code}", `http://localhost:${port}`],
      });

      const statusCode = await result.stdout();
      if (statusCode === "200" || statusCode === "304") {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Dev server did not start within ${maxAttempts}s`);
  }
}

export const vercelSandboxRuntime = new VercelSandboxRuntime();

