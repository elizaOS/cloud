/**
 * Admin endpoint for per-organization rate limit overrides.
 *
 * GET    — read current override (if any) + computed tier
 * PATCH  — upsert override fields
 * DELETE — remove all overrides (revert to automatic tier)
 *
 * Auth: requireAdminWithResponse — superadmin only. All admins can modify any org.
 * There are no tenant-scoped admin roles in the current system.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { orgRateLimitOverridesRepository } from "@/db/repositories/org-rate-limit-overrides";
import { organizationsRepository } from "@/db/repositories/organizations";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import { getOrgTier, invalidateOrgTierCache } from "@/lib/services/org-rate-limits";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ orgId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateOrgId(orgId: string): NextResponse | null {
  if (!UUID_RE.test(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
  }
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdminWithResponse(request, "[Admin] Org rate limits auth error");
  if (authResult instanceof NextResponse) return authResult;

  const { orgId } = await context.params;
  const invalid = validateOrgId(orgId);
  if (invalid) return invalid;

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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH semantics: null = clear override (revert to tier default), omit = keep current value.
const PatchSchema = z.object({
  completions_rpm: z.number().int().min(1).max(10_000).nullable().optional(),
  embeddings_rpm: z.number().int().min(1).max(10_000).nullable().optional(),
  standard_rpm: z.number().int().min(1).max(10_000).nullable().optional(),
  strict_rpm: z.number().int().min(1).max(10_000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdminWithResponse(request, "[Admin] Org rate limits auth error");
  if (authResult instanceof NextResponse) return authResult;

  const { orgId } = await context.params;
  const invalid = validateOrgId(orgId);
  if (invalid) return invalid;

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

  // Reject empty PATCH — at least one RPM or note field must be provided
  const hasFields = [
    "completions_rpm",
    "embeddings_rpm",
    "standard_rpm",
    "strict_rpm",
    "note",
  ].some((k) => k in parsed.data);
  if (!hasFields) {
    return NextResponse.json(
      { error: "At least one override field must be provided" },
      { status: 400 },
    );
  }

  try {
    const org = await organizationsRepository.findById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    // Pass values as-is: null clears a field, undefined = not provided (no change)
    const result = await orgRateLimitOverridesRepository.upsert({
      organization_id: orgId,
      ...("completions_rpm" in parsed.data && {
        completions_rpm: parsed.data.completions_rpm,
      }),
      ...("embeddings_rpm" in parsed.data && {
        embeddings_rpm: parsed.data.embeddings_rpm,
      }),
      ...("standard_rpm" in parsed.data && {
        standard_rpm: parsed.data.standard_rpm,
      }),
      ...("strict_rpm" in parsed.data && {
        strict_rpm: parsed.data.strict_rpm,
      }),
      ...("note" in parsed.data && { note: parsed.data.note }),
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdminWithResponse(request, "[Admin] Org rate limits auth error");
  if (authResult instanceof NextResponse) return authResult;

  const { orgId } = await context.params;
  const invalid = validateOrgId(orgId);
  if (invalid) return invalid;

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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
