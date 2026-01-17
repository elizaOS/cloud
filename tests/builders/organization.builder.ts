/**
 * Organization Test Data Builder
 *
 * Fluent API for creating test organizations with various states.
 * Uses the Builder Pattern (Nat Pryce) instead of Object Mother.
 *
 * @example
 * const org = await new OrgBuilder()
 *   .withCredits(100)
 *   .withAutoTopUp(10, 50)
 *   .build(tx)
 */

import { organizations, type Organization } from "@/db/schemas/organizations";
import type { PgTransaction } from "drizzle-orm/pg-core";

type Transaction = PgTransaction<any, any, any>;

export interface OrgBuilderData {
  name: string;
  slug: string;
  creditBalance: number;
  autoTopUpEnabled: boolean;
  autoTopUpThreshold: number | null;
  autoTopUpAmount: number | null;
  billingEmail: string | null;
  isActive: boolean;
  settings: Record<string, unknown>;
  allowedModels: string[];
  allowedProviders: string[];
}

export class OrgBuilder {
  private data: OrgBuilderData;

  constructor() {
    const uniqueId = crypto.randomUUID().slice(0, 8);
    this.data = {
      name: `Test Org ${uniqueId}`,
      slug: `test-org-${uniqueId}`,
      creditBalance: 100,
      autoTopUpEnabled: false,
      autoTopUpThreshold: null,
      autoTopUpAmount: null,
      billingEmail: null,
      isActive: true,
      settings: {},
      allowedModels: [],
      allowedProviders: [],
    };
  }

  /**
   * Set credit balance
   */
  withCredits(amount: number): this {
    this.data.creditBalance = amount;
    return this;
  }

  /**
   * Preset: Low credits scenario (for testing alerts)
   */
  withLowCredits(): this {
    return this.withCredits(5);
  }

  /**
   * Preset: Zero credits
   */
  withNoCredits(): this {
    return this.withCredits(0);
  }

  /**
   * Preset: High balance
   */
  withHighCredits(): this {
    return this.withCredits(10000);
  }

  /**
   * Enable auto top-up with threshold and amount
   */
  withAutoTopUp(threshold = 10, amount = 50): this {
    this.data.autoTopUpEnabled = true;
    this.data.autoTopUpThreshold = threshold;
    this.data.autoTopUpAmount = amount;
    return this;
  }

  /**
   * Set billing email
   */
  withBillingEmail(email: string): this {
    this.data.billingEmail = email;
    return this;
  }

  /**
   * Set organization name
   */
  withName(name: string): this {
    this.data.name = name;
    return this;
  }

  /**
   * Set organization slug
   */
  withSlug(slug: string): this {
    this.data.slug = slug;
    return this;
  }

  /**
   * Make organization inactive
   */
  inactive(): this {
    this.data.isActive = false;
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
   * Set allowed models
   */
  withAllowedModels(models: string[]): this {
    this.data.allowedModels = models;
    return this;
  }

  /**
   * Set allowed providers
   */
  withAllowedProviders(providers: string[]): this {
    this.data.allowedProviders = providers;
    return this;
  }

  /**
   * Build and insert the organization into the database
   */
  async build(tx: Transaction): Promise<Organization> {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: this.data.name,
        slug: this.data.slug,
        credit_balance: String(this.data.creditBalance),
        auto_top_up_enabled: this.data.autoTopUpEnabled,
        auto_top_up_threshold: this.data.autoTopUpThreshold
          ? String(this.data.autoTopUpThreshold)
          : null,
        auto_top_up_amount: this.data.autoTopUpAmount
          ? String(this.data.autoTopUpAmount)
          : null,
        billing_email: this.data.billingEmail,
        is_active: this.data.isActive,
        settings: this.data.settings,
        allowed_models: this.data.allowedModels,
        allowed_providers: this.data.allowedProviders,
      })
      .returning();

    return org;
  }

  /**
   * Get builder data without inserting (for inspection)
   */
  getData(): OrgBuilderData {
    return { ...this.data };
  }
}
