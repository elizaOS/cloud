/**
 * Domain Assignment API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import {
  AssignDomainSchema,
  parseJsonBody,
  domainNotFound,
  type DomainRouteParams,
} from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

export async function POST(
  request: NextRequest,
  { params }: DomainRouteParams,
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id,
  );
  if (!domain) return domainNotFound();

  const result = await parseJsonBody(request, AssignDomainSchema);
  if (!result.success) return result.response;

  const { resourceType, resourceId } = result.data;
  logger.info("[Domains API] Assigning domain", {
    domainId: id,
    resourceType,
    resourceId,
  });

  const updated = await domainManagementService.assignToResource(
    id,
    resourceType,
    resourceId,
    user.organization_id,
  );
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Failed to assign domain. Ensure the domain is verified and the resource exists.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    domain: updated,
    message: `Domain assigned to ${resourceType}`,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: DomainRouteParams,
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id,
  );
  if (!domain) return domainNotFound();
  if (!domain.resourceType) {
    return NextResponse.json({
      success: true,
      message: "Domain is not assigned to any resource",
    });
  }

  logger.info("[Domains API] Unassigning domain", {
    domainId: id,
    previousResource: domain.resourceType,
  });

  const updated = await domainManagementService.unassignDomain(
    id,
    user.organization_id,
  );
  if (!updated)
    return NextResponse.json(
      { error: "Failed to unassign domain" },
      { status: 500 },
    );

  return NextResponse.json({
    success: true,
    domain: updated,
    message: "Domain unassigned",
  });
}
