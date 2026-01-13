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

// Types
export type {
  RunCommandOptions,
  CommandResult,
  SandboxInstance,
  SandboxProgress,
  SandboxConfig,
  SandboxSessionData,
} from "./types";

// Security
export {
  ALLOWED_COMMANDS,
  BLOCKED_COMMAND_PATTERNS,
  ALLOWED_DIRECTORIES,
  ALLOWED_ROOT_PATTERNS,
  isCommandAllowed,
  isPathAllowed,
} from "./security";

// File operations
export { readFileViaSh, writeFileViaSh, listFilesViaSh } from "./file-ops";

// Package manager
export { installPackages, installDependencies } from "./package-manager";

// Build tools
export { checkBuild, waitForDevServer } from "./build-tools";

// Tool schemas
export { toolSchemas, type ToolName } from "./tool-schemas";

// Tool executor
export { executeToolCall, type ToolExecutionResult } from "./tool-executor";
