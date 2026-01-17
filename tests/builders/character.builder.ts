/**
 * Character (Agent) Test Data Builder
 *
 * Fluent API for creating test characters/agents.
 * Characters are required for agent budget tests.
 *
 * @example
 * const character = await new CharacterBuilder()
 *   .withName("Test Agent")
 *   .withOrganization(org.id)
 *   .withUser(user.id)
 *   .asPublic()
 *   .withMonetization(50)
 *   .build(tx)
 */

import {
  userCharacters,
  type UserCharacter,
} from "@/db/schemas/user-characters";
import type { PgTransaction } from "drizzle-orm/pg-core";

type Transaction = PgTransaction<any, any, any>;

export interface CharacterBuilderData {
  name: string;
  username: string | null;
  organizationId: string | null;
  userId: string | null;
  bio: string | string[];
  system: string | null;
  isPublic: boolean;
  isTemplate: boolean;
  monetizationEnabled: boolean;
  inferenceMarkupPercentage: number;
  characterData: Record<string, unknown>;
  settings: Record<string, unknown>;
}

export class CharacterBuilder {
  private data: CharacterBuilderData;

  constructor() {
    const uniqueId = crypto.randomUUID().slice(0, 8);
    this.data = {
      name: `Test Character ${uniqueId}`,
      username: null,
      organizationId: null,
      userId: null,
      bio: "A test character for unit testing",
      system: null,
      isPublic: false,
      isTemplate: false,
      monetizationEnabled: false,
      inferenceMarkupPercentage: 0,
      characterData: {},
      settings: {},
    };
  }

  /**
   * Set character name
   */
  withName(name: string): this {
    this.data.name = name;
    return this;
  }

  /**
   * Set username for URL routing
   */
  withUsername(username: string): this {
    this.data.username = username;
    return this;
  }

  /**
   * Link to organization
   */
  withOrganization(organizationId: string): this {
    this.data.organizationId = organizationId;
    return this;
  }

  /**
   * Link to user (owner)
   */
  withUser(userId: string): this {
    this.data.userId = userId;
    return this;
  }

  /**
   * Set bio
   */
  withBio(bio: string | string[]): this {
    this.data.bio = bio;
    return this;
  }

  /**
   * Set system prompt
   */
  withSystem(system: string): this {
    this.data.system = system;
    return this;
  }

  /**
   * Make character public
   */
  asPublic(): this {
    this.data.isPublic = true;
    return this;
  }

  /**
   * Make character a template
   */
  asTemplate(): this {
    this.data.isTemplate = true;
    return this;
  }

  /**
   * Enable monetization with markup percentage
   */
  withMonetization(markupPercentage = 50): this {
    this.data.monetizationEnabled = true;
    this.data.inferenceMarkupPercentage = markupPercentage;
    return this;
  }

  /**
   * Set custom character data
   */
  withCharacterData(data: Record<string, unknown>): this {
    this.data.characterData = data;
    return this;
  }

  /**
   * Set custom settings
   */
  withSettings(settings: Record<string, unknown>): this {
    this.data.settings = settings;
    return this;
  }

  /**
   * Build and insert the character into the database
   */
  async build(tx: Transaction): Promise<UserCharacter> {
    if (!this.data.organizationId) {
      throw new Error("CharacterBuilder: organizationId is required");
    }
    if (!this.data.userId) {
      throw new Error("CharacterBuilder: userId is required");
    }

    const [character] = await tx
      .insert(userCharacters)
      .values({
        name: this.data.name,
        username: this.data.username,
        organization_id: this.data.organizationId,
        user_id: this.data.userId,
        bio: this.data.bio,
        system: this.data.system,
        is_public: this.data.isPublic,
        is_template: this.data.isTemplate,
        monetization_enabled: this.data.monetizationEnabled,
        inference_markup_percentage: String(
          this.data.inferenceMarkupPercentage,
        ),
        character_data: this.data.characterData,
        settings: this.data.settings,
      })
      .returning();

    return character;
  }

  /**
   * Get builder data without inserting (for inspection)
   */
  getData(): CharacterBuilderData {
    return { ...this.data };
  }
}
