import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters/characters";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const UpdateCharacterAssetsSchema = z.object({
  avatarUrl: z.string().url().optional(),
  avatarFromGallery: z
    .object({
      id: z.string().uuid(),
      source: z.enum(["generation", "upload"]),
    })
    .optional(),
  coverImageUrl: z.string().url().optional(),
  coverImageFromGallery: z
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
 * PATCH /api/my-agents/characters/[id]/assets
 * Updates character assets (avatar, cover image) from direct URLs or gallery items.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  const character = await charactersService.getById(id);
  if (
    !character ||
    character.organization_id !== user.organization_id ||
    character.user_id !== user.id
  ) {
    return NextResponse.json(
      { error: "Character not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = UpdateCharacterAssetsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Record<string, string | undefined> = {};

  // Handle avatar
  if (parsed.data.avatarUrl) {
    updates.avatar_url = parsed.data.avatarUrl;
  } else if (parsed.data.avatarFromGallery) {
    const url = await getGalleryItemUrl(
      parsed.data.avatarFromGallery.id,
      parsed.data.avatarFromGallery.source,
      user.organization_id!
    );
    if (!url) {
      return NextResponse.json(
        { error: "Avatar gallery item not found" },
        { status: 404 }
      );
    }
    updates.avatar_url = url;
  }

  // Handle cover image - store in settings
  let coverImageUrl: string | undefined;
  if (parsed.data.coverImageUrl) {
    coverImageUrl = parsed.data.coverImageUrl;
  } else if (parsed.data.coverImageFromGallery) {
    const url = await getGalleryItemUrl(
      parsed.data.coverImageFromGallery.id,
      parsed.data.coverImageFromGallery.source,
      user.organization_id!
    );
    if (!url) {
      return NextResponse.json(
        { error: "Cover image gallery item not found" },
        { status: 404 }
      );
    }
    coverImageUrl = url;
  }

  // Update character
  const updatedCharacter = await charactersService.update(id, {
    avatar_url: updates.avatar_url || character.avatar_url,
    settings: {
      ...(character.settings as Record<string, unknown>),
      ...(coverImageUrl && { cover_image_url: coverImageUrl }),
    },
  });

  logger.info("[Characters API] Updated character assets", {
    characterId: id,
    hasAvatar: !!updates.avatar_url,
    hasCover: !!coverImageUrl,
  });

  return NextResponse.json({
    id: updatedCharacter?.id,
    avatarUrl: updatedCharacter?.avatar_url,
    coverImageUrl:
      coverImageUrl ||
      (updatedCharacter?.settings as Record<string, unknown>)?.cover_image_url,
    updatedAt: updatedCharacter?.updated_at?.toISOString(),
  });
}

/**
 * GET /api/my-agents/characters/[id]/assets
 * Gets character asset URLs.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  const character = await charactersService.getById(id);
  if (
    !character ||
    character.organization_id !== user.organization_id ||
    character.user_id !== user.id
  ) {
    return NextResponse.json(
      { error: "Character not found" },
      { status: 404 }
    );
  }

  const settings = character.settings as Record<string, unknown>;

  return NextResponse.json({
    characterId: character.id,
    avatarUrl: character.avatar_url,
    coverImageUrl: settings?.cover_image_url as string | undefined,
  });
}
