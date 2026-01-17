/**
 * User Test Data Builder
 *
 * Fluent API for creating test users with various states.
 *
 * @example
 * const user = await new UserBuilder()
 *   .withEmail("test@example.com")
 *   .withOrganization(org.id)
 *   .asOwner()
 *   .build(tx)
 */

import { users, type User } from "@/db/schemas/users";
import type { PgTransaction } from "drizzle-orm/pg-core";

type Transaction = PgTransaction<any, any, any>;

export interface UserBuilderData {
  email: string | null;
  name: string | null;
  organizationId: string | null;
  role: string;
  isAnonymous: boolean;
  isActive: boolean;
  walletAddress: string | null;
  walletChainType: string | null;
}

export class UserBuilder {
  private data: UserBuilderData;

  constructor() {
    const uniqueId = crypto.randomUUID().slice(0, 8);
    this.data = {
      email: `test-${uniqueId}@test.local`,
      name: `Test User ${uniqueId}`,
      organizationId: null,
      role: "member",
      isAnonymous: false,
      isActive: true,
      walletAddress: null,
      walletChainType: null,
    };
  }

  /**
   * Set email
   */
  withEmail(email: string): this {
    this.data.email = email;
    return this;
  }

  /**
   * Set name
   */
  withName(name: string): this {
    this.data.name = name;
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
   * Set as organization owner
   */
  asOwner(): this {
    this.data.role = "owner";
    return this;
  }

  /**
   * Set as organization admin
   */
  asAdmin(): this {
    this.data.role = "admin";
    return this;
  }

  /**
   * Set as organization member (default)
   */
  asMember(): this {
    this.data.role = "member";
    return this;
  }

  /**
   * Create as anonymous user
   */
  asAnonymous(): this {
    this.data.isAnonymous = true;
    this.data.email = null;
    this.data.name = null;
    return this;
  }

  /**
   * Make user inactive
   */
  inactive(): this {
    this.data.isActive = false;
    return this;
  }

  /**
   * Set wallet address
   */
  withWallet(address: string, chainType = "ethereum"): this {
    this.data.walletAddress = address;
    this.data.walletChainType = chainType;
    return this;
  }

  /**
   * Build and insert the user into the database
   */
  async build(tx: Transaction): Promise<User> {
    const [user] = await tx
      .insert(users)
      .values({
        email: this.data.email,
        name: this.data.name,
        organization_id: this.data.organizationId,
        role: this.data.role,
        is_anonymous: this.data.isAnonymous,
        is_active: this.data.isActive,
        wallet_address: this.data.walletAddress,
        wallet_chain_type: this.data.walletChainType,
      })
      .returning();

    return user;
  }

  /**
   * Get builder data without inserting (for inspection)
   */
  getData(): UserBuilderData {
    return { ...this.data };
  }
}
