/**
 * /api/v1/miniapp/agents/[id]
 *
 * GET    - Get agent details
 * PUT    - Update agent (full update)
 * PATCH  - Update agent (partial update)
 * DELETE - Delete agent
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services";
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
  return createPreflightResponse(origin, [
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);
}

/**
 * GET /api/v1/miniapp/agents/[id]
 * Get agent details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id } = await params;

  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_RATE_LIMITS,
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
    logger.error("[Miniapp API] Error getting agent", { error, agentId: id });

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
 * PUT/PATCH /api/v1/miniapp/agents/[id]
 * Update agent
 */
async function updateAgent(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id } = await params;

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_WRITE_LIMITS,
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

    logger.info("[Miniapp API] Updated agent", {
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
    logger.error("[Miniapp API] Error updating agent", { error, agentId: id });

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
 * DELETE /api/v1/miniapp/agents/[id]
 * Delete agent
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id } = await params;

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_WRITE_LIMITS,
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

    logger.info("[Miniapp API] Deleted agent", {
      agentId: id,
      userId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      message: "Agent deleted successfully",
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error deleting agent", { error, agentId: id });

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
