import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbWrite } from "@/db/helpers";
import { aiPricingEntries } from "@/db/schemas/ai-pricing";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import {
  buildDimensionKey,
  listPersistedPricingEntries,
  listRecentPricingRefreshRuns,
  normalizePricingDimensions,
  refreshPricingCatalog,
} from "@/lib/services/ai-pricing";

const OverrideSchema = z.object({
  billingSource: z.enum(["gateway", "openrouter", "openai", "groq", "fal", "elevenlabs"]),
  provider: z.string().min(1),
  model: z.string().min(1),
  productFamily: z.enum(["language", "embedding", "image", "video", "tts", "stt", "voice_clone"]),
  chargeType: z.string().min(1),
  unit: z.enum([
    "token",
    "image",
    "request",
    "second",
    "minute",
    "hour",
    "character",
    "1k_requests",
  ]),
  unitPrice: z.number().positive(),
  dimensions: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  reason: z.string().min(1),
});

const RefreshSchema = z.object({
  sources: z.array(z.enum(["gateway", "openrouter", "fal", "elevenlabs"])).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireAdminWithResponse(request, "[Admin] AI pricing auth error");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const url = new URL(request.url);
  const billingSource = url.searchParams.get("billingSource") || undefined;
  const provider = url.searchParams.get("provider") || undefined;
  const model = url.searchParams.get("model") || undefined;
  const productFamily = url.searchParams.get("productFamily") || undefined;
  const chargeType = url.searchParams.get("chargeType") || undefined;

  const [entries, refreshRuns] = await Promise.all([
    listPersistedPricingEntries({
      billingSource,
      provider,
      model,
      productFamily,
      chargeType,
    }),
    listRecentPricingRefreshRuns(10),
  ]);

  return NextResponse.json({
    pricing: entries,
    refreshRuns,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdminWithResponse(request, "[Admin] AI pricing auth error");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const body = RefreshSchema.parse(await request.json());
  const refresh = await refreshPricingCatalog(body.sources);

  return NextResponse.json(refresh, { status: refresh.success ? 200 : 207 });
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdminWithResponse(request, "[Admin] AI pricing auth error");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const body = OverrideSchema.parse(await request.json());
  const dimensions = normalizePricingDimensions(body.dimensions);
  const dimensionKey = buildDimensionKey(dimensions);
  const now = new Date();

  const [created] = await dbWrite.transaction(async (tx) => {
    await tx
      .update(aiPricingEntries)
      .set({
        is_active: false,
        effective_until: now,
        updated_at: now,
      })
      .where(
        and(
          eq(aiPricingEntries.is_active, true),
          eq(aiPricingEntries.source_kind, "manual_override"),
          eq(aiPricingEntries.billing_source, body.billingSource),
          eq(aiPricingEntries.provider, body.provider),
          eq(aiPricingEntries.model, body.model),
          eq(aiPricingEntries.product_family, body.productFamily),
          eq(aiPricingEntries.charge_type, body.chargeType),
          eq(aiPricingEntries.dimension_key, dimensionKey),
        ),
      );

    const inserted = await tx
      .insert(aiPricingEntries)
      .values({
        billing_source: body.billingSource,
        provider: body.provider,
        model: body.model,
        product_family: body.productFamily,
        charge_type: body.chargeType,
        unit: body.unit,
        unit_price: body.unitPrice.toString(),
        currency: "USD",
        dimension_key: dimensionKey,
        dimensions,
        source_kind: "manual_override",
        source_url: "admin://manual-override",
        source_hash: null,
        fetched_at: now,
        stale_after: null,
        effective_from: now,
        priority: 1000,
        is_active: true,
        is_override: true,
        updated_by: authResult.user.id,
        metadata: {
          reason: body.reason,
        },
        updated_at: now,
      })
      .returning();

    return inserted;
  });

  return NextResponse.json({ success: true, pricing: created });
}
