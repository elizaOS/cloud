/**
 * Domain Assignment API
 *
 * POST /api/v1/domains/:id/assign - Assign domain to a resource
 * DELETE /api/v1/domains/:id/assign - Unassign domain from resource
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const AssignDomainSchema = z.object({
  resourceType: z.enum(["app", "container", "agent", "mcp"]),
  resourceId: z.string().uuid(),
});

/**
 * POST /api/v1/domains/:id/assign
 * Assign domain to a resource
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id
  );

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AssignDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { resourceType, resourceId } = parsed.data;

  logger.info("[Domains API] Assigning domain", {
    domainId: id,
    resourceType,
    resourceId,
  });

  let updated;
  switch (resourceType) {
    case "app":
      updated = await domainManagementService.assignToApp(
        id,
        resourceId,
        user.organization_id
      );
      break;
    case "container":
      updated = await domainManagementService.assignToContainer(
        id,
        resourceId,
        user.organization_id
      );
      break;
    case "agent":
      updated = await domainManagementService.assignToAgent(
        id,
        resourceId,
        user.organization_id
      );
      break;
    case "mcp":
      updated = await domainManagementService.assignToMcp(
        id,
        resourceId,
        user.organization_id
      );
      break;
  }

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Failed to assign domain. Ensure the domain is verified and the resource exists.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    domain: updated,
    message: `Domain assigned to ${resourceType}`,
  });
}

/**
 * DELETE /api/v1/domains/:id/assign
 * Unassign domain from its current resource
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id
  );

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (!domain.resourceType) {
    return NextResponse.json({
      success: true,
      message: "Domain is not assigned to any resource",
    });
  }

  logger.info("[Domains API] Unassigning domain", {
    domainId: id,
    previousResource: `${domain.resourceType}:${domain.appId || domain.containerId || domain.agentId || domain.mcpId}`,
  });

  const updated = await domainManagementService.unassignDomain(
    id,
    user.organization_id
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to unassign domain" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    domain: updated,
    message: "Domain unassigned",
  });
}

