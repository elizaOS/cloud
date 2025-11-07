import {
  organizationsRepository,
  type Organization,
  type NewOrganization,
} from "@/db/repositories";

export class OrganizationsService {
  async getById(id: string): Promise<Organization | undefined> {
    return await organizationsRepository.findById(id);
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
