/**
 * Secrets Loading Helpers
 *
 * Unified secret resolution with proper hierarchy:
 * 1. Project-scoped secrets (highest priority)
 * 2. Organization-level secrets
 *
 * All functions fail-fast - no defensive fallbacks.
 */

import { secretsService } from "./secrets";
import type { SecretProjectType, SecretEnvironment } from "@/db/schemas/secrets";

export interface SecretContext {
  organizationId: string;
  projectId?: string;
  projectType?: SecretProjectType;
  environment?: SecretEnvironment;
}

export interface AgentSecretContext {
  organizationId: string;
  characterId: string;
}

export interface McpSecretContext {
  organizationId: string;
  mcpId: string;
}

export interface WorkflowSecretContext {
  organizationId: string;
  workflowId: string;
}

export interface ContainerSecretContext {
  organizationId: string;
  containerId?: string;
}

export interface SandboxSecretContext {
  organizationId: string;
  appId?: string;
}

/**
 * Load secrets for a given context with proper hierarchy.
 * Project secrets override organization secrets.
 *
 * Throws if secrets service is not configured or on any error.
 */
export async function loadSecrets(ctx: SecretContext): Promise<Record<string, string>> {
  assertSecretsConfigured();

  const orgSecrets = await secretsService.getDecrypted({
    organizationId: ctx.organizationId,
  });

  if (!ctx.projectId) {
    return orgSecrets;
  }

  const projectSecrets = await secretsService.getDecrypted({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
  });

  return { ...orgSecrets, ...projectSecrets };
}

/**
 * Load secrets for an agent/character.
 * Includes org-level + character-scoped secrets.
 */
export async function loadAgentSecrets(ctx: AgentSecretContext): Promise<Record<string, string>> {
  return loadSecrets({
    organizationId: ctx.organizationId,
    projectId: ctx.characterId,
    projectType: "character",
  });
}

/**
 * Load secrets for an MCP.
 * Includes org-level + MCP-scoped secrets.
 */
export async function loadMcpSecrets(ctx: McpSecretContext): Promise<Record<string, string>> {
  return loadSecrets({
    organizationId: ctx.organizationId,
    projectId: ctx.mcpId,
    projectType: "mcp",
  });
}

/**
 * Load secrets for an n8n workflow.
 * Includes org-level + workflow-scoped secrets.
 */
export async function loadWorkflowSecrets(ctx: WorkflowSecretContext): Promise<Record<string, string>> {
  return loadSecrets({
    organizationId: ctx.organizationId,
    projectId: ctx.workflowId,
    projectType: "workflow",
  });
}

/**
 * Load secrets for a container deployment.
 * Includes org-level + optional container-scoped secrets.
 */
export async function loadContainerSecrets(ctx: ContainerSecretContext): Promise<Record<string, string>> {
  return loadSecrets({
    organizationId: ctx.organizationId,
    projectId: ctx.containerId,
    projectType: ctx.containerId ? "container" : undefined,
  });
}

/**
 * Load secrets for a sandbox/app.
 * Includes org-level + optional app-scoped secrets.
 */
export async function loadSandboxSecrets(ctx: SandboxSecretContext): Promise<Record<string, string>> {
  return loadSecrets({
    organizationId: ctx.organizationId,
    projectId: ctx.appId,
    projectType: ctx.appId ? "app" : undefined,
  });
}

/**
 * Load organization-level secrets only.
 */
export async function loadOrgSecrets(organizationId: string): Promise<Record<string, string>> {
  assertSecretsConfigured();
  return secretsService.getDecrypted({ organizationId });
}

/**
 * Check if secrets service is configured.
 * Use this for conditional UI display, not for conditional loading.
 */
export function isSecretsConfigured(): boolean {
  return secretsService.isConfigured;
}

/**
 * Assert that secrets service is configured.
 * Throws SecretsNotConfiguredError if not.
 */
export function assertSecretsConfigured(): void {
  if (!secretsService.isConfigured) {
    throw new SecretsNotConfiguredError();
  }
}

/**
 * Error thrown when secrets service is not configured.
 */
export class SecretsNotConfiguredError extends Error {
  constructor() {
    super("Secrets service is not configured. Set SECRETS_MASTER_KEY or configure AWS KMS.");
    this.name = "SecretsNotConfiguredError";
  }
}

