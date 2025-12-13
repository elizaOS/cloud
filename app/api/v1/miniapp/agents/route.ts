/**
 * /api/v1/miniapp/agents
 *
 * GET  - List all agents for the authenticated user
 * POST - Create a new agent
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters/characters";
import { characterMarketplaceService as myAgentsService } from "@/lib/services/characters/marketplace";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkMiniappRateLimit,
  createRateLimitErrorResponse,
  addRateLimitInfoToResponse,
  MINIAPP_RATE_LIMITS,
  MINIAPP_WRITE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "POST", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/agents
 * List all agents for the authenticated user
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_RATE_LIMITS
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );
    const search = searchParams.get("search") || undefined;

    const result = await myAgentsService.searchCharacters({
      userId: user.id,
      organizationId: user.organization_id,
      filters: {
        search,
        source: "miniapp", // Only show miniapp-created agents
      },
      sortOptions: { sortBy: "newest", order: "desc" },
      pagination: { page, limit },
      includeStats: true,
    });

    const response = NextResponse.json({
      success: true,
      agents: result.characters.map((char) => ({
        id: char.id,
        name: char.name,
        bio: char.bio,
        avatarUrl: char.avatarUrl || char.avatar_url,
        isPublic: char.isPublic ?? char.is_public ?? false,
        createdAt: char.createdAt || char.created_at,
        updatedAt: char.updatedAt || char.updated_at,
        stats: char.stats,
        imageSettings: affiliateDataToImageSettings(char.settings as Record<string, unknown> | undefined),
      })),
      pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        totalPages: result.pagination.totalPages,
        totalCount: result.pagination.totalCount,
        hasMore: result.pagination.hasMore,
      },
    });

    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error listing agents", { error });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list agents",
      },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

// Schema for image generation settings
const ImageGenerationSettingsSchema = z.object({
  enabled: z.boolean(),
  autoGenerate: z.boolean(),
  referenceImages: z.array(z.string()).default([]),
  vibe: z.enum([
    "flirty", "shy", "bold", "spicy", "romantic", "playful", "mysterious", "intellectual"
  ]).optional(),
  appearanceDescription: z.string().optional(),
});

// Schema for creating an agent
const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.union([z.string(), z.array(z.string())]),
  avatarUrl: z.string().url().optional().nullable(),
  topics: z.array(z.string()).optional(),
  adjectives: z.array(z.string()).optional(),
  style: z
    .object({
      all: z.array(z.string()).optional(),
      chat: z.array(z.string()).optional(),
      post: z.array(z.string()).optional(),
    })
    .optional(),
  settings: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.record(z.string(), z.unknown()),
      ])
    )
    .optional(),
  isPublic: z.boolean().optional(),
  imageSettings: ImageGenerationSettingsSchema.optional(),
});

/**
 * Convert imageSettings to affiliateData format for storage
 */
function imageSettingsToAffiliateData(
  imageSettings: z.infer<typeof ImageGenerationSettingsSchema> | undefined
): Record<string, unknown> | undefined {
  if (!imageSettings || !imageSettings.enabled) return undefined;

  return {
    source: "miniapp",
    vibe: imageSettings.vibe || DEFAULT_VIBE,
    imageUrls: imageSettings.referenceImages || [],
    appearanceDescription: imageSettings.appearanceDescription,
    autoImage: imageSettings.autoGenerate,
  };
}

/**
 * Convert affiliateData back to imageSettings format for API response
 */
function affiliateDataToImageSettings(
  settings: Record<string, unknown> | undefined
): {
  enabled: boolean;
  autoGenerate: boolean;
  referenceImages: string[];
  vibe?: string;
  appearanceDescription?: string;
} | undefined {
  const affiliateData = settings?.affiliateData as Record<string, unknown> | undefined;
  if (!affiliateData) return undefined;

  return {
    enabled: true,
    autoGenerate: affiliateData.autoImage === true,
    referenceImages: (affiliateData.imageUrls as string[]) || [],
    vibe: affiliateData.vibe as string | undefined,
    appearanceDescription: affiliateData.appearanceDescription as string | undefined,
  };
}

/**
 * POST /api/v1/miniapp/agents
 * Create a new agent
 */
export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_WRITE_LIMITS
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validationResult = CreateAgentSchema.safeParse(body);

    if (!validationResult.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const data = validationResult.data;

    // Build settings with affiliateData if image generation is enabled
    const baseSettings = (data.settings || {}) as Record<
      string,
      string | number | boolean | Record<string, unknown>
    >;
    const affiliateData = imageSettingsToAffiliateData(data.imageSettings);
    const finalSettings = affiliateData
      ? { ...baseSettings, affiliateData }
      : baseSettings;

    const character = await charactersService.create({
      organization_id: user.organization_id,
      user_id: user.id,
      name: data.name,
      bio: data.bio,
      avatar_url: data.avatarUrl,
      topics: data.topics || [],
      adjectives: data.adjectives || [],
      style: data.style || {},
      settings: finalSettings,
      secrets: {},
      knowledge: [],
      plugins: [],
      message_examples: [],
      post_examples: [],
      character_data: {},
      is_template: false,
      is_public: data.isPublic ?? false,
      source: "miniapp", // Mark as created from miniapp
    });

    logger.info("[Miniapp API] Created agent", {
      agentId: character.id,
      userId: user.id,
      name: character.name,
    });

    const response = NextResponse.json(
      {
        success: true,
        agent: {
          id: character.id,
          name: character.name,
          bio: character.bio,
          avatarUrl: character.avatar_url,
          isPublic: character.is_public,
          createdAt: character.created_at,
          imageSettings: affiliateDataToImageSettings(character.settings as Record<string, unknown>),
        },
      },
      { status: 201 }
    );

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error creating agent", { error });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create agent",
      },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
