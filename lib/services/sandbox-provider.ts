/**
 * Sandbox Provider Abstraction Layer
 *
 * Defines a provider-agnostic interface for sandbox lifecycle management.
 * Concrete implementations (Vercel, Docker) live in their own files.
 */

export interface SandboxProvider {
  /** Create a new sandbox and return connection handles. */
  create(config: SandboxCreateConfig): Promise<SandboxHandle>;

  /** Stop and tear down an existing sandbox. */
  stop(sandboxId: string): Promise<void>;

  /**
   * Poll the health endpoint until it responds OK or timeout.
   * Returns true if healthy, false if timed out.
   */
  checkHealth(healthUrl: string): Promise<boolean>;

  /** Run a shell command inside the sandbox (optional — not all providers support this). */
  runCommand?(sandboxId: string, cmd: string, args?: string[]): Promise<string>;
}

export interface SandboxHandle {
  sandboxId: string;
  bridgeUrl: string;
  healthUrl: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxCreateConfig {
  agentId: string;
  agentName: string;
  environmentVars: Record<string, string>;
  snapshotId?: string;
  resources?: { vcpus?: number; memoryMb?: number };
  timeout?: number;
}

/**
 * Factory — returns the concrete SandboxProvider based on
 * the `MILAIDY_SANDBOX_PROVIDER` env var ("vercel" | "docker").
 * Defaults to "vercel" for backwards compatibility.
 */
export function createSandboxProvider(): SandboxProvider {
  const providerName = (process.env.MILAIDY_SANDBOX_PROVIDER ?? "vercel").toLowerCase();

  switch (providerName) {
    case "vercel": {
      // Lazy-import to avoid pulling Vercel SDK when using Docker provider
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VercelSandboxProvider } = require("./vercel-sandbox-provider") as typeof import("./vercel-sandbox-provider");
      return new VercelSandboxProvider();
    }

    case "docker": {
      // Docker provider will be implemented in Worker 2
      throw new Error(
        "Docker sandbox provider is not yet implemented. Set MILAIDY_SANDBOX_PROVIDER=vercel or wait for the docker-sandbox-provider module.",
      );
    }

    default:
      throw new Error(`Unknown sandbox provider: "${providerName}". Supported values: vercel, docker`);
  }
}
