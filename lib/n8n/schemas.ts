/**
 * Shared n8n schemas, types, and utilities.
 * Used across all n8n API routes to avoid duplication.
 */

import { z } from "zod";

// =============================================================================
// CONSTANTS
// =============================================================================

export const N8N_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

export const VARIABLE_TYPES = ["string", "number", "boolean", "json"] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];

export const TRIGGER_TYPES = ["cron", "webhook", "a2a", "mcp"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const WORKFLOW_STATUSES = ["draft", "active", "archived"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// =============================================================================
// SCHEMAS - Variables
// =============================================================================

export const CreateVariableSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  type: z.enum(VARIABLE_TYPES).optional(),
  isSecret: z.boolean().optional(),
  description: z.string().optional(),
});

export const UpdateVariableSchema = z.object({
  value: z.string().optional(),
  type: z.enum(VARIABLE_TYPES).optional(),
  description: z.string().optional(),
  isSecret: z.boolean().optional(),
});

// =============================================================================
// SCHEMAS - API Keys
// =============================================================================

export const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const UpdateApiKeySchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

// =============================================================================
// SCHEMAS - Triggers
// =============================================================================

const TriggerConfigSchema = z.object({
  cronExpression: z.string().optional(),
  inputData: z.record(z.unknown()).optional(),
  requireSignature: z.boolean().optional().default(true),
  includeOutputInResponse: z.boolean().optional().default(false),
  allowedIps: z.array(z.string()).optional(),
  maxExecutionsPerDay: z.number().int().positive().max(100000).optional(),
  estimatedCostPerExecution: z.number().min(0).max(100).optional(),
}).passthrough();

export const CreateTriggerSchema = z.object({
  workflowId: z.string().uuid(),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerKey: z.string().min(1).optional(),
  config: TriggerConfigSchema.optional().default({}),
});

export const UpdateTriggerSchema = z.object({
  isActive: z.boolean().optional(),
  config: TriggerConfigSchema.partial().optional(),
});

// =============================================================================
// RESPONSE TRANSFORMERS
// =============================================================================

interface VariableRecord {
  id: string;
  name: string;
  value: string;
  type: string;
  is_secret: boolean;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export function formatVariable(v: VariableRecord) {
  return {
    id: v.id,
    name: v.name,
    value: v.is_secret ? "***" : v.value,
    type: v.type,
    isSecret: v.is_secret,
    description: v.description,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  };
}

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  expires_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

export function formatApiKey(k: ApiKeyRecord) {
  return {
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    scopes: k.scopes,
    isActive: k.is_active,
    expiresAt: k.expires_at,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
  };
}

interface TriggerRecord {
  id: string;
  workflow_id: string;
  organization_id: string;
  trigger_type: string;
  trigger_key: string;
  config: Record<string, unknown>;
  is_active: boolean;
  last_executed_at: Date | null;
  execution_count: number;
  error_count: number;
  created_at: Date;
  updated_at: Date;
}

export function redactTriggerConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...config };
  if (safe.webhookSecret) {
    delete safe.webhookSecret;
    safe.hasWebhookSecret = true;
  }
  return safe;
}

export function formatTrigger(t: TriggerRecord, includeWebhookUrl = true) {
  const result: Record<string, unknown> = {
    id: t.id,
    workflowId: t.workflow_id,
    organizationId: t.organization_id,
    triggerType: t.trigger_type,
    triggerKey: t.trigger_key,
    config: redactTriggerConfig(t.config),
    isActive: t.is_active,
    lastExecutedAt: t.last_executed_at,
    executionCount: t.execution_count,
    errorCount: t.error_count,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };

  if (includeWebhookUrl && t.trigger_type === "webhook") {
    result.webhookUrl = `${N8N_BASE_URL}/api/v1/n8n/webhooks/${t.trigger_key}`;
  }

  return result;
}

// =============================================================================
// ERROR RESPONSES
// =============================================================================

export const ErrorResponses = {
  workflowNotFound: { success: false, error: "Workflow not found" } as const,
  triggerNotFound: { success: false, error: "Trigger not found" } as const,
  variableNotFound: { success: false, error: "Variable not found" } as const,
  invalidRequest: (details: unknown) => ({
    success: false,
    error: "Invalid request",
    details,
  }),
} as const;

