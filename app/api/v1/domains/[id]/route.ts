/**
 * Domain Detail API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { managedDomainsRepository } from "@/db/repositories/managed-domains";
import { UpdateDomainSchema, parseJsonBody, domainNotFound, type DomainRouteParams } from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest, { params }: DomainRouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(id, user.organization_id);
  if (!domain) return domainNotFound();

  const [dnsRecords, events] = await Promise.all([
    domainManagementService.getDnsRecords(id),
    managedDomainsRepository.listEvents(id),
  ]);

  return NextResponse.json({ success: true, domain, dnsRecords, recentEvents: events.slice(0, 10) });
}

export async function PATCH(request: NextRequest, { params }: DomainRouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(id, user.organization_id);
  if (!domain) return domainNotFound();

  const result = await parseJsonBody(request, UpdateDomainSchema);
  if (!result.success) return result.response;

  logger.info("[Domains API] Updating domain", { domainId: id, updates: Object.keys(result.data) });

  const updated = await managedDomainsRepository.updateByOrg(id, user.organization_id, result.data);
  if (!updated) return NextResponse.json({ error: "Failed to update domain" }, { status: 500 });

  return NextResponse.json({ success: true, domain: updated });
}

export async function DELETE(request: NextRequest, { params }: DomainRouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(id, user.organization_id);
  if (!domain) return domainNotFound();

  logger.info("[Domains API] Deleting domain", { domainId: id, domain: domain.domain });

  const deleteResult = await domainManagementService.deleteDomain(id, user.organization_id);
  if (!deleteResult.success) {
    return NextResponse.json({ error: deleteResult.error || "Failed to delete domain" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Domain removed from system" });
}

