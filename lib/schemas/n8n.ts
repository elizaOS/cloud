/**
 * Shared N8N Zod Schemas
 */

import { z } from "zod";

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  workflowData: z.record(z.unknown()),
  tags: z.array(z.string()).optional(),
});

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  workflowData: z.record(z.unknown()).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  tags: z.array(z.string()).optional(),
});

export const ExecuteWorkflowSchema = z.object({
  inputData: z.record(z.unknown()).optional(),
  triggerType: z.enum(["manual", "api", "miniapp"]).optional().default("api"),
});

export const DeployWorkflowSchema = z.object({
  instanceId: z.string().uuid("instanceId must be a valid UUID"),
  activate: z.boolean().optional().default(true),
});

export const TestWorkflowSchema = z.object({
  inputData: z.record(z.unknown()).optional(),
});

export const CreateVariableSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  isSecret: z.boolean().optional().default(false),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

export const CreateInstanceSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;
export type ExecuteWorkflowInput = z.infer<typeof ExecuteWorkflowSchema>;
export type DeployWorkflowInput = z.infer<typeof DeployWorkflowSchema>;
export type TestWorkflowInput = z.infer<typeof TestWorkflowSchema>;
export type CreateVariableInput = z.infer<typeof CreateVariableSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type CreateInstanceInput = z.infer<typeof CreateInstanceSchema>;

