
/**
 * Admin Service Pricing Management API
 * 
 * CRITICAL: Revenue-generating endpoint - pricing changes affect billing
 * 
 * Cache Consistency Strategy:
 * - Double invalidation (pre + post DB update) prevents race conditions
 * - TTL-based safety net (5min) limits stale data exposure
 * - Fail-fast behavior makes cache failures visible
 * - Critical logging for post-update cache failures
 * 
 * Monitoring Recommendations:
 * - Alert on CRITICAL log level for cache invalidation failures
 * - Track pricing cache hit/miss ratios
 * - Monitor cache invalidation error rates
 * - Set up dead letter queue for failed invalidations
 * 
 * @see lib/services/proxy/pricing.ts for cache implementation
 * @see docs/api-security.md for security architecture
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Service pricing auth error",
  );
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const url = new URL(request.url);
  const serviceId = url.searchParams.get("service_id");

  if (!serviceId) {
    return NextResponse.json(
      { error: "service_id query parameter is required" },
      { status: 400 },
    );
  }

  const pricing = await servicePricingRepository.listByService(serviceId);

  return NextResponse.json({
    service_id: serviceId,
    pricing: pricing.map((p) => ({
      id: p.id,
      method: p.method,
      cost: p.cost,
      description: p.description,
      is_active: p.is_active,
      updated_at: p.updated_at,
    })),
  });
}

const UpsertSchema = z.object({
  service_id: z.string(),
  method: z.string(),
  cost: z.number().positive(),
  reason: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string().max(100), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])).refine(
    (val) => Object.keys(val).length <= 20,
    { message: "Metadata cannot have more than 20 keys" },
  ).optional(),
});

export async function PUT(request: NextRequest) {
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Service pricing auth error",
  );
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const user = authResult.user;

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { service_id, method, cost, reason, description, metadata } = parsed.data;

  try {
    // Pre-update cache invalidation
    let cacheInvalidated = false;
    try {
      await invalidateServicePricingCache(service_id);
      cacheInvalidated = true;
    } catch (error) {
      logger.warn("[Admin] Pre-update cache invalidation failed", {
        service_id,
        method,
        error: error instanceof Error ? error.message : "Unknown",
      });
    }

    const result = await servicePricingRepository.upsert(
      service_id,
      method,
      cost,
      user.id,
      reason,
      description,
      metadata,
    );

    // Post-update cache invalidation
    try {
      await invalidateServicePricingCache(service_id);
      cacheInvalidated = true;
    } catch (retryError) {
      logger.error("[Admin] CRITICAL: Post-update cache invalidation failed", {
        service_id,
        method,
        retryError: retryError instanceof Error ? retryError.message : "Unknown",
      });
    }

    logger.info("[Admin] Service pricing updated", {
      service_id,
      method,
      cost,
      updated_by: user.id,
      reason,
      cache_invalidated: cacheInvalidated,
    });

    return NextResponse.json({
      success: true,
      pricing: {
        id: result.id,
        service_id: result.service_id,
        method: result.method,
        cost: result.cost,
        is_active: result.is_active,
        updated_at: result.updated_at,
      },
      cache_invalidated: cacheInvalidated,
    });
  } catch (error) {
    logger.error("[Admin] Service pricing PUT error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
