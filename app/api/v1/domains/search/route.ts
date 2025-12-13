/**
 * Domain Search API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { DomainSearchSchema, validationError } from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const parsed = DomainSearchSchema.safeParse({ q: url.searchParams.get("q"), tlds: url.searchParams.get("tlds") });
  if (!parsed.success) return validationError(parsed.error.issues);

  const tlds = parsed.data.tlds?.split(",").filter(Boolean);
  logger.info("[Domains API] Searching domains", { query: parsed.data.q, tlds });

  const results = await domainManagementService.searchDomains(parsed.data.q, tlds);

  return NextResponse.json({
    success: true,
    query: parsed.data.q,
    results,
    availableCount: results.filter((r) => r.available).length,
  });
}

