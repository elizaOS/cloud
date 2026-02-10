import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdmin(request);

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
    const message = error instanceof Error ? error.message : "Authentication failed";
    const status = message.includes("Wallet connection") ? 401 :
                   message.includes("Admin access") ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
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
    const message = error instanceof Error ? error.message : "Authentication failed";
    const status = message.includes("Wallet connection") ? 401 :
                   message.includes("Admin access") ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
