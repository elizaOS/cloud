import { db, containers } from "@/db/drizzle";
import { eq, and, desc } from "drizzle-orm";

export type Container = typeof containers.$inferSelect;
export type NewContainer = typeof containers.$inferInsert;

export type ContainerStatus =
  | "pending"
  | "building"
  | "deploying"
  | "running"
  | "stopped"
  | "failed"
  | "deleting";

/**
 * List all containers for an organization
 */
export async function listContainers(
  organizationId: string,
): Promise<Container[]> {
  return await db
    .select()
    .from(containers)
    .where(eq(containers.organization_id, organizationId))
    .orderBy(desc(containers.created_at));
}

/**
 * Get a container by ID
 */
export async function getContainer(
  id: string,
  organizationId: string,
): Promise<Container | null> {
  const results = await db
    .select()
    .from(containers)
    .where(
      and(eq(containers.id, id), eq(containers.organization_id, organizationId)),
    )
    .limit(1);

  return results[0] || null;
}

/**
 * Create a new container
 */
export async function createContainer(
  data: NewContainer,
): Promise<Container> {
  const [container] = await db
    .insert(containers)
    .values({
      ...data,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning();

  return container;
}

/**
 * Update container status
 */
export async function updateContainerStatus(
  id: string,
  status: ContainerStatus,
  options?: {
    errorMessage?: string;
    deploymentLog?: string;
    cloudflareWorkerId?: string;
    cloudflareContainerId?: string;
    cloudflareUrl?: string;
  },
): Promise<Container> {
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
}

/**
 * Delete a container
 */
export async function deleteContainer(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const result = await db
    .delete(containers)
    .where(
      and(eq(containers.id, id), eq(containers.organization_id, organizationId)),
    )
    .returning();

  return result.length > 0;
}

/**
 * Update container health check
 */
export async function updateContainerHealth(
  id: string,
  healthy: boolean,
): Promise<Container> {
  const [container] = await db
    .update(containers)
    .set({
      last_health_check: new Date(),
      status: healthy ? "running" : "failed",
      updated_at: new Date(),
    })
    .where(eq(containers.id, id))
    .returning();

  return container;
}

