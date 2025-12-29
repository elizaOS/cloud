/**
 * DWS Sandbox Runtime for Code Agents
 *
 * Provides a workerd-based isolated execution environment.
 * This module provides backwards compatibility with the Vercel Sandbox API.
 */

import { logger } from "@/lib/utils/logger";
import { Sandbox, DWSSandboxRuntime, type SandboxInstance } from "@/lib/services/dws/sandbox";
import type {
  CodeAgentRuntime,
  RuntimeCreateParams,
  RuntimeInstance,
  FileEntry,
} from "../types";

declare global {
  var __codeAgentSandboxes: Map<string, SandboxInstance> | undefined;
}

function getSandboxRegistry(): Map<string, SandboxInstance> {
  if (!global.__codeAgentSandboxes) {
    global.__codeAgentSandboxes = new Map<SandboxInstance, SandboxInstance>();
  }
  return global.__codeAgentSandboxes as Map<string, SandboxInstance>;
}

class DWSSandboxInstance implements RuntimeInstance {
  readonly type = "dws" as const;

  constructor(
    public readonly id: string,
    public readonly url: string | null,
    private sandbox: SandboxInstance,
  ) {}

  get status(): "running" | "stopped" | "error" {
    const s = this.sandbox.status;
    if (s === "running" || s === "ready") return "running";
    if (s === "error") return "error";
    return "stopped";
  }

  async readFile(path: string): Promise<string | null> {
    return this.sandbox.readFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.sandbox.writeFile(path, content);
  }

  async listFiles(path: string): Promise<FileEntry[]> {
    return this.sandbox.listFiles(path);
  }

  async deleteFile(path: string): Promise<void> {
    return this.sandbox.deleteFile(path);
  }

  async runCommand(params: {
    cmd: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    detached?: boolean;
  }): Promise<{ exitCode: number; stdout: () => Promise<string>; stderr: () => Promise<string> }> {
    return this.sandbox.runCommand(params);
  }

  domain(port: number): string {
    return this.sandbox.domain(port);
  }

  async extendTimeout(durationMs: number): Promise<void> {
    return this.sandbox.extendTimeout(durationMs);
  }

  async stop(): Promise<void> {
    await this.sandbox.stop();
    getSandboxRegistry().delete(this.id);
  }

  async terminate(): Promise<void> {
    return this.stop();
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
      throw new Error("Failed to encode archive");
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
      throw new Error("Failed to write archive");
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
}

export class VercelSandboxRuntime implements CodeAgentRuntime {
  readonly type = "dws" as const;

  private dwsRuntime = new DWSSandboxRuntime();

  static isConfigured(): boolean {
    return DWSSandboxRuntime.isConfigured();
  }

  static validateCredentials(): { valid: boolean; missing: string[] } {
    return DWSSandboxRuntime.validateCredentials();
  }

  async create(params: RuntimeCreateParams): Promise<RuntimeInstance> {
    logger.info("[DWS Sandbox] Creating sandbox", {
      templateUrl: params.templateUrl,
      vcpus: params.vcpus,
    });

    const sandbox = await Sandbox.create({
      source: params.templateUrl
        ? { url: params.templateUrl, type: "git" }
        : undefined,
      resources: {
        vcpus: params.vcpus,
        memoryMb: params.memoryMb,
      },
      timeout: params.timeout,
      ports: params.ports ?? [3000],
      env: params.env,
    });

    // Install dependencies
    let install = await sandbox.runCommand({ cmd: "pnpm", args: ["install"] });
    if (install.exitCode !== 0) {
      install = await sandbox.runCommand({ cmd: "bun", args: ["install"] });
      if (install.exitCode !== 0) {
        install = await sandbox.runCommand({ cmd: "npm", args: ["install"] });
        if (install.exitCode !== 0) {
          throw new Error(`Install failed: ${await install.stderr()}`);
        }
      }
    }

    // Write env file if env vars provided
    if (params.env && Object.keys(params.env).length > 0) {
      const envContent = Object.entries(params.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      await sandbox.writeFile(".env.local", envContent);
    }

    const instance = new DWSSandboxInstance(sandbox.id, sandbox.url, sandbox);
    getSandboxRegistry().set(sandbox.id, sandbox);

    logger.info("[DWS Sandbox] Sandbox created", {
      id: sandbox.id,
      url: sandbox.url,
    });

    return instance;
  }

  async connect(runtimeId: string): Promise<RuntimeInstance> {
    // Check local registry first
    const cached = getSandboxRegistry().get(runtimeId);
    if (cached) {
      return new DWSSandboxInstance(runtimeId, cached.url, cached);
    }

    // Fetch from DWS
    const sandbox = await Sandbox.get({ sandboxId: runtimeId });
    getSandboxRegistry().set(runtimeId, sandbox);

    return new DWSSandboxInstance(sandbox.id, sandbox.url, sandbox);
  }

  async terminate(runtimeId: string): Promise<void> {
    const sandbox = getSandboxRegistry().get(runtimeId);
    if (sandbox) {
      await sandbox.stop();
      getSandboxRegistry().delete(runtimeId);
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
  }

  getStatus(runtimeId: string): "running" | "stopped" | "unknown" {
    const sandbox = getSandboxRegistry().get(runtimeId);
    if (!sandbox) return "unknown";
    return sandbox.status === "running" || sandbox.status === "ready"
      ? "running"
      : "stopped";
  }

  getActiveSandboxes(): string[] {
    return Array.from(getSandboxRegistry().keys());
  }
}

// Export a singleton instance for compatibility
export const vercelSandboxRuntime = new VercelSandboxRuntime();

// Legacy export for backwards compatibility
export { vercelSandboxRuntime as dwsSandboxRuntime };
