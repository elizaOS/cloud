import { eq, desc, and, or, ilike, sql, SQL, inArray } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
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
    return await dbRead.query.userCharacters.findFirst({
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
  async listByUser(
    userId: string,
    source: "cloud" | "app" = "cloud",
  ): Promise<UserCharacter[]> {
    const interactedCharacterIds = dbRead
      .selectDistinct({ character_id: elizaRoomCharactersTable.character_id })
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.user_id, userId));

    return await dbRead
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
  async listByOrganization(
    organizationId: string,
    source: "cloud" | "app" = "cloud",
  ): Promise<UserCharacter[]> {
    return await dbRead.query.userCharacters.findMany({
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
    return await dbRead.query.userCharacters.findMany({
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
    return await dbRead.query.userCharacters.findMany({
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
    const [character] = await dbWrite
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
    const [updated] = await dbWrite
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
    await dbWrite.delete(userCharacters).where(eq(userCharacters.id, id));
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

    // Filter by source (cloud vs app)
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    // Include characters that user owns OR has interacted with via chat rooms
    // This allows affiliate-created characters (clone-your-crush) to appear in my-agents
    // when the user has chatted with them, even if they don't "own" the character
    const interactedCharacterIds = dbRead
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

    return await dbRead
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

    // Filter by source (cloud vs app)
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    // Include characters that user owns OR has interacted with via chat rooms
    const interactedCharacterIds = dbRead
      .selectDistinct({ character_id: elizaRoomCharactersTable.character_id })
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.user_id, userId));

    conditions.push(
      or(
        eq(userCharacters.user_id, userId),
        inArray(userCharacters.id, interactedCharacterIds),
      )!,
    );

    const result = await dbRead
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result[0]?.count || 0;
  }

  /**
   * Atomically increments the view count for a character.
   */
  async incrementViewCount(id: string): Promise<void> {
    await dbWrite
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
    await dbWrite
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
    await dbWrite
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
    return await dbRead.query.userCharacters.findMany({
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
    return await dbRead.query.userCharacters.findMany({
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

    // Filter by source (cloud vs app) - app agents should never appear in public marketplace
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

    return await dbRead
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

    // Filter by source (cloud vs app) - app agents should never appear in public marketplace
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }

    const result = await dbRead
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }

  /**
   * Lists public characters registered on ERC-8004.
   * Used for marketplace discovery by external agents.
   */
  async findPublicRegistered(
    options: {
      erc8004Only?: boolean;
      category?: string;
      limit?: number;
    } = {},
  ): Promise<UserCharacter[]> {
    const { erc8004Only = false, category, limit = 100 } = options;

    const conditions: SQL[] = [
      eq(userCharacters.is_public, true),
      eq(userCharacters.source, "cloud"),
    ];

    if (erc8004Only) {
      conditions.push(eq(userCharacters.erc8004_registered, true));
    }

    if (category) {
      conditions.push(eq(userCharacters.category, category));
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(
        desc(userCharacters.popularity_score),
        desc(userCharacters.created_at),
      )
      .limit(limit);
  }

  /**
   * Gets characters by ERC-8004 agent ID.
   */
  async getByERC8004AgentId(
    network: string,
    agentId: number,
  ): Promise<UserCharacter | undefined> {
    return await db.query.userCharacters.findFirst({
      where: and(
        eq(userCharacters.erc8004_network, network),
        eq(userCharacters.erc8004_agent_id, agentId),
      ),
    });
  }

  /**
   * Lists all ERC-8004 registered characters.
   */
  async listERC8004Registered(
    options: {
      network?: string;
      limit?: number;
    } = {},
  ): Promise<UserCharacter[]> {
    const { network, limit = 100 } = options;

    const conditions: SQL[] = [eq(userCharacters.erc8004_registered, true)];

    if (network) {
      conditions.push(eq(userCharacters.erc8004_network, network));
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(desc(userCharacters.erc8004_registered_at))
      .limit(limit);
  }

  /**
   * Records inference earnings for a character.
   * Uses atomic SQL operations for safe concurrent updates.
   */
  async recordInferenceEarnings(
    id: string,
    creatorEarnings: string,
    platformRevenue: string,
  ): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        total_inference_requests: sql`${userCharacters.total_inference_requests} + 1`,
        total_creator_earnings: sql`${userCharacters.total_creator_earnings} + ${creatorEarnings}::numeric`,
        total_platform_revenue: sql`${userCharacters.total_platform_revenue} + ${platformRevenue}::numeric`,
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, id));
  }

  /**
   * Updates ERC-8004 registration status for a character.
   */
  async updateERC8004Registration(
    id: string,
    data: {
      erc8004_registered: boolean;
      erc8004_network?: string;
      erc8004_agent_id?: number;
      erc8004_agent_uri?: string;
      erc8004_tx_hash?: string;
    },
  ): Promise<UserCharacter | undefined> {
    const [character] = await db
      .update(userCharacters)
      .set({
        ...data,
        erc8004_registered_at: data.erc8004_registered ? new Date() : null,
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, id))
      .returning();
    return character;
  }

  /**
   * Updates monetization settings for a character.
   */
  async updateMonetization(
    id: string,
    data: {
      monetization_enabled: boolean;
      inference_markup_percentage?: string;
      payout_wallet_address?: string;
    },
  ): Promise<UserCharacter | undefined> {
    const [character] = await db
      .update(userCharacters)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, id))
      .returning();
    return character;
  }
}

/**
 * Singleton instance of UserCharactersRepository.
 */
export const userCharactersRepository = new UserCharactersRepository();
