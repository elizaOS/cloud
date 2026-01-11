/**
 * Shared types for sandbox operations.
 * Used by both SandboxService and AppBuilderAISDK.
 */

export interface RunCommandOptions {
  cmd: string;
  args?: string[];
  stderr?: NodeJS.WritableStream;
  stdout?: NodeJS.WritableStream;
  detached?: boolean;
  sudo?: boolean;
  env?: Record<string, string>;
}

export interface CommandResult {
  exitCode: number;
  stdout: () => Promise<string>;
  stderr: () => Promise<string>;
}

export interface SandboxInstance {
  id?: string;
  status: string;
  domain: (port: number) => string;
  runCommand: (params: RunCommandOptions) => Promise<CommandResult>;
  stop: () => Promise<void>;
  extendTimeout: (durationMs: number) => Promise<void>;
}

export type SandboxProgress =
  | { step: "creating"; message: string }
  | { step: "installing"; message: string }
  | { step: "starting"; message: string }
  | { step: "restoring"; message: string }
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
