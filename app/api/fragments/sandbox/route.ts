/**
 * Fragments Sandbox API
 * Executes fragments in ephemeral containers
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { fragmentSchema, type FragmentSchema } from "@/lib/fragments/schema";
import {
  type ExecutionResult,
  type ExecutionResultInterpreter,
  type ExecutionResultWeb,
} from "@/lib/fragments/types";
import { getTemplateId } from "@/lib/fragments/templates";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { nanoid } from "nanoid";
import { fragmentSandboxStore } from "@/lib/services/fragment-sandbox-store";

export const maxDuration = 600; // 10 minutes for execution

const sandboxTimeout = 10 * 60 * 1000; // 10 minutes

interface SandboxRequest {
  fragment: FragmentSchema;
}

function isLocalDevelopment(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") ||
    process.env.NEXT_PUBLIC_APP_URL?.includes("127.0.0.1")
  );
}

async function executePythonCodeLocal(
  code: string,
  dependencies: string[],
  installCommand: string,
): Promise<ExecutionResultInterpreter> {
  const containerId = `sandbox-${nanoid()}`;

  logger.info("[Fragments Sandbox] Executing Python code locally", {
    containerId,
    codeLength: code.length,
    dependencies,
  });

  return {
    containerId,
    template: "code-interpreter-v1",
    stdout: [
      "Local Python execution not yet implemented. Use container deployment for now.",
    ],
    stderr: [],
    cellResults: [],
  };
}

async function executePythonCodeProduction(
  code: string,
  dependencies: string[],
  installCommand: string,
): Promise<ExecutionResultInterpreter> {
  const containerId = `sandbox-${nanoid()}`;

  logger.info("[Fragments Sandbox] Executing Python code in production", {
    containerId,
    codeLength: code.length,
    dependencies,
  });

  return {
    containerId,
    template: "code-interpreter-v1",
    stdout: [
      "Production Python execution not yet implemented. Use container deployment for now.",
    ],
    stderr: [],
    cellResults: [],
  };
}

async function executePythonCode(
  code: string,
  dependencies: string[],
  installCommand: string,
): Promise<ExecutionResultInterpreter> {
  if (isLocalDevelopment()) {
    return executePythonCodeLocal(code, dependencies, installCommand);
  }
  return executePythonCodeProduction(code, dependencies, installCommand);
}

async function createWebAppContainerLocal(
  fragment: FragmentSchema,
  organizationId: string,
  userId: string,
): Promise<ExecutionResultWeb> {
  const containerId = `sandbox-${nanoid()}`;

  // Store fragment for preview retrieval
  fragmentSandboxStore.set(containerId, fragment, userId, organizationId);

  logger.info("[Fragments Sandbox] Created sandbox entry locally", {
    containerId,
    template: fragment.template,
    filePath: fragment.file_path,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${baseUrl}/api/fragments/preview/${containerId}`;

  return {
    containerId,
    template: fragment.template,
    url,
  };
}

async function createWebAppContainerProduction(
  fragment: FragmentSchema,
  organizationId: string,
  userId: string,
): Promise<ExecutionResultWeb> {
  const containerId = `sandbox-${nanoid()}`;

  // Store fragment for preview retrieval
  fragmentSandboxStore.set(containerId, fragment, userId, organizationId);

  logger.info("[Fragments Sandbox] Created sandbox entry in production", {
    containerId,
    template: fragment.template,
    filePath: fragment.file_path,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com";
  const url = `${baseUrl}/api/fragments/preview/${containerId}`;

  return {
    containerId,
    template: fragment.template,
    url,
  };
}

async function createWebAppContainer(
  fragment: FragmentSchema,
  organizationId: string,
  userId: string,
): Promise<ExecutionResultWeb> {
  if (isLocalDevelopment()) {
    return createWebAppContainerLocal(fragment, organizationId, userId);
  }
  return createWebAppContainerProduction(fragment, organizationId, userId);
}

/**
 * POST /api/fragments/sandbox
 * Execute fragment in sandbox
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const body: SandboxRequest = await req.json();

    const { fragment } = body;

    const validated = fragmentSchema.parse(fragment);

    logger.info("[Fragments Sandbox] Executing fragment", {
      userId: user.id,
      organizationId: user.organization_id,
      template: validated.template,
      filePath: validated.file_path,
      isLocal: isLocalDevelopment(),
    });

    const templateId = getTemplateId(validated.template);
    const isInterpreter = templateId === "code-interpreter-v1";

    const result = isInterpreter
      ? await executePythonCode(
          validated.code,
          validated.additional_dependencies || [],
          validated.install_dependencies_command || "",
        )
      : await createWebAppContainer(validated, user.organization_id!, user.id);

    setTimeout(() => {
      logger.info("[Fragments Sandbox] Cleaning up sandbox", {
        containerId: result.containerId,
        isLocal: isLocalDevelopment(),
      });
    }, sandboxTimeout);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[Fragments Sandbox] Error", error);

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid fragment schema", details: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);
