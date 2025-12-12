import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const UpdateAppAssetsSchema = z.object({
  logoUrl: z.string().url().optional(),
  logoFromGallery: z
    .object({
      id: z.string().uuid(),
      source: z.enum(["generation", "upload"]),
    })
    .optional(),
  ogImageUrl: z.string().url().optional(),
  ogImageFromGallery: z
    .object({
      id: z.string().uuid(),
      source: z.enum(["generation", "upload"]),
    })
    .optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Gets the URL for a gallery item.
 */
async function getGalleryItemUrl(
  id: string,
  source: "generation" | "upload",
  organizationId: string
): Promise<string | null> {
  if (source === "generation") {
    const generation = await generationsService.getById(id);
    if (!generation || generation.organization_id !== organizationId) {
      return null;
    }
    return generation.storage_url;
  } else {
    const upload = await mediaUploadsService.getById(id);
    if (!upload || upload.organization_id !== organizationId) {
      return null;
    }
    return upload.storage_url;
  }
}

/**
 * PATCH /api/v1/apps/[id]/assets
 * Updates app assets (logo, OG image) from direct URLs or gallery items.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const app = await appsService.getById(id);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = UpdateAppAssetsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Record<string, string> = {};

  // Handle logo
  if (parsed.data.logoUrl) {
    updates.logo_url = parsed.data.logoUrl;
  } else if (parsed.data.logoFromGallery) {
    const url = await getGalleryItemUrl(
      parsed.data.logoFromGallery.id,
      parsed.data.logoFromGallery.source,
      user.organization_id!
    );
    if (!url) {
      return NextResponse.json(
        { error: "Logo gallery item not found" },
        { status: 404 }
      );
    }
    updates.logo_url = url;
  }

  // Handle OG image - store in metadata
  let ogImageUrl: string | undefined;
  if (parsed.data.ogImageUrl) {
    ogImageUrl = parsed.data.ogImageUrl;
  } else if (parsed.data.ogImageFromGallery) {
    const url = await getGalleryItemUrl(
      parsed.data.ogImageFromGallery.id,
      parsed.data.ogImageFromGallery.source,
      user.organization_id!
    );
    if (!url) {
      return NextResponse.json(
        { error: "OG image gallery item not found" },
        { status: 404 }
      );
    }
    ogImageUrl = url;
  }

  // Update app
  const updatedApp = await appsService.update(id, {
    logo_url: updates.logo_url || app.logo_url,
    metadata: {
      ...(app.metadata as Record<string, unknown>),
      ...(ogImageUrl && { og_image_url: ogImageUrl }),
    },
  });

  logger.info("[Apps API] Updated app assets", {
    appId: id,
    hasLogo: !!updates.logo_url,
    hasOgImage: !!ogImageUrl,
  });

  return NextResponse.json({
    id: updatedApp?.id,
    logoUrl: updatedApp?.logo_url,
    ogImageUrl:
      ogImageUrl ||
      (updatedApp?.metadata as Record<string, unknown>)?.og_image_url,
    updatedAt: updatedApp?.updated_at?.toISOString(),
  });
}

/**
 * GET /api/v1/apps/[id]/assets
 * Gets app asset URLs.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const app = await appsService.getById(id);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const metadata = app.metadata as Record<string, unknown>;

  return NextResponse.json({
    appId: app.id,
    logoUrl: app.logo_url,
    ogImageUrl: metadata?.og_image_url as string | undefined,
    websiteUrl: app.website_url,
  });
}
