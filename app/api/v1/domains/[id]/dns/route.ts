/**
 * DNS Records API
 *
 * GET /api/v1/domains/:id/dns - Get DNS records
 * POST /api/v1/domains/:id/dns - Add a DNS record
 * DELETE /api/v1/domains/:id/dns - Delete a DNS record
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const AddDnsRecordSchema = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"]),
  name: z.string().min(1).max(255),
  value: z.string().min(1).max(4096),
  ttl: z.number().int().min(60).max(86400).optional(),
  priority: z.number().int().min(0).max(65535).optional(),
  mxPriority: z.number().int().min(0).max(65535).optional(),
  srvWeight: z.number().int().min(0).max(65535).optional(),
  srvPort: z.number().int().min(0).max(65535).optional(),
});

const DeleteDnsRecordSchema = z.object({
  recordId: z.string().min(1),
});

/**
 * GET /api/v1/domains/:id/dns
 * Get DNS records for a domain
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

  const records = await domainManagementService.getDnsRecords(id);

  return NextResponse.json({
    success: true,
    domain: domain.domain,
    records,
    manageable:
      domain.registrar === "vercel" && domain.nameserverMode === "vercel",
  });
}

/**
 * POST /api/v1/domains/:id/dns
 * Add a DNS record
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

  if (domain.registrar !== "vercel" || domain.nameserverMode !== "vercel") {
    return NextResponse.json(
      {
        error:
          "DNS records can only be managed for domains using Vercel nameservers",
      },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AddDnsRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  logger.info("[Domains API] Adding DNS record", {
    domainId: id,
    recordType: parsed.data.type,
    recordName: parsed.data.name,
  });

  const result = await domainManagementService.addDnsRecord(id, parsed.data);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to add DNS record" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    record: result.record,
    message: "DNS record added",
  });
}

/**
 * DELETE /api/v1/domains/:id/dns
 * Delete a DNS record
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

  if (domain.registrar !== "vercel" || domain.nameserverMode !== "vercel") {
    return NextResponse.json(
      {
        error:
          "DNS records can only be managed for domains using Vercel nameservers",
      },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const recordId = url.searchParams.get("recordId");

  const parsed = DeleteDnsRecordSchema.safeParse({ recordId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "recordId query parameter is required" },
      { status: 400 }
    );
  }

  logger.info("[Domains API] Deleting DNS record", {
    domainId: id,
    recordId: parsed.data.recordId,
  });

  const result = await domainManagementService.deleteDnsRecord(
    id,
    parsed.data.recordId
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to delete DNS record" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "DNS record deleted",
  });
}

