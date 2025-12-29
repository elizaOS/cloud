/**
 * Sandbox Service Compatibility Layer
 *
 * This module re-exports the DWS sandbox service with a Vercel Sandbox-compatible API.
 * It provides backwards compatibility for existing code that uses Vercel Sandbox.
 *
 * For new code, prefer using the DWS sandbox service directly:
 * import { Sandbox, DWSSandboxRuntime } from "@/lib/services/dws/sandbox";
 */

export {
  Sandbox,
  DWSSandboxRuntime as SandboxService,
  dwsSandboxRuntime as sandboxService,
  getSandboxCredentials,
  type SandboxInstance,
  type SandboxCreateOptions as SandboxConfig,
  type RunCommandParams,
  type CommandResult,
  type FileEntry,
} from "@/lib/services/dws/sandbox";

// Re-export progress types for compatibility
export type SandboxProgress =
  | { step: "creating"; message: string }
  | { step: "installing"; message: string }
  | { step: "starting"; message: string }
  | { step: "ready"; message: string }
  | { step: "error"; message: string };

export interface SandboxSessionData {
  sandboxId: string;
  sandboxUrl: string;
  status: "initializing" | "ready" | "generating" | "error" | "stopped";
  devServerUrl?: string;
  startedAt?: Date;
}
