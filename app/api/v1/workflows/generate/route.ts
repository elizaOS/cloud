/**
 * Workflow Generation API
 *
 * POST /api/v1/workflows/generate
 *
 * Generates a new workflow using AI based on user intent.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import {
  workflowFactory,
  dependencyResolver,
  type ServiceConnectionStatus,
} from "@/lib/services/workflow-engine";
import { generatedWorkflowsRepository } from "@/db/repositories";
import { googleAutomationService } from "@/lib/services/google-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes for AI generation

interface GenerateWorkflowRequest {
  userIntent: string;
  additionalContext?: string;
  model?: string;
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

  // Notion (not yet implemented, mark as disconnected)
  services.push({ serviceId: "notion", connected: false });

  return services;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const body = (await request.json()) as GenerateWorkflowRequest;
    const { userIntent, additionalContext, model } = body;

    if (!userIntent || userIntent.trim().length < 10) {
      return NextResponse.json(
        { error: "User intent must be at least 10 characters" },
        { status: 400 },
      );
    }

    // Check if Anthropic API key is configured
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "AI generation not configured. Please set ANTHROPIC_API_KEY." },
        { status: 503 },
      );
    }

    // Initialize workflow factory if needed
    if (!workflowFactory.isReady()) {
      workflowFactory.initialize(anthropicKey);
    }

    // Get connected services
    const connectedServices = await getConnectedServices(user.organization_id);

    // Analyze intent first to provide quick feedback
    const intentAnalysis = dependencyResolver.analyzeIntent(userIntent);

    // Check if any required services are missing
    const requiredServices = intentAnalysis.potentialServices;
    const missingServices = requiredServices.filter(
      (serviceId) =>
        !connectedServices.find((s) => s.serviceId === serviceId && s.connected),
    );

    if (missingServices.length > 0 && requiredServices.length > 0) {
      return NextResponse.json(
        {
          error: "Missing required service connections",
          missingServices,
          intentAnalysis,
          suggestion: `Please connect ${missingServices.join(", ")} to use this workflow.`,
        },
        { status: 400 },
      );
    }

    logger.info("[Workflows] Generating workflow", {
      organizationId: user.organization_id,
      userId: user.id,
      intent: userIntent.substring(0, 100),
      connectedServices: connectedServices.filter((s) => s.connected).length,
    });

    // Generate the workflow
    const generatedWorkflow = await workflowFactory.generateWorkflow({
      userIntent,
      organizationId: user.organization_id,
      userId: user.id,
      connectedServices,
      additionalContext,
      model,
    });

    // Persist to database
    const savedWorkflow = await generatedWorkflowsRepository.create({
      organization_id: user.organization_id,
      created_by_user_id: user.id,
      name: generatedWorkflow.name,
      description: `AI-generated workflow: ${userIntent.substring(0, 100)}`,
      user_intent: userIntent,
      generated_code: generatedWorkflow.code,
      service_dependencies: generatedWorkflow.serviceDependencies,
      execution_plan: generatedWorkflow.executionPlan,
      test_results: generatedWorkflow.validation,
      generation_metadata: {
        model: generatedWorkflow.metadata.model,
        iterations: generatedWorkflow.metadata.iterations,
        tokensUsed: generatedWorkflow.metadata.tokensUsed,
        generatedAt: generatedWorkflow.metadata.generatedAt.toISOString(),
      },
      status: generatedWorkflow.validation.syntaxValid ? "testing" : "draft",
    });

    logger.info("[Workflows] Workflow generated and saved", {
      workflowId: savedWorkflow.id,
      organizationId: user.organization_id,
      iterations: generatedWorkflow.metadata.iterations,
      tokensUsed: generatedWorkflow.metadata.tokensUsed,
    });

    return NextResponse.json({
      success: true,
      workflow: {
        id: savedWorkflow.id,
        name: savedWorkflow.name,
        description: savedWorkflow.description,
        code: savedWorkflow.generated_code,
        serviceDependencies: savedWorkflow.service_dependencies,
        executionPlan: savedWorkflow.execution_plan,
        status: savedWorkflow.status,
        validation: savedWorkflow.test_results,
        metadata: savedWorkflow.generation_metadata,
        createdAt: savedWorkflow.created_at,
      },
    });
  } catch (error) {
    logger.error("[Workflows] Generation failed", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      {
        error: "Failed to generate workflow",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
