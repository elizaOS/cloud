/**
 * Sandbox utilities - shared code for sandbox operations.
 *
 * This module provides:
 * - Types for sandbox interactions
 * - Security validation for commands and paths
 * - File operations (read, write, list)
 * - Package manager operations
 * - Build checking and type validation
 * - Tool schemas and execution
 */

// Build tools (with native SDK streaming support)
export {
  checkBuild,
  getCommandOutputStreaming,
  runProductionBuild,
  streamBuildOutput,
  waitForDevServer,
} from "./build-tools";
// File operations (using native SDK methods with shell fallback)
export {
  listFilesViaSh,
  mkDirViaSh,
  readFileViaSh,
  writeFilesViaSh,
  writeFileViaSh,
} from "./file-ops";
// Package manager
export { installDependencies, installPackages } from "./package-manager";
// Sandbox management (admin utilities)
export {
  cleanupStaleSandboxes,
  collectCommandOutput,
  type GetSandboxOptions,
  getSandbox,
  getSandboxStats,
  type ListSandboxesOptions,
  type ListSandboxesResult,
  listSandboxes,
  type SandboxPagination,
  type SandboxSummary,
  streamCommandLogs,
} from "./sandbox-manager";
// Security
export {
  ALLOWED_COMMANDS,
  ALLOWED_DIRECTORIES,
  ALLOWED_ROOT_PATTERNS,
  BLOCKED_COMMAND_PATTERNS,
  isCommandAllowed,
  isPathAllowed,
} from "./security";
// Tool executor
export { executeToolCall, type ToolExecutionResult } from "./tool-executor";
// Tool schemas
export { type ToolName, toolSchemas } from "./tool-schemas";
// Types
export type {
  CommandFinished,
  CommandResult,
  RunCommandOptions,
  SandboxConfig,
  SandboxFile,
  SandboxInstance,
  SandboxProgress,
  SandboxSessionData,
} from "./types";
