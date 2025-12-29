import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { discordService } from "@/lib/services/discord";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import type { CategoryId, SortBy, SortOrder } from "@/lib/types/my-agents";
import type { NewUserCharacter } from "@/db/repositories";

export const dynamic = "force-dynamic";

const CharacterSchema = z.object({
  name: z.string().min(1).max(100),
  username: z.string().max(50).optional().nullable(),
  system: z.string().max(10000).optional().nullable(),
  bio: z.union([z.string(), z.array(z.string())]),
  messageExamples: z.array(z.array(z.record(z.unknown()))).optional(),
  postExamples: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  adjectives: z.array(z.string()).optional(),
  knowledge: z.array(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  settings: z.record(z.unknown()).optional(),
  secrets: z.record(z.unknown()).optional(),
  style: z.record(z.unknown()).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  category: z.string().optional().nullable(),
  isPublic: z.boolean().optional(),
});

/**
 * GET /api/my-agents/characters
 * Lists user's own characters with filtering and sorting.
 *
 * @param request - Request with query parameters for search, filters, sorting, and pagination.
 * @returns Paginated character results.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const { searchParams } = new URL(request.url);

    // Parse search filters
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") as CategoryId | undefined;

    // Sort options
    const sortBy = (searchParams.get("sortBy") || "newest") as SortBy;
    const order = (searchParams.get("order") || "desc") as SortOrder;

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );

    logger.debug("[My Agents API] Search request:", {
      userId: user.id,
      organizationId: user.organization_id,
      search,
      category,
      sortBy,
      page,
      limit,
    });

    // Get user's characters
    let characters = await charactersService.listByUser(user.id);

    // Apply search filter
    if (search) {
      const query = search.toLowerCase();
      characters = characters.filter(
        (char) =>
          char.name.toLowerCase().includes(query) ||
          (typeof char.bio === "string" &&
            char.bio.toLowerCase().includes(query)) ||
          (Array.isArray(char.bio) &&
            char.bio.some((b) => b.toLowerCase().includes(query))),
      );
    }

    // Apply category filter
    if (category) {
      characters = characters.filter((char) => char.category === category);
    }

    // Sort characters
    characters.sort((a, b) => {
      const multiplier = order === "desc" ? -1 : 1;
      switch (sortBy) {
        case "name":
          return multiplier * a.name.localeCompare(b.name);
        case "newest":
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return multiplier * (dateB - dateA);
        case "updated":
          const updA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const updB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return multiplier * (updB - updA);
        default:
          return 0;
      }
    });

    // Apply pagination
    const totalCount = characters.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;
    const paginatedCharacters = characters.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        characters: paginatedCharacters.map((char) => ({
          id: char.id,
          name: char.name,
          bio: char.bio,
          avatarUrl: char.avatar_url,
          avatar_url: char.avatar_url,
          category: char.category,
          isPublic: char.is_public,
          is_public: char.is_public,
          createdAt: char.created_at,
          created_at: char.created_at,
          updatedAt: char.updated_at,
          updated_at: char.updated_at,
          tags: char.tags,
        })),
        pagination: {
          page,
          limit,
          totalPages,
          totalCount,
          hasMore: page < totalPages,
        },
      },
    });
  } catch (error) {
    logger.error("[My Agents API] Error searching characters:", error);

    const status =
      error instanceof Error && error.message.includes("auth") ? 401 : 500;

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to search characters",
      },
      { status },
    );
  }
}

/**
 * POST /api/my-agents/characters
 * Creates a new character for the authenticated user.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuthWithOrg();

  const body = await request.json();
  const parsed = CharacterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const elizaCharacter = parsed.data;

  const newCharacter: NewUserCharacter = {
    organization_id: user.organization_id!,
    user_id: user.id,
    name: elizaCharacter.name,
    username: elizaCharacter.username ?? null,
    system: elizaCharacter.system ?? null,
    bio: elizaCharacter.bio,
    message_examples: (elizaCharacter.messageExamples ?? []) as Record<string, unknown>[][],
    post_examples: elizaCharacter.postExamples ?? [],
    topics: elizaCharacter.topics ?? [],
    adjectives: elizaCharacter.adjectives ?? [],
    knowledge: elizaCharacter.knowledge ?? [],
    plugins: elizaCharacter.plugins ?? [],
    settings: elizaCharacter.settings ?? {},
    secrets: elizaCharacter.secrets ?? {},
    style: elizaCharacter.style ?? {},
    character_data: (() => {
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(elizaCharacter)) {
        record[key] = value;
      }
      return record;
    })(),
    avatar_url: elizaCharacter.avatarUrl ?? null,
    category: elizaCharacter.category ?? null,
    is_template: false,
    is_public: elizaCharacter.isPublic ?? false,
    source: "cloud",
  };

  const character = await charactersService.create(newCharacter);

  // Log to Discord (fire-and-forget)
  discordService
    .logCharacterCreated({
      characterId: character.id,
      characterName: character.name,
      userName: user.name ?? user.email ?? null,
      userId: user.id,
      organizationName: user.organization.name,
      bio: Array.isArray(elizaCharacter.bio) ? elizaCharacter.bio.join(" ") : elizaCharacter.bio,
      plugins: elizaCharacter.plugins,
    })
    .catch((error) => {
      logger.error("[CharacterCreate] Failed to log to Discord:", error);
    });

  revalidatePath("/dashboard/build");
  revalidatePath("/dashboard/my-agents");

  const result = charactersService.toElizaCharacter(character);

  return NextResponse.json({ success: true, data: { character: result } }, { status: 201 });
}

/**
 * PUT /api/my-agents/characters
 * Updates an existing character owned by the authenticated user.
 * Requires characterId in the request body.
 */
export async function PUT(request: NextRequest) {
  const user = await requireAuthWithOrg();

  const body = await request.json();
  const { characterId, ...characterData } = body;

  if (!characterId || typeof characterId !== "string") {
    return NextResponse.json(
      { success: false, error: "characterId is required" },
      { status: 400 },
    );
  }

  const parsed = CharacterSchema.safeParse(characterData);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const elizaCharacter = parsed.data;

  const updates: Partial<NewUserCharacter> = {
    name: elizaCharacter.name,
    username: elizaCharacter.username ?? null,
    system: elizaCharacter.system ?? null,
    bio: elizaCharacter.bio,
    message_examples: (elizaCharacter.messageExamples ?? []) as Record<string, unknown>[][],
    post_examples: elizaCharacter.postExamples ?? [],
    topics: elizaCharacter.topics ?? [],
    adjectives: elizaCharacter.adjectives ?? [],
    knowledge: elizaCharacter.knowledge ?? [],
    plugins: elizaCharacter.plugins ?? [],
    settings: elizaCharacter.settings ?? {},
    secrets: elizaCharacter.secrets ?? {},
    style: elizaCharacter.style ?? {},
    character_data: (() => {
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(elizaCharacter)) {
        record[key] = value;
      }
      return record;
    })(),
    avatar_url: elizaCharacter.avatarUrl ?? null,
    category: elizaCharacter.category ?? null,
    is_public: elizaCharacter.isPublic ?? false,
  };

  const character = await charactersService.updateForUser(characterId, user.id, updates);

  if (!character) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 },
    );
  }

  revalidatePath("/dashboard/build");
  revalidatePath("/dashboard/my-agents");

  const result = charactersService.toElizaCharacter(character);

  return NextResponse.json({ success: true, data: { character: result } });
}
