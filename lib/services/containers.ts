/**
 * Containers Service
 * Provides high-level container management functions
 * Uses the containers repository for all data access
 */

import {
  containersRepository,
  type Container,
  type NewContainer,
  type ContainerStatus,
} from "@/db/repositories/containers";
import type { Database } from "@/db/client";
import { db } from "@/db/client";
import { containers } from "@/db/schemas/containers";
import { eq } from "drizzle-orm";

// Re-export types from repository
export type {
  Container,
  NewContainer,
  ContainerStatus,
} from "@/db/repositories/containers";

export class ContainersService {
  async listByOrganization(organizationId: string): Promise<Container[]> {
    return await containersRepository.listByOrganization(organizationId);
  }

  async getById(
    id: string,
    organizationId: string,
  ): Promise<Container | null> {
    return await containersRepository.findById(id, organizationId);
  }

  async create(data: NewContainer): Promise<Container> {
    return await containersRepository.create(data);
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<NewContainer>,
  ): Promise<Container | null> {
    return await containersRepository.update(id, organizationId, data);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    return await containersRepository.delete(id, organizationId);
  }

  async updateStatus(
    id: string,
    status: ContainerStatus,
    errorMessage?: string,
  ): Promise<Container | null> {
    return await containersRepository.updateStatus(id, status, errorMessage);
  }

  async updateHealthCheck(id: string): Promise<Container | null> {
    return await containersRepository.updateHealthCheck(id);
  }

  async checkQuota(organizationId: string) {
    return await containersRepository.checkQuota(organizationId);
  }

  async createWithQuotaCheck(
    data: NewContainer,
    transaction?: Database,
  ): Promise<Container> {
    return await containersRepository.createWithQuotaCheck(data, transaction);
  }

  async createContainerWithCreditDeduction(
    containerData: NewContainer,
    userId: string,
    deploymentCost: number,
  ): Promise<{ container: Container; newBalance: number }> {
    return await containersRepository.createContainerWithCreditDeduction(
      containerData,
      userId,
      deploymentCost,
    );
  }
}

// Export singleton instance
export const containersService = new ContainersService();

// Export individual functions for backward compatibility with existing API routes
export const listContainers = (organizationId: string) =>
  containersService.listByOrganization(organizationId);

export const getContainer = (id: string, organizationId: string) =>
  containersService.getById(id, organizationId);

export const createContainer = (data: NewContainer) =>
  containersService.create(data);

export const updateContainer = (
  id: string,
  organizationId: string,
  data: Partial<NewContainer>
) => containersService.update(id, organizationId, data);

export const deleteContainer = (id: string, organizationId: string) =>
  containersService.delete(id, organizationId);

export const updateContainerStatus = async (
  id: string,
  status: ContainerStatus,
  options?: string | {
    errorMessage?: string;
    deploymentLog?: string;
    cloudflareWorkerId?: string;
    cloudflareContainerId?: string;
    cloudflareUrl?: string;
  }
): Promise<Container> => {
  // Handle both old string format and new options object format
  if (typeof options === "string") {
    const result = await containersService.updateStatus(id, status, options);
    if (!result) throw new Error("Container not found");
    return result;
  }
  
  // Build update data - use direct db access for backward compatibility
  // This matches the original queries/containers.ts implementation
  const updateData: Partial<Container> = {
    status,
    updated_at: new Date(),
  };
  
  if (options?.errorMessage) {
    updateData.error_message = options.errorMessage;
  }
  
  if (options?.deploymentLog) {
    updateData.deployment_log = options.deploymentLog;
  }
  
  if (options?.cloudflareWorkerId) {
    updateData.cloudflare_worker_id = options.cloudflareWorkerId;
  }
  
  if (options?.cloudflareContainerId) {
    updateData.cloudflare_container_id = options.cloudflareContainerId;
  }
  
  if (options?.cloudflareUrl) {
    updateData.cloudflare_url = options.cloudflareUrl;
  }
  
  if (status === "running") {
    updateData.last_deployed_at = new Date();
  }
  
  const [container] = await db
    .update(containers)
    .set(updateData)
    .where(eq(containers.id, id))
    .returning();
  
  return container;
};

export const updateContainerHealth = (id: string) =>
  containersService.updateHealthCheck(id);

export const createContainerWithCreditDeduction = (
  containerData: NewContainer,
  userId: string,
  deploymentCost: number
) =>
  containersService.createContainerWithCreditDeduction(
    containerData,
    userId,
    deploymentCost
  );
