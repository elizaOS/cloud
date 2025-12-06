import { eq, desc, and, or, ilike, sql, SQL, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  userCharacters,
  type UserCharacter,
  type NewUserCharacter,
} from "../schemas/user-characters";
import { elizaRoomCharactersTable } from "../schemas/eliza-room-characters";
import type { SearchFilters, SortOptions } from "@/lib/types/my-agents";

export type { UserCharacter, NewUserCharacter };

/**
 * Repository for user character database operations.
 */
export class UserCharactersRepository {
  /**
   * Finds a character by ID.
   */
  async findById(id: string): Promise<UserCharacter | undefined> {
    return await db.query.userCharacters.findFirst({
      where: eq(userCharacters.id, id),
    });
  }

  /**
   * Lists characters for a user, including owned and interacted characters.
   * 
   * Includes characters the user owns or has interacted with via chat rooms,
   * allowing affiliate-created characters to appear in the selector.
   * 
   * @param userId - User ID to list characters for.
   * @param source - Filter by source type (default: "cloud").
   */
  async listByUser(userId: string, source: "cloud" | "miniapp" = "cloud"): Promise<UserCharacter[]> {
    const interactedCharacterIds = db
      .selectDistinct({ character_id: elizaRoomCharactersTable.character_id })
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.user_id, userId));

    return await db
      .selectDistinct()
      .from(userCharacters)
      .where(
        and(
          eq(userCharacters.source, source),
          or(
            eq(userCharacters.user_id, userId),
            inArray(userCharacters.id, interactedCharacterIds),
          ),
        ),
      )
      .orderBy(desc(userCharacters.created_at));
  }

  /**
   * Lists characters for an organization.
   * 
   * @param organizationId - Organization ID.
   * @param source - Filter by source type (default: "cloud").
   */
  async listByOrganization(organizationId: string, source: "cloud" | "miniapp" = "cloud"): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: and(
        eq(userCharacters.organization_id, organizationId),
        eq(userCharacters.source, source),
      ),
      orderBy: desc(userCharacters.created_at),
    });
  }

  /**
   * Lists all public characters (cloud source only).
   */
  async listPublic(): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: and(
        eq(userCharacters.is_public, true),
        eq(userCharacters.source, "cloud"),
      ),
      orderBy: desc(userCharacters.created_at),
    });
  }

  /**
   * Lists all template characters (cloud source only).
   */
  async listTemplates(): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: and(
        eq(userCharacters.is_template, true),
        eq(userCharacters.source, "cloud"),
      ),
      orderBy: desc(userCharacters.created_at),
    });
  }

  /**
   * Creates a new character.
   */
  async create(data: NewUserCharacter): Promise<UserCharacter> {
    const [character] = await db
      .insert(userCharacters)
      .values(data)
      .returning();
    return character;
  }

  /**
   * Updates an existing character.
   */
  async update(
    id: string,
    data: Partial<NewUserCharacter>,
  ): Promise<UserCharacter | undefined> {
    const [updated] = await db
      .update(userCharacters)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, id))
      .returning();
    return updated;
  }

  /**
   * Deletes a character by ID.
   */
  async delete(id: string): Promise<void> {
    await db.delete(userCharacters).where(eq(userCharacters.id, id));
  }

  /**
   * Searches characters with filters and sorting.
   * 
   * Includes characters the user owns or has interacted with via chat rooms.
   */
  async search(
    filters: SearchFilters,
    userId: string,
    organizationId: string,
    sortOptions: SortOptions,
    limit: number,
    offset: number,
  ): Promise<UserCharacter[]> {
    const conditions: SQL[] = [];

    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          sql`${userCharacters.bio}::text ILIKE ${"%" + filters.search + "%"}`,
        )!,
      );
    }

    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }

    if (filters.hasVoice) {
      conditions.push(
        sql`${userCharacters.plugins}::jsonb @> '["@elizaos/plugin-elevenlabs"]'::jsonb`,
      );
    }

    if (filters.template !== undefined) {
      conditions.push(eq(userCharacters.is_template, filters.template));
    }

    if (filters.public !== undefined) {
      conditions.push(eq(userCharacters.is_public, filters.public));
    }

    if (filters.featured !== undefined) {
      conditions.push(eq(userCharacters.featured, filters.featured));
    }

    // Filter by source (cloud vs miniapp)
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    // Include characters that user owns OR has interacted with via chat rooms
    // This allows affiliate-created characters (clone-your-crush) to appear in my-agents
    // when the user has chatted with them, even if they don't "own" the character
    const interactedCharacterIds = db
      .selectDistinct({ character_id: elizaRoomCharactersTable.character_id })
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.user_id, userId));

    conditions.push(
      or(
        eq(userCharacters.user_id, userId),
        inArray(userCharacters.id, interactedCharacterIds),
      )!,
    );

    const { sortBy, order } = sortOptions;
    const direction = order === "asc" ? "asc" : "desc";

    let secondaryOrderBy;
    switch (sortBy) {
      case "popularity":
        secondaryOrderBy =
          direction === "asc"
            ? userCharacters.popularity_score
            : desc(userCharacters.popularity_score);
        break;
      case "newest":
        secondaryOrderBy =
          direction === "asc"
            ? userCharacters.created_at
            : desc(userCharacters.created_at);
        break;
      case "name":
        secondaryOrderBy =
          direction === "asc" ? userCharacters.name : desc(userCharacters.name);
        break;
      case "updated":
        secondaryOrderBy =
          direction === "asc"
            ? userCharacters.updated_at
            : desc(userCharacters.updated_at);
        break;
      default:
        secondaryOrderBy = desc(userCharacters.popularity_score);
    }

    return await db
      .select()
      .from(userCharacters)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(userCharacters.featured), secondaryOrderBy)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Counts characters matching the search filters.
   */
  async count(
    filters: SearchFilters,
    userId: string,
    organizationId: string,
  ): Promise<number> {
    const conditions: SQL[] = [];

    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          sql`${userCharacters.bio}::text ILIKE ${"%" + filters.search + "%"}`,
        )!,
      );
    }

    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }

    if (filters.hasVoice) {
      conditions.push(
        sql`${userCharacters.plugins}::jsonb @> '["@elizaos/plugin-elevenlabs"]'::jsonb`,
      );
    }

    if (filters.template !== undefined) {
      conditions.push(eq(userCharacters.is_template, filters.template));
    }

    if (filters.public !== undefined) {
      conditions.push(eq(userCharacters.is_public, filters.public));
    }

    if (filters.featured !== undefined) {
      conditions.push(eq(userCharacters.featured, filters.featured));
    }

    // Filter by source (cloud vs miniapp)
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    // Include characters that user owns OR has interacted with via chat rooms
    const interactedCharacterIds = db
      .selectDistinct({ character_id: elizaRoomCharactersTable.character_id })
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.user_id, userId));

    conditions.push(
      or(
        eq(userCharacters.user_id, userId),
        inArray(userCharacters.id, interactedCharacterIds),
      )!,
    );

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0]?.count || 0;
  }

  /**
   * Atomically increments the view count for a character.
   */
  async incrementViewCount(id: string): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        view_count: sql`${userCharacters.view_count} + 1`,
      })
      .where(eq(userCharacters.id, id));
  }

  /**
   * Atomically increments the interaction count for a character.
   */
  async incrementInteractionCount(id: string): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        interaction_count: sql`${userCharacters.interaction_count} + 1`,
      })
      .where(eq(userCharacters.id, id));
  }

  /**
   * Updates the popularity score for a character.
   */
  async updatePopularityScore(id: string, score: number): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        popularity_score: score,
      })
      .where(eq(userCharacters.id, id));
  }

  /**
   * Gets featured characters (cloud source only).
   * 
   * @param limit - Maximum number of characters to return (default: 10).
   */
  async getFeatured(limit: number = 10): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: and(
        eq(userCharacters.featured, true),
        eq(userCharacters.source, "cloud"),
      ),
      orderBy: desc(userCharacters.popularity_score),
      limit,
    });
  }

  /**
   * Gets popular characters (cloud source only).
   * 
   * @param limit - Maximum number of characters to return (default: 20).
   */
  async getPopular(limit: number = 20): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: and(
        or(
        eq(userCharacters.is_template, true),
        eq(userCharacters.is_public, true),
        ),
        eq(userCharacters.source, "cloud"),
      ),
      orderBy: desc(userCharacters.popularity_score),
      limit,
    });
  }

  /**
   * Searches public characters (templates and public characters).
   */
  async searchPublic(
    filters: Omit<SearchFilters, "myCharacters" | "deployed">,
    sortOptions: SortOptions,
    limit: number,
    offset: number,
  ): Promise<UserCharacter[]> {
    const conditions: SQL[] = [];

    conditions.push(
      or(
        eq(userCharacters.is_template, true),
        eq(userCharacters.is_public, true),
      )!,
    );

    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          sql`${userCharacters.bio}::text ILIKE ${"%" + filters.search + "%"}`,
        )!,
      );
    }

    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }

    if (filters.hasVoice) {
      conditions.push(
        sql`${userCharacters.plugins}::jsonb @> '["@elizaos/plugin-elevenlabs"]'::jsonb`,
      );
    }

    if (filters.template !== undefined) {
      conditions.push(eq(userCharacters.is_template, filters.template));
    }

    if (filters.featured !== undefined) {
      conditions.push(eq(userCharacters.featured, filters.featured));
    }

    // Filter by source (cloud vs miniapp) - miniapp agents should never appear in public marketplace
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    const { sortBy, order } = sortOptions;
    const direction = order === "asc" ? "asc" : "desc";

    let secondaryOrderBy;
    switch (sortBy) {
      case "popularity":
        secondaryOrderBy =
          direction === "asc"
            ? userCharacters.popularity_score
            : desc(userCharacters.popularity_score);
        break;
      case "newest":
        secondaryOrderBy =
          direction === "asc"
            ? userCharacters.created_at
            : desc(userCharacters.created_at);
        break;
      case "name":
        secondaryOrderBy =
          direction === "asc" ? userCharacters.name : desc(userCharacters.name);
        break;
      case "updated":
        secondaryOrderBy =
          direction === "asc"
            ? userCharacters.updated_at
            : desc(userCharacters.updated_at);
        break;
      default:
        secondaryOrderBy = desc(userCharacters.popularity_score);
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(desc(userCharacters.featured), secondaryOrderBy)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Counts public characters matching the filters.
   */
  async countPublic(
    filters: Omit<SearchFilters, "myCharacters" | "deployed">,
  ): Promise<number> {
    const conditions: SQL[] = [];

    conditions.push(
      or(
        eq(userCharacters.is_template, true),
        eq(userCharacters.is_public, true),
      )!,
    );

    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          sql`${userCharacters.bio}::text ILIKE ${"%" + filters.search + "%"}`,
        )!,
      );
    }

    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }

    if (filters.hasVoice) {
      conditions.push(
        sql`${userCharacters.plugins}::jsonb @> '["@elizaos/plugin-elevenlabs"]'::jsonb`,
      );
    }

    if (filters.template !== undefined) {
      conditions.push(eq(userCharacters.is_template, filters.template));
    }

    if (filters.featured !== undefined) {
      conditions.push(eq(userCharacters.featured, filters.featured));
    }

    // Filter by source (cloud vs miniapp) - miniapp agents should never appear in public marketplace
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }
}

/**
 * Singleton instance of UserCharactersRepository.
 */
export const userCharactersRepository = new UserCharactersRepository();
