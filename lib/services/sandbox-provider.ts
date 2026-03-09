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
 * the `MILADY_SANDBOX_PROVIDER` env var ("vercel" | "docker").
 * Defaults to "vercel" for backwards compatibility.
 * Also accepts legacy `MILAIDY_SANDBOX_PROVIDER` for backwards compat.
 */
export function createSandboxProvider(): SandboxProvider {
  const providerName = (process.env.MILADY_SANDBOX_PROVIDER ?? process.env.MILAIDY_SANDBOX_PROVIDER ?? "vercel").toLowerCase();

  switch (providerName) {
    case "vercel": {
      // Synchronous require() is intentional: this factory is called in a
      // constructor (MiladySandboxService), which cannot be async.  Dynamic
      // import() would require converting the constructor to a static async
      // factory method across all call-sites.  The lazy require keeps the
      // Vercel SDK out of the Docker bundle without that refactor.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VercelSandboxProvider } = require("./vercel-sandbox-provider") as typeof import("./vercel-sandbox-provider");
      return new VercelSandboxProvider();
    }

    case "docker": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DockerSandboxProvider } = require("./docker-sandbox-provider") as typeof import("./docker-sandbox-provider");
      return new DockerSandboxProvider();
    }

    default:
      throw new Error(`Unknown sandbox provider: "${providerName}". Supported values: vercel, docker`);
  }
}
