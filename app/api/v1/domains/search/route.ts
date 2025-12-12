/**
 * Domain Search API
 *
 * GET /api/v1/domains/search - Search for available domains
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { logger } from "@/lib/utils/logger";

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(63),
  tlds: z.string().optional(), // Comma-separated TLDs
});

/**
 * GET /api/v1/domains/search
 * Search for available domains
 */
export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const tldsParam = url.searchParams.get("tlds");

  const parsed = SearchQuerySchema.safeParse({ q: query, tlds: tldsParam });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid search query", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const tlds = parsed.data.tlds?.split(",").filter(Boolean);

  logger.info("[Domains API] Searching domains", {
    query: parsed.data.q,
    tlds,
  });

  const results = await domainManagementService.searchDomains(
    parsed.data.q,
    tlds
  );

  return NextResponse.json({
    success: true,
    query: parsed.data.q,
    results,
    availableCount: results.filter((r) => r.available).length,
  });
}

