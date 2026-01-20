"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import { workflowsRepository, workflowRunsRepository } from "@/db/repositories";
import type {
  NewWorkflow,
  WorkflowStatus,
  WorkflowNode,
  WorkflowEdge,
  WorkflowTriggerConfig,
} from "@/db/schemas";
import { revalidatePath } from "next/cache";
import {
  workflowExecutorService,
  type ExecutionResult,
} from "@/lib/services/workflow-executor";

/**
 * Creates a new workflow for the authenticated user's organization.
 */
export async function createWorkflow(data: {
  name: string;
  description?: string;
  trigger_config?: WorkflowTriggerConfig;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}) {
  const user = await requireAuthWithOrg();

  const newWorkflow: NewWorkflow = {
    name: data.name,
    description: data.description ?? null,
    organization_id: user.organization_id,
    created_by_user_id: user.id,
    status: "draft",
    trigger_config: data.trigger_config ?? { type: "manual" },
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
  };

  const workflow = await workflowsRepository.create(newWorkflow);

  revalidatePath("/dashboard/workflows");
  return workflow;
}

/**
 * Runs/executes a workflow.
 */
export async function runWorkflow(
  workflowId: string,
  triggerInput?: Record<string, unknown>,
): Promise<ExecutionResult> {
  const user = await requireAuthWithOrg();

  // Create run record first (marks as "running")
  const run = await workflowRunsRepository.create({
    workflowId,
    triggerSource: "manual",
  });

  const result = await workflowExecutorService.execute(
    workflowId,
    user.organization_id,
    user.id,
    triggerInput,
  );

  // Build node results from outputs
  const nodeResults = Object.entries(result.outputs).map(([nodeId, output]) => {
    const outputData = output as Record<string, unknown>;
    const hasError = result.logs.some(
      (log) => log.nodeId === nodeId && log.level === "error",
    );
    return {
      nodeId,
      nodeType: (outputData?.type as string) ?? "unknown",
      status: hasError ? "error" as const : "success" as const,
      output,
      error: hasError
        ? result.logs.find((l) => l.nodeId === nodeId && l.level === "error")
            ?.message
        : undefined,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0,
    };
  });

  // Update run record with results
  await workflowRunsRepository.complete(run.id, {
    status: result.success ? "success" : "error",
    nodeResults,
    error: result.error,
  });

  return result;
}

/**
 * Updates an existing workflow owned by the authenticated user's organization.
 */
export async function updateWorkflow(
  workflowId: string,
  data: {
    name?: string;
    description?: string;
    status?: WorkflowStatus;
    trigger_config?: WorkflowTriggerConfig;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
  },
) {
  const user = await requireAuthWithOrg();

  const workflow = await workflowsRepository.updateByOrganization(
    workflowId,
    user.organization_id,
    data,
  );

  if (!workflow) {
    throw new Error("Workflow not found or access denied");
  }

  revalidatePath("/dashboard/workflows");
  return workflow;
}

/**
 * Deletes a workflow owned by the authenticated user's organization.
 */
export async function deleteWorkflow(workflowId: string) {
  const user = await requireAuthWithOrg();

  const success = await workflowsRepository.deleteByOrganization(
    workflowId,
    user.organization_id,
  );

  if (!success) {
    throw new Error("Workflow not found or access denied");
  }

  revalidatePath("/dashboard/workflows");
  return { success: true };
}

/**
 * Lists all workflows for the authenticated user's organization.
 */
export async function listWorkflows(options?: {
  status?: WorkflowStatus;
  limit?: number;
  offset?: number;
}) {
  const user = await requireAuthWithOrg();

  const workflows = await workflowsRepository.listByOrganization(
    user.organization_id,
    options,
  );

  return workflows;
}

/**
 * Gets a specific workflow by ID.
 */
export async function getWorkflow(workflowId: string) {
  const user = await requireAuthWithOrg();

  const workflow = await workflowsRepository.findByIdAndOrganization(
    workflowId,
    user.organization_id,
  );

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  return workflow;
}

/**
 * Gets recent execution runs for a workflow.
 */
export async function getWorkflowRuns(workflowId: string, limit = 20) {
  const user = await requireAuthWithOrg();

  // Verify workflow belongs to user's org
  const workflow = await workflowsRepository.findByIdAndOrganization(
    workflowId,
    user.organization_id,
  );

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const runs = await workflowRunsRepository.listByWorkflow(workflowId, { limit });

  return runs;
}

/**
 * Gets the most recent run for a workflow.
 */
export async function getLatestWorkflowRun(workflowId: string) {
  const user = await requireAuthWithOrg();

  // Verify workflow belongs to user's org
  const workflow = await workflowsRepository.findByIdAndOrganization(
    workflowId,
    user.organization_id,
  );

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const run = await workflowRunsRepository.getLatestRun(workflowId);

  return run;
}
