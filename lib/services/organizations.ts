/**
 * Organizations service for managing organization data and credit balances.
 */

import {
  organizationsRepository,
  type Organization,
  type NewOrganization,
} from "@/db/repositories";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

/**
 * Service for organization operations with caching support.
 */
export class OrganizationsService {
  async getById(id: string): Promise<Organization | undefined> {
    // Try cache first for org balance queries (used heavily in Eliza chat)
    const cacheKey = CacheKeys.eliza.orgBalance(id);
    const cached = await cache.get<{ balance: string; timestamp: number }>(
      cacheKey,
    );

    if (cached) {
      // Return organization with cached balance
      const org = await organizationsRepository.findById(id);
      if (org) {
        return { ...org, credit_balance: cached.balance };
      }
    }

    // Cache miss - fetch from DB
    const org = await organizationsRepository.findById(id);

    if (org) {
      // Cache the balance for quick subsequent lookups
      await cache.set(
        cacheKey,
        { balance: org.credit_balance, timestamp: Date.now() },
        CacheTTL.eliza.orgBalance,
      );
    }

    return org;
  }

  async getBySlug(slug: string): Promise<Organization | undefined> {
    return await organizationsRepository.findBySlug(slug);
  }

  async getByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Organization | undefined> {
    return await organizationsRepository.findByStripeCustomerId(
      stripeCustomerId,
    );
  }

  async getWithUsers(id: string) {
    return await organizationsRepository.findWithUsers(id);
  }

  async create(data: NewOrganization): Promise<Organization> {
    return await organizationsRepository.create(data);
  }

  async update(
    id: string,
    data: Partial<NewOrganization>,
  ): Promise<Organization | undefined> {
    return await organizationsRepository.update(id, data);
  }

  async updateCreditBalance(
    organizationId: string,
    amount: number,
  ): Promise<{ success: boolean; newBalance: number }> {
    return await organizationsRepository.updateCreditBalance(
      organizationId,
      amount,
    );
  }

  async delete(id: string): Promise<void> {
    await organizationsRepository.delete(id);
  }
}

// Export singleton instance
export const organizationsService = new OrganizationsService();

// Re-export types for convenience
export type { Organization, NewOrganization } from "@/db/repositories";
