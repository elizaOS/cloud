import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const DEFAULT_AGENT_BIO = "A helpful AI assistant";

const CreateAgentSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .transform((s) => s.trim()),
  bio: z
    .string()
    .optional()
    .transform((s) => s?.trim()),
});

/**
 * POST /api/v1/app/agents
 * Creates a new AI agent (character) for the authenticated user.
 *
 * @param request - Request body with name and optional bio.
 * @returns The created agent with its ID.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const body = await request.json();

    const validationResult = CreateAgentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const { name, bio } = validationResult.data;

    const character = await charactersService.create({
      name,
      bio: bio ? [bio] : [DEFAULT_AGENT_BIO],
      user_id: user.id,
      organization_id: user.organization_id,
      source: "cloud",
    });

    logger.info(`[Agents API] Created agent: ${character.id}`, {
      agentId: character.id,
      name: character.name,
      userId: user.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      {
        success: true,
        agent: {
          id: character.id,
          name: character.name,
          username: character.username,
          bio: character.bio,
          created_at: character.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[Agents API] Failed to create agent:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create agent",
      },
      { status: 500 },
    );
  }
}
