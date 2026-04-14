/**
 * Admin endpoint for per-organization rate limit overrides.
 *
 * GET    — read current override (if any) + computed tier
 * PATCH  — upsert override fields
 * DELETE — remove all overrides (revert to automatic tier)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { orgRateLimitOverridesRepository } from "@/db/repositories/org-rate-limit-overrides";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import {
  getOrgTier,
  invalidateOrgTierCache,
} from "@/lib/services/org-rate-limits";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ orgId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Org rate limits auth error",
  );
  if (authResult instanceof NextResponse) return authResult;

  const { orgId } = await context.params;

  try {
    const [override, tier] = await Promise.all([
      orgRateLimitOverridesRepository.findByOrganizationId(orgId),
      getOrgTier(orgId),
    ]);

    return NextResponse.json({
      organization_id: orgId,
      computed_tier: tier,
      override: override ?? null,
    });
  } catch (error) {
    logger.error("[Admin] Org rate limits GET error", { error, orgId });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const PatchSchema = z.object({
  completions_rpm: z.number().int().positive().nullish(),
  embeddings_rpm: z.number().int().positive().nullish(),
  standard_rpm: z.number().int().positive().nullish(),
  strict_rpm: z.number().int().positive().nullish(),
  note: z.string().max(500).nullish(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Org rate limits auth error",
  );
  if (authResult instanceof NextResponse) return authResult;

  const { orgId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await orgRateLimitOverridesRepository.upsert({
      organization_id: orgId,
      completions_rpm: parsed.data.completions_rpm ?? undefined,
      embeddings_rpm: parsed.data.embeddings_rpm ?? undefined,
      standard_rpm: parsed.data.standard_rpm ?? undefined,
      strict_rpm: parsed.data.strict_rpm ?? undefined,
      note: parsed.data.note ?? undefined,
    });

    await invalidateOrgTierCache(orgId);

    logger.info("[Admin] Org rate limit override updated", {
      orgId,
      override: result,
      updatedBy: authResult.user?.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[Admin] Org rate limits PATCH error", { error, orgId });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Org rate limits auth error",
  );
  if (authResult instanceof NextResponse) return authResult;

  const { orgId } = await context.params;

  try {
    await orgRateLimitOverridesRepository.deleteByOrganizationId(orgId);
    await invalidateOrgTierCache(orgId);

    logger.info("[Admin] Org rate limit override deleted", {
      orgId,
      deletedBy: authResult.user?.id,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("[Admin] Org rate limits DELETE error", { error, orgId });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
