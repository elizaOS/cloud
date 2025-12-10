/**
 * /api/v1/app/agents/[id]
 *
 * GET    - Get agent details
 * PUT    - Update agent (full update)
 * PATCH  - Update agent (partial update)
 * DELETE - Delete agent
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
 * OPTIONS /api/v1/app/agents/[id]
 * CORS preflight handler for app agent management endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, [
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);
}

/**
 * GET /api/v1/app/agents/[id]
 * Gets detailed information about a specific agent.
 * Only returns app-created agents. Requires ownership verification.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the agent ID.
 * @returns Complete agent details including configuration and metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkAppRateLimit(
    request,
    APP_RATE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const character = await charactersService.getById(id);

    if (!character) {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify this is a app agent - app API can only access app-created agents
    if (character.source !== "app") {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify ownership
    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const response = NextResponse.json({
      success: true,
      agent: {
        id: character.id,
        name: character.name,
        bio: character.bio,
        avatarUrl: character.avatar_url,
        topics: character.topics,
        adjectives: character.adjectives,
        style: character.style,
        settings: character.settings,
        knowledge: character.knowledge,
        messageExamples: character.message_examples,
        postExamples: character.post_examples,
        plugins: character.plugins,
        isPublic: character.is_public,
        isTemplate: character.is_template,
        createdAt: character.created_at,
        updatedAt: character.updated_at,
        characterData: character.character_data,
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App API] Error getting agent", { error, agentId: id });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get agent",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

// Schema for updating an agent
const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.union([z.string(), z.array(z.string())]).optional(),
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
  knowledge: z.array(z.string()).optional(),
  messageExamples: z
    .array(z.array(z.record(z.string(), z.unknown())))
    .optional(),
  postExamples: z.array(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  characterData: z.record(z.string(), z.unknown()).optional(),
});

/**
 * PUT/PATCH /api/v1/app/agents/[id]
 * Updates an agent's configuration (full or partial update).
 * Only app-created agents can be updated. Rate limited with stricter limits for write operations.
 *
 * Request Body (all fields optional):
 * - `name`: Agent name (1-100 characters).
 * - `bio`: Agent biography (string or array of strings).
 * - `avatarUrl`: Avatar image URL (nullable).
 * - `topics`: Array of topic strings.
 * - `adjectives`: Array of personality adjectives.
 * - `style`: Style configuration object.
 * - `settings`: Settings object.
 * - `knowledge`: Array of knowledge file paths.
 * - `messageExamples`: Array of message example arrays.
 * - `postExamples`: Array of post example strings.
 * - `plugins`: Array of plugin names.
 * - `isPublic`: Boolean for public visibility.
 * - `characterData`: Character data object.
 *
 * @param request - Request body with fields to update.
 * @param params - Route parameters containing the agent ID.
 * @returns Updated agent details.
 */
async function updateAgent(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id } = await params;

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkAppRateLimit(
    request,
    APP_WRITE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify agent exists and user has access
    const character = await charactersService.getById(id);

    if (!character) {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify this is a app agent - app API can only access app-created agents
    if (character.source !== "app") {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const body = await request.json();
    const validationResult = UpdateAgentSchema.safeParse(body);

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

    // Build update object - only include provided fields
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
    if (data.topics !== undefined) updateData.topics = data.topics;
    if (data.adjectives !== undefined) updateData.adjectives = data.adjectives;
    if (data.style !== undefined) updateData.style = data.style;
    if (data.settings !== undefined) updateData.settings = data.settings;
    if (data.knowledge !== undefined) updateData.knowledge = data.knowledge;
    if (data.messageExamples !== undefined)
      updateData.message_examples = data.messageExamples;
    if (data.postExamples !== undefined)
      updateData.post_examples = data.postExamples;
    if (data.plugins !== undefined) updateData.plugins = data.plugins;
    if (data.isPublic !== undefined) updateData.is_public = data.isPublic;
    if (data.characterData !== undefined)
      updateData.character_data = data.characterData;

    const updated = await charactersService.update(id, updateData);

    if (!updated) {
      const response = NextResponse.json(
        { success: false, error: "Failed to update agent" },
        { status: 500 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    logger.info("[App API] Updated agent", {
      agentId: id,
      userId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      agent: {
        id: updated.id,
        name: updated.name,
        bio: updated.bio,
        avatarUrl: updated.avatar_url,
        topics: updated.topics,
        adjectives: updated.adjectives,
        style: updated.style,
        settings: updated.settings,
        isPublic: updated.is_public,
        updatedAt: updated.updated_at,
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App API] Error updating agent", { error, agentId: id });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update agent",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

export { updateAgent as PUT, updateAgent as PATCH };

/**
 * DELETE /api/v1/app/agents/[id]
 * Deletes an agent permanently.
 * Only app-created agents can be deleted. Requires ownership verification.
 * Rate limited with stricter limits for write operations.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the agent ID.
 * @returns Success confirmation.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id } = await params;

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkAppRateLimit(
    request,
    APP_WRITE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify agent exists and user has access
    const character = await charactersService.getById(id);

    if (!character) {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify this is a app agent - app API can only access app-created agents
    if (character.source !== "app") {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    await charactersService.delete(id);

    logger.info("[App API] Deleted agent", {
      agentId: id,
      userId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      message: "Agent deleted successfully",
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App API] Error deleting agent", { error, agentId: id });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete agent",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
