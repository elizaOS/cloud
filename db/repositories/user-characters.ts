import { eq, desc, and, or, ilike, sql, SQL } from "drizzle-orm";
import { db } from "../client";
import {
  userCharacters,
  type UserCharacter,
  type NewUserCharacter,
} from "../schemas/user-characters";
import type { SearchFilters, SortOptions } from "@/lib/types/marketplace";

export type { UserCharacter, NewUserCharacter };

export class UserCharactersRepository {
  async findById(id: string): Promise<UserCharacter | undefined> {
    return await db.query.userCharacters.findFirst({
      where: eq(userCharacters.id, id),
    });
  }

  async listByUser(userId: string): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: eq(userCharacters.user_id, userId),
      orderBy: desc(userCharacters.created_at),
    });
  }

  async listByOrganization(organizationId: string): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: eq(userCharacters.organization_id, organizationId),
      orderBy: desc(userCharacters.created_at),
    });
  }

  async listPublic(): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: eq(userCharacters.is_public, true),
      orderBy: desc(userCharacters.created_at),
    });
  }

  async listTemplates(): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: eq(userCharacters.is_template, true),
      orderBy: desc(userCharacters.created_at),
    });
  }

  async create(data: NewUserCharacter): Promise<UserCharacter> {
    const [character] = await db
      .insert(userCharacters)
      .values(data)
      .returning();
    return character;
  }

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

  async delete(id: string): Promise<void> {
    await db.delete(userCharacters).where(eq(userCharacters.id, id));
  }

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

    // Always filter by userId to ensure users only see their own agents
    conditions.push(eq(userCharacters.user_id, userId));

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

    // Always filter by userId to ensure users only see their own agents
    conditions.push(eq(userCharacters.user_id, userId));

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0]?.count || 0;
  }

  async incrementViewCount(id: string): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        view_count: sql`${userCharacters.view_count} + 1`,
      })
      .where(eq(userCharacters.id, id));
  }

  async incrementInteractionCount(id: string): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        interaction_count: sql`${userCharacters.interaction_count} + 1`,
      })
      .where(eq(userCharacters.id, id));
  }

  async updatePopularityScore(id: string, score: number): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        popularity_score: score,
      })
      .where(eq(userCharacters.id, id));
  }

  async getFeatured(limit: number = 10): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: eq(userCharacters.featured, true),
      orderBy: desc(userCharacters.popularity_score),
      limit,
    });
  }

  async getPopular(limit: number = 20): Promise<UserCharacter[]> {
    return await db.query.userCharacters.findMany({
      where: or(
        eq(userCharacters.is_template, true),
        eq(userCharacters.is_public, true),
      ),
      orderBy: desc(userCharacters.popularity_score),
      limit,
    });
  }

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

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }
}

// Export singleton instance
export const userCharactersRepository = new UserCharactersRepository();
