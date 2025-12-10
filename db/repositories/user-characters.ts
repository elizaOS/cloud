/**
 * User Characters Repository
 *
 * Handles database operations for user-created characters.
 * Supports public marketplace listings, ERC-8004 registration, and monetization.
 */

import { db } from "@/db/client";
import {
  userCharacters,
  type UserCharacter,
  type NewUserCharacter,
} from "@/db/schemas/user-characters";
import { eq, and, desc, asc, ilike, or, sql, inArray } from "drizzle-orm";

export interface UserCharacterFilters {
  organizationId?: string;
  userId?: string;
  isPublic?: boolean;
  isTemplate?: boolean;
  erc8004Registered?: boolean;
  monetizationEnabled?: boolean;
  category?: string;
  tags?: string[];
  search?: string;
  source?: string;
}

export interface UserCharacterSortOptions {
  field: "created_at" | "updated_at" | "popularity_score" | "name" | "view_count";
  direction: "asc" | "desc";
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

class UserCharactersRepository {
  /**
   * Create a new user character
   */
  async create(data: NewUserCharacter): Promise<UserCharacter> {
    const [character] = await db
      .insert(userCharacters)
      .values(data)
      .returning();
    return character;
  }

  /**
   * Find character by ID
   */
  async findById(id: string): Promise<UserCharacter | undefined> {
    return await db.query.userCharacters.findFirst({
      where: eq(userCharacters.id, id),
    });
  }

  /**
   * List characters with filters
   */
  async list(
    filters: UserCharacterFilters = {},
    sort: UserCharacterSortOptions = { field: "created_at", direction: "desc" },
    pagination: PaginationOptions = {}
  ): Promise<{ characters: UserCharacter[]; total: number }> {
    const { limit = 50, offset = 0 } = pagination;

    // Build where conditions
    const conditions = [];

    if (filters.organizationId) {
      conditions.push(eq(userCharacters.organization_id, filters.organizationId));
    }
    if (filters.userId) {
      conditions.push(eq(userCharacters.user_id, filters.userId));
    }
    if (filters.isPublic !== undefined) {
      conditions.push(eq(userCharacters.is_public, filters.isPublic));
    }
    if (filters.isTemplate !== undefined) {
      conditions.push(eq(userCharacters.is_template, filters.isTemplate));
    }
    if (filters.erc8004Registered !== undefined) {
      conditions.push(eq(userCharacters.erc8004_registered, filters.erc8004Registered));
    }
    if (filters.monetizationEnabled !== undefined) {
      conditions.push(eq(userCharacters.monetization_enabled, filters.monetizationEnabled));
    }
    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }
    if (filters.source) {
      conditions.push(eq(userCharacters.source, filters.source));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          ilike(userCharacters.username, `%${filters.search}%`)
        )
      );
    }
    if (filters.tags && filters.tags.length > 0) {
      // Check if tags array contains any of the specified tags
      conditions.push(
        sql`${userCharacters.tags} ?| array[${sql.join(
          filters.tags.map((t) => sql`${t}`),
          sql`, `
        )}]`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build sort
    const orderBy =
      sort.direction === "asc"
        ? asc(userCharacters[sort.field])
        : desc(userCharacters[sort.field]);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(whereClause);
    const total = Number(countResult[0]?.count ?? 0);

    // Get characters
    const characters = await db
      .select()
      .from(userCharacters)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return { characters, total };
  }

  /**
   * List characters by organization
   */
  async listByOrganization(
    organizationId: string,
    options: { includePrivate?: boolean } = {}
  ): Promise<UserCharacter[]> {
    const conditions = [eq(userCharacters.organization_id, organizationId)];

    if (!options.includePrivate) {
      conditions.push(eq(userCharacters.is_public, true));
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(desc(userCharacters.created_at));
  }

  /**
   * List public characters for marketplace
   */
  async listPublic(
    options: {
      category?: string;
      tags?: string[];
      featured?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<UserCharacter[]> {
    const { limit = 50, offset = 0 } = options;

    const conditions = [eq(userCharacters.is_public, true)];

    if (options.category) {
      conditions.push(eq(userCharacters.category, options.category));
    }
    if (options.featured !== undefined) {
      conditions.push(eq(userCharacters.featured, options.featured));
    }
    if (options.tags && options.tags.length > 0) {
      conditions.push(
        sql`${userCharacters.tags} ?| array[${sql.join(
          options.tags.map((t) => sql`${t}`),
          sql`, `
        )}]`
      );
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(desc(userCharacters.popularity_score))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Search public characters for marketplace (with sorting)
   */
  async searchPublic(
    filters: UserCharacterFilters,
    sort: UserCharacterSortOptions,
    limit: number = 50,
    offset: number = 0
  ): Promise<UserCharacter[]> {
    const conditions = [eq(userCharacters.is_public, true)];

    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          ilike(userCharacters.bio, `%${filters.search}%`)
        )
      );
    }
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(
        sql`${userCharacters.tags} ?| array[${sql.join(
          filters.tags.map((t) => sql`${t}`),
          sql`, `
        )}]`
      );
    }

    // Build order clause
    let orderColumn;
    switch (sort.field) {
      case "popularity_score": orderColumn = userCharacters.popularity_score; break;
      case "created_at": orderColumn = userCharacters.created_at; break;
      case "updated_at": orderColumn = userCharacters.updated_at; break;
      case "name": orderColumn = userCharacters.name; break;
      case "view_count": orderColumn = userCharacters.view_count; break;
      default: orderColumn = userCharacters.popularity_score;
    }

    const orderFn = sort.direction === "asc" ? asc : desc;

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Count public characters for pagination
   */
  async countPublic(filters: UserCharacterFilters): Promise<number> {
    const conditions = [eq(userCharacters.is_public, true)];

    if (filters.category) {
      conditions.push(eq(userCharacters.category, filters.category));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(userCharacters.name, `%${filters.search}%`),
          ilike(userCharacters.bio, `%${filters.search}%`)
        )
      );
    }
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(
        sql`${userCharacters.tags} ?| array[${sql.join(
          filters.tags.map((t) => sql`${t}`),
          sql`, `
        )}]`
      );
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(and(...conditions));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * List ERC-8004 registered characters
   */
  async listERC8004Registered(
    options: {
      network?: string;
      monetizationEnabled?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<UserCharacter[]> {
    const { limit = 50, offset = 0 } = options;

    const conditions = [eq(userCharacters.erc8004_registered, true)];

    if (options.network) {
      conditions.push(eq(userCharacters.erc8004_network, options.network));
    }
    if (options.monetizationEnabled !== undefined) {
      conditions.push(eq(userCharacters.monetization_enabled, options.monetizationEnabled));
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(desc(userCharacters.popularity_score))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Update a character
   */
  async update(
    id: string,
    data: Partial<Omit<UserCharacter, "id" | "created_at">>
  ): Promise<UserCharacter | undefined> {
    const [character] = await db
      .update(userCharacters)
      .set({ ...data, updated_at: new Date() })
      .where(eq(userCharacters.id, id))
      .returning();
    return character;
  }

  /**
   * Delete a character
   */
  async delete(id: string): Promise<void> {
    await db.delete(userCharacters).where(eq(userCharacters.id, id));
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: string): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        view_count: sql`${userCharacters.view_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, id));
  }

  /**
   * Increment interaction count and update popularity
   */
  async incrementInteraction(id: string): Promise<void> {
    await db
      .update(userCharacters)
      .set({
        interaction_count: sql`${userCharacters.interaction_count} + 1`,
        // Simple popularity calculation: views + 5*interactions
        popularity_score: sql`${userCharacters.view_count} + 5 * (${userCharacters.interaction_count} + 1)`,
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, id));
  }

  /**
   * Update ERC-8004 registration status
   */
  async updateERC8004Registration(
    id: string,
    data: {
      erc8004_registered: boolean;
      erc8004_network?: string;
      erc8004_agent_id?: number;
      erc8004_agent_uri?: string;
      erc8004_tx_hash?: string;
    }
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
   * Update monetization settings
   */
  async updateMonetization(
    id: string,
    data: {
      monetization_enabled: boolean;
      inference_markup_percentage?: string;
      payout_wallet_address?: string;
    }
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

  /**
   * Record inference earnings
   */
  async recordInferenceEarnings(
    id: string,
    creatorEarnings: string,
    platformRevenue: string
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
   * Get characters by multiple IDs
   */
  async findByIds(ids: string[]): Promise<UserCharacter[]> {
    if (ids.length === 0) return [];

    return await db
      .select()
      .from(userCharacters)
      .where(inArray(userCharacters.id, ids));
  }

  /**
   * Search characters by name or category
   */
  async search(
    query: string,
    options: {
      publicOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<UserCharacter[]> {
    const { publicOnly = true, limit = 20 } = options;

    const conditions = [
      or(
        ilike(userCharacters.name, `%${query}%`),
        ilike(userCharacters.username, `%${query}%`),
        ilike(userCharacters.category, `%${query}%`)
      ),
    ];

    if (publicOnly) {
      conditions.push(eq(userCharacters.is_public, true));
    }

    return await db
      .select()
      .from(userCharacters)
      .where(and(...conditions))
      .orderBy(desc(userCharacters.popularity_score))
      .limit(limit);
  }

  /**
   * Get unique categories
   */
  async getCategories(): Promise<string[]> {
    const result = await db
      .selectDistinct({ category: userCharacters.category })
      .from(userCharacters)
      .where(
        and(
          eq(userCharacters.is_public, true),
          sql`${userCharacters.category} IS NOT NULL`
        )
      );

    return result.map((r) => r.category).filter((c): c is string => c !== null);
  }

  /**
   * Get character count by organization
   */
  async countByOrganization(organizationId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCharacters)
      .where(eq(userCharacters.organization_id, organizationId));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Find public characters registered on ERC-8004.
   * Used for marketplace discovery by external agents.
   */
  async findPublicRegistered(options: {
    erc8004Only?: boolean;
    category?: string;
    limit?: number;
  } = {}): Promise<UserCharacter[]> {
    const { erc8004Only = false, category, limit = 100 } = options;

    const conditions = [
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
      .orderBy(desc(userCharacters.popularity_score), desc(userCharacters.created_at))
      .limit(limit);
  }
}

export const userCharactersRepository = new UserCharactersRepository();

