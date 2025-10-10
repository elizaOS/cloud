import {
  eq,
  desc,
  and,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
import { db } from "../client";
import { userCharacters } from "../schemas/user-characters";

export type UserCharacter = InferSelectModel<typeof userCharacters>;
export type NewUserCharacter = InferInsertModel<typeof userCharacters>;

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

  async listByOrganization(
    organizationId: string,
  ): Promise<UserCharacter[]> {
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
}

// Export singleton instance
export const userCharactersRepository = new UserCharactersRepository();
