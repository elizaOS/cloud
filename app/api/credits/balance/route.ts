import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { organizationsRepository } from "@/db/repositories";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const organizationId = user.organization_id;
    const cacheKey = CacheKeys.org.credits(organizationId);

    // Short cache (30s) to reduce DB hits while keeping balance fresh
    const balance = await cache.getWithSWR<number>(cacheKey, CacheTTL.org.credits, async () => {
      const org = await organizationsRepository.findById(organizationId);
      if (!org) return null;
      return Number(org.credit_balance || 0);
    });

    if (balance === null) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ balance });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch balance";
    const isAuthError = msg.includes("Unauthorized") || msg.includes("Authentication") || msg.includes("Forbidden");
    
    if (isAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.error("[Balance API] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
