import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

async function requireAdmin(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.wallet_address) {
    return {
      error: "Wallet connection required for admin access",
      status: 401,
      user: null,
    };
  }

  const { isAdmin } = await adminService.getAdminStatus(user.wallet_address);

  if (!isAdmin) {
    return {
      error: "Admin access required",
      status: 403,
      user: null,
    };
  }

  return {
    error: null,
    status: 200,
    user,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
}

const UpsertSchema = z.object({
  service_id: z.string(),
  method: z.string(),
  cost: z.number().positive(),
  reason: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
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
    auth.user!.id,
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
    updated_by: auth.user!.id,
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
}
