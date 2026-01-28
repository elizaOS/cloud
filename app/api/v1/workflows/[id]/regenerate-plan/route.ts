/**
 * Regenerate Execution Plan API
 *
 * POST /api/v1/workflows/[id]/regenerate-plan
 *
 * Re-analyzes the workflow's user intent and generates a new execution plan.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { generatedWorkflowsRepository } from "@/db/repositories";
import { dependencyResolver } from "@/lib/services/workflow-engine";
import { googleAutomationService } from "@/lib/services/google-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import type { ServiceConnectionStatus } from "@/lib/services/workflow-engine/service-specs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Get connected services status for an organization
 */
async function getConnectedServices(
  organizationId: string,
): Promise<ServiceConnectionStatus[]> {
  const services: ServiceConnectionStatus[] = [];

  // Check Google
  try {
    const googleStatus = await googleAutomationService.getConnectionStatus(
      organizationId,
    );
    services.push({
      serviceId: "google",
      connected: googleStatus.connected,
      scopes: googleStatus.scopes,
    });
  } catch {
    services.push({ serviceId: "google", connected: false });
  }

  // Check Blooio
  try {
    const blooioStatus = await blooioAutomationService.getConnectionStatus(
      organizationId,
    );
    services.push({
      serviceId: "blooio",
      connected: blooioStatus.connected,
    });
  } catch {
    services.push({ serviceId: "blooio", connected: false });
  }

  // Check Twilio
  try {
    const twilioStatus = await twilioAutomationService.getConnectionStatus(
      organizationId,
    );
    services.push({
      serviceId: "twilio",
      connected: twilioStatus.connected,
    });
  } catch {
    services.push({ serviceId: "twilio", connected: false });
  }

  return services;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    const workflow = await generatedWorkflowsRepository.getById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Not authorized to update this workflow" },
        { status: 403 },
      );
    }

    // Get the user intent from the workflow
    const userIntent = workflow.user_intent || workflow.description || "";

    if (!userIntent) {
      return NextResponse.json(
        { error: "Workflow has no user intent to analyze" },
        { status: 400 },
      );
    }

    // Get connected services
    const connectedServices = await getConnectedServices(user.organization_id);

    // Re-analyze the intent
    const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);

    logger.info("[Workflows] Intent analysis for regeneration", {
      workflowId: id,
      userIntent: userIntent.substring(0, 100),
      primaryAction: intentAnalysis.primaryAction,
      targetService: intentAnalysis.targetService,
      potentialServices: intentAnalysis.potentialServices,
      confidence: intentAnalysis.confidence,
    });

    // Build new execution plan
    let executionPlan: Array<{ step: number; serviceId: string; operation: string }> = [];

    if (intentAnalysis.targetService) {
      const resolution = dependencyResolver.resolveDependencies({
        targetOperation: intentAnalysis.primaryAction,
        serviceId: intentAnalysis.targetService,
        connectedServices,
      });

      executionPlan = resolution.executionPlan.map((step) => ({
        step: step.step,
        serviceId: step.serviceId,
        operation: step.operation,
      }));
    }

    // Fallback: Build execution plan from potential services
    if (executionPlan.length === 0 && intentAnalysis.potentialServices.length > 0) {
      let stepNum = 1;

      for (const serviceId of intentAnalysis.potentialServices) {
        let operation = intentAnalysis.primaryAction || "execute";

        // Map service to common operations
        if (serviceId === "google") {
          if (operation.includes("email") || operation === "unknown") {
            operation = "sendEmail";
          } else if (operation.includes("calendar")) {
            operation = "listCalendarEvents";
          }
        } else if (serviceId === "twilio") {
          operation = "sendSms";
        } else if (serviceId === "blooio") {
          operation = "sendIMessage";
        }

        executionPlan.push({
          step: stepNum++,
          serviceId,
          operation,
        });
      }
    }

    // Last resort: Use service dependencies from the workflow
    if (executionPlan.length === 0 && workflow.service_dependencies?.length > 0) {
      let stepNum = 1;
      for (const serviceId of workflow.service_dependencies) {
        let operation = "execute";

        if (serviceId === "google") {
          operation = "sendEmail";
        } else if (serviceId === "twilio") {
          operation = "sendSms";
        } else if (serviceId === "blooio") {
          operation = "sendIMessage";
        }

        executionPlan.push({
          step: stepNum++,
          serviceId,
          operation,
        });
      }
    }

    // Update the workflow with the new execution plan
    const updated = await generatedWorkflowsRepository.update(id, {
      execution_plan: executionPlan,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update workflow" },
        { status: 500 },
      );
    }

    logger.info("[Workflows] Execution plan regenerated", {
      workflowId: id,
      planSteps: executionPlan.length,
      intentAnalysis: {
        primaryAction: intentAnalysis.primaryAction,
        targetService: intentAnalysis.targetService,
        confidence: intentAnalysis.confidence,
      },
    });

    return NextResponse.json({
      success: true,
      executionPlan,
      analysis: {
        primaryAction: intentAnalysis.primaryAction,
        targetService: intentAnalysis.targetService,
        potentialServices: intentAnalysis.potentialServices,
        confidence: intentAnalysis.confidence,
      },
    });
  } catch (error) {
    logger.error("[Workflows] Failed to regenerate execution plan", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: id,
    });

    return NextResponse.json(
      { error: "Failed to regenerate execution plan" },
      { status: 500 },
    );
  }
}
