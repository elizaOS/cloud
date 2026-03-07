import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

function getAdminAuthStatus(error: unknown): 401 | 403 | null {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Unauthorized") ||
    message.includes("Authentication required") ||
    message.includes("Invalid or expired token") ||
    message.includes("Invalid or expired API key") ||
    message.includes("Invalid wallet signature") ||
    message.includes("Wallet authentication failed") ||
    message.includes("Wallet connection required for admin access")
  ) {
    return 401;
  }

  if (message.includes("Admin access required")) {
    return 403;
  }

  return null;
}

function handleAdminError(error: unknown, context: string) {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  const authStatus = getAdminAuthStatus(error);

  if (authStatus) {
    return NextResponse.json({ error: message }, { status: authStatus });
  }

  logger.error(`[Admin Service Pricing] ${context}`, { error: message });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const url = new URL(request.url);
    const serviceId = url.searchParams.get("service_id");

    if (!serviceId) {
      return NextResponse.json(
        { error: "service_id query parameter required" },
        { status: 400 },
      );
    }

    const pricing = await servicePricingRepository.listByService(serviceId);

    return NextResponse.json({
      service_id: serviceId,
      pricing: pricing.map((p) => ({
        id: p.id,
        method: p.method,
        cost: Number(p.cost),
        description: p.description,
        metadata: p.metadata,
        is_active: p.is_active,
        updated_by: p.updated_by,
        updated_at: p.updated_at,
      })),
    });
  } catch (error) {
    return handleAdminError(error, "Failed to load service pricing");
  }
}

const UpsertSchema = z.object({
  service_id: z.string(),
  method: z.string(),
  cost: z.number().positive(),
  reason: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdmin(request);

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpsertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { service_id, method, cost, reason, description, metadata } =
      parsed.data;

    // Double invalidation to prevent race conditions:
    // 1. Clear cache before update (prevents serving stale data)
    await invalidateServicePricingCache(service_id);

    const result = await servicePricingRepository.upsert(
      service_id,
      method,
      cost,
      user.id,
      reason,
      description,
      metadata,
    );

    // 2. Clear cache after update (ensures no cached stale data from the window)
    await invalidateServicePricingCache(service_id);

    logger.info("[Admin] Service pricing updated", {
      service_id,
      method,
      cost,
      updated_by: user.id,
      reason,
    });

    return NextResponse.json({
      success: true,
      pricing: {
        id: result.id,
        service_id: result.service_id,
        method: result.method,
        cost: Number(result.cost),
        description: result.description,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    return handleAdminError(error, "Failed to update service pricing");
  }
}
