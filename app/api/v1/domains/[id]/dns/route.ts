/**
 * DNS Records API
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import {
  domainNotFound,
  parseJsonBody,
  type DomainRouteParams,
} from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

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

const dnsNotManageable = () =>
  NextResponse.json(
    {
      error:
        "DNS records can only be managed for domains using Vercel nameservers",
    },
    { status: 400 },
  );

export async function GET(request: NextRequest, { params }: DomainRouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id,
  );
  if (!domain) return domainNotFound();

  const records = await domainManagementService.getDnsRecords(id);
  return NextResponse.json({
    success: true,
    domain: domain.domain,
    records,
    manageable:
      domain.registrar === "vercel" && domain.nameserverMode === "vercel",
  });
}

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
  if (domain.registrar !== "vercel" || domain.nameserverMode !== "vercel")
    return dnsNotManageable();

  const parseResult = await parseJsonBody(request, AddDnsRecordSchema);
  if (!parseResult.success) return parseResult.response;

  logger.info("[Domains API] Adding DNS record", {
    domainId: id,
    recordType: parseResult.data.type,
    recordName: parseResult.data.name,
  });

  const result = await domainManagementService.addDnsRecord(
    id,
    parseResult.data,
  );
  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to add DNS record" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    record: result.record,
    message: "DNS record added",
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
  if (domain.registrar !== "vercel" || domain.nameserverMode !== "vercel")
    return dnsNotManageable();

  const recordId = new URL(request.url).searchParams.get("recordId");
  if (!recordId) {
    return NextResponse.json(
      { error: "recordId query parameter is required" },
      { status: 400 },
    );
  }

  logger.info("[Domains API] Deleting DNS record", { domainId: id, recordId });

  const result = await domainManagementService.deleteDnsRecord(id, recordId);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to delete DNS record" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, message: "DNS record deleted" });
}
