/**
 * /api/v1/app/agents
 *
 * GET  - List all agents for the authenticated user
 * POST - Create a new agent
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters/characters";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkAppRateLimit,
  createRateLimitErrorResponse,
  addRateLimitInfoToResponse,
  APP_RATE_LIMITS,
  APP_WRITE_LIMITS,
} from "@/lib/middleware/app-rate-limit";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

/**
 * OPTIONS /api/v1/app/agents
 * CORS preflight handler for app agents endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "POST", "OPTIONS"]);
}

/**
 * GET /api/v1/app/agents
 * Lists all agents for the authenticated user.
 * Supports pagination and search filtering. Only returns app-created agents.
 *
 * Query Parameters:
 * - `page`: Page number (default: 1).
 * - `limit`: Results per page (default: 20, max: 50).
 * - `search`: Search term for filtering agents by name or bio.
 *
 * @param request - Request with optional pagination and search query parameters.
 * @returns Paginated list of agents with statistics.
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting
  const rateLimitResult = await checkAppRateLimit(request, APP_RATE_LIMITS);
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );
    const search = searchParams.get("search") || undefined;

    // Get characters for the user's organization
    let characters = await charactersService.listByOrganization(user.organization_id);
    
    // Filter by source (app only) and search term
    characters = characters.filter(char => {
      // Only show app-created agents
      if (char.source !== "app") return false;
      
      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        const nameMatch = char.name?.toLowerCase().includes(searchLower);
        const bioMatch = typeof char.bio === "string" 
          ? char.bio.toLowerCase().includes(searchLower)
          : Array.isArray(char.bio) && char.bio.some(b => b.toLowerCase().includes(searchLower));
        if (!nameMatch && !bioMatch) return false;
      }
      
      return true;
    });

    // Sort by created_at descending (newest first)
    characters.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    // Pagination
    const total = characters.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedCharacters = characters.slice(startIndex, startIndex + limit);

    const response = NextResponse.json({
      success: true,
      agents: paginatedCharacters.map((char) => ({
        id: char.id,
        name: char.name,
        bio: char.bio,
        avatarUrl: char.avatar_url,
        isPublic: char.is_public,
        createdAt: char.created_at,
        updatedAt: char.updated_at,
      })),
      pagination: {
        page,
        limit,
        totalPages,
        totalCount: total,
        hasMore: page < totalPages,
      },
    });

    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App API] Error listing agents", { error });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list agents",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

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
      ]),
    )
    .optional(),
  isPublic: z.boolean().optional(),
});

/**
 * POST /api/v1/app/agents
 * Creates a new agent for the authenticated user.
 * Rate limited with stricter limits for write operations.
 *
 * Request Body:
 * - `name`: Agent name (required, 1-100 characters).
 * - `bio`: Agent biography (string or array of strings).
 * - `avatarUrl`: Optional avatar image URL.
 * - `topics`: Optional array of topic strings.
 * - `adjectives`: Optional array of personality adjectives.
 * - `style`: Optional style configuration object.
 * - `settings`: Optional settings object.
 * - `isPublic`: Optional boolean for public visibility.
 *
 * @param request - Request body with agent configuration.
 * @returns Created agent details.
 */
export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkAppRateLimit(request, APP_WRITE_LIMITS);
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
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
        { status: 400 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const data = validationResult.data;

    const character = await charactersService.create({
      organization_id: user.organization_id,
      user_id: user.id,
      name: data.name,
      bio: data.bio,
      avatar_url: data.avatarUrl,
      topics: data.topics || [],
      adjectives: data.adjectives || [],
      style: data.style || {},
      settings: (data.settings || {}) as Record<
        string,
        string | number | boolean | Record<string, unknown>
      >,
      secrets: {},
      knowledge: [],
      plugins: [],
      message_examples: [],
      post_examples: [],
      character_data: {},
      is_template: false,
      is_public: data.isPublic ?? false,
      source: "app", // Mark as created from app
    });

    logger.info("[App API] Created agent", {
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
        },
      },
      { status: 201 },
    );

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App API] Error creating agent", { error });

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
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
