/**
 * Domain Detail API
 *
 * GET /api/v1/domains/:id - Get domain details
 * PATCH /api/v1/domains/:id - Update domain settings
 * DELETE /api/v1/domains/:id - Remove domain from system
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { managedDomainsRepository } from "@/db/repositories/managed-domains";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UpdateDomainSchema = z.object({
  autoRenew: z.boolean().optional(),
  registrantInfo: z
    .object({
      fullName: z.string().min(1),
      email: z.string().email(),
      organization: z.string().optional(),
      address: z.object({
        street: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().length(2),
      }),
      phone: z.string().optional(),
      privacyEnabled: z.boolean().optional(),
    })
    .optional(),
});

/**
 * GET /api/v1/domains/:id
 * Get domain details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id
  );

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Get DNS records if applicable
  const dnsRecords = await domainManagementService.getDnsRecords(id);

  // Get moderation events
  const events = await managedDomainsRepository.listEvents(id);

  return NextResponse.json({
    success: true,
    domain,
    dnsRecords,
    recentEvents: events.slice(0, 10),
  });
}

/**
 * PATCH /api/v1/domains/:id
 * Update domain settings
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const parsed = UpdateDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  logger.info("[Domains API] Updating domain", {
    domainId: id,
    updates: Object.keys(parsed.data),
  });

  const updated = await managedDomainsRepository.updateByOrg(
    id,
    user.organization_id,
    parsed.data
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update domain" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    domain: updated,
  });
}

/**
 * DELETE /api/v1/domains/:id
 * Remove domain from system
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

  logger.info("[Domains API] Deleting domain", {
    domainId: id,
    domain: domain.domain,
  });

  const result = await domainManagementService.deleteDomain(
    id,
    user.organization_id
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to delete domain" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Domain removed from system",
  });
}

