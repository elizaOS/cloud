/**
 * Usage tracking service for recording and querying AI operation usage.
 */

import {
  usageRecordsRepository,
  type UsageRecord,
  type NewUsageRecord,
  type UsageStats,
} from "@/db/repositories";

/**
 * Service for tracking and querying usage records.
 */
export class UsageService {
  async getById(id: string): Promise<UsageRecord | undefined> {
    return await usageRecordsRepository.findById(id);
  }

  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<UsageRecord[]> {
    return await usageRecordsRepository.listByOrganization(
      organizationId,
      limit,
    );
  }

  async listByOrganizationAndDateRange(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageRecord[]> {
    return await usageRecordsRepository.listByOrganizationAndDateRange(
      organizationId,
      startDate,
      endDate,
    );
  }

  async getStatsByOrganization(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<UsageStats> {
    return await usageRecordsRepository.getStatsByOrganization(
      organizationId,
      startDate,
      endDate,
    );
  }

  async create(data: NewUsageRecord): Promise<UsageRecord> {
    return await usageRecordsRepository.create(data);
  }

  async trackUsage(data: NewUsageRecord): Promise<UsageRecord> {
    return await this.create(data);
  }

  async getByModel(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      model: string | null;
      provider: string;
      count: number;
      totalCost: number;
    }>
  > {
    return await usageRecordsRepository.getByModel(
      organizationId,
      startDate,
      endDate,
    );
  }
}

// Export singleton instance
export const usageService = new UsageService();
