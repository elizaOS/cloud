import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { voiceCloningService } from "@/lib/services/voice-cloning";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";

const userVoicesQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  cloneType: z.enum(["instant", "professional"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/elevenlabs/voices/user
 * Lists all voices owned by the authenticated user's organization.
 * Supports filtering by clone type and pagination.
 *
 * Query Parameters:
 * - `includeInactive`: If "true", includes inactive voices (default: false).
 * - `cloneType`: Filter by "instant" | "professional".
 * - `limit`: Maximum number of results (default: 50).
 * - `offset`: Offset for pagination (default: 0).
 *
 * @param request - Request with optional filtering and pagination query parameters.
 * @returns Paginated list of user voices with metadata.
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuthWithOrg();

    // Parse query parameters with bounds validation
    const { searchParams } = new URL(request.url);
    const parsedQuery = userVoicesQuerySchema.safeParse({
      includeInactive: searchParams.get("includeInactive") || undefined,
      cloneType: searchParams.get("cloneType") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsedQuery.error.issues },
        { status: 400 },
      );
    }

    const { includeInactive, cloneType, limit, offset } = parsedQuery.data;

    logger.info(`[User Voices API] Fetching voices for user ${user.id}`, {
      organizationId: user.organization_id!!,
      includeInactive,
      cloneType,
      limit,
      offset,
    });

    // Get user's voices
    const allVoices = await voiceCloningService.getUserVoices({
      organizationId: user.organization_id!!,
      includeInactive,
      cloneType,
    });

    // Apply pagination
    const paginatedVoices = allVoices.slice(offset, offset + limit);

    // Format response
    const voices = paginatedVoices.map((voice) => ({
      id: voice.id,
      elevenlabsVoiceId: voice.elevenlabsVoiceId,
      name: voice.name,
      description: voice.description,
      cloneType: voice.cloneType,
      sampleCount: voice.sampleCount,
      totalAudioDurationSeconds: voice.totalAudioDurationSeconds,
      audioQualityScore: voice.audioQualityScore,
      usageCount: voice.usageCount,
      lastUsedAt: voice.lastUsedAt,
      isActive: voice.isActive,
      isPublic: voice.isPublic,
      createdAt: voice.createdAt,
      updatedAt: voice.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      voices,
      total: allVoices.length,
      limit,
      offset,
      hasMore: offset + limit < allVoices.length,
    });
  } catch (error) {
    logger.error("[User Voices API] Error:", error);
    const status = getErrorStatusCode(error);

    if (status !== 500) {
      return NextResponse.json(
        { error: getSafeErrorMessage(error) },
        { status },
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch voices. Please try again." },
      { status: 500 },
    );
  }
}
