/**
 * Container Status Service
 * Provides utilities for checking and updating container status with ECS
 */

import { containersRepository } from "@/db/repositories/containers";

export interface ContainerStatusInfo {
  containerId: string;
  status: string;
  ecsStatus?: {
    status: string;
    runningCount: number;
    desiredCount: number;
    tasks: Array<{
      taskArn?: string;
      lastStatus?: string;
      healthStatus?: string;
    }>;
  };
  healthy: boolean;
  error?: string;
  checkedAt: Date;
}

/**
 * Get comprehensive container status including ECS service status
 */
export async function getContainerStatus(
  containerId: string,
  organizationId: string
): Promise<ContainerStatusInfo | null> {
  try {
    // Get container from database
    const container = await containersRepository.findById(
      containerId,
      organizationId
    );

    if (!container) {
      return null;
    }

    const statusInfo: ContainerStatusInfo = {
      containerId: container.id,
      status: container.status,
      healthy: container.status === "running",
      checkedAt: new Date(),
    };

    // If container has ECS service, get its status
    // TODO: Implement ECS status checking when needed
    // For now, rely on CloudFormation stack status and health checks
    if (container.ecs_service_arn) {
      // ECS status checking would go here
      // Currently handled by CloudFormation stack outputs
      statusInfo.healthy = container.status === "running";
    }

    return statusInfo;
  } catch (error) {
    console.error("Error getting container status:", error);
    return null;
  }
}

/**
 * Sync container status from ECS to database
 */
export async function syncContainerStatusFromECS(
  containerId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const statusInfo = await getContainerStatus(containerId, organizationId);

    if (!statusInfo || !statusInfo.ecsStatus) {
      return false;
    }

    // Determine database status based on ECS status
    let dbStatus: string;
    if (statusInfo.ecsStatus.status === "ACTIVE" && statusInfo.healthy) {
      dbStatus = "running";
    } else if (statusInfo.ecsStatus.status === "DRAINING") {
      dbStatus = "stopping";
    } else if (statusInfo.ecsStatus.status === "INACTIVE") {
      dbStatus = "stopped";
    } else if (
      statusInfo.ecsStatus.runningCount === 0 &&
      statusInfo.ecsStatus.desiredCount > 0
    ) {
      dbStatus = "deploying";
    } else {
      dbStatus = "unknown";
    }

    // Update container status in database
    await containersRepository.updateStatus(
      containerId,
      dbStatus as "pending" | "building" | "deploying" | "running" | "stopped" | "failed" | "deleting" | "deleted",
      statusInfo.error
    );

    // Update health check timestamp
    await containersRepository.updateHealthCheck(containerId);

    return true;
  } catch (error) {
    console.error("Error syncing container status:", error);
    return false;
  }
}

/**
 * Check container health via load balancer URL
 */
export async function checkContainerHealth(
  containerId: string,
  organizationId: string
): Promise<{
  healthy: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}> {
  try {
    const container = await containersRepository.findById(
      containerId,
      organizationId
    );

    if (!container) {
      return { healthy: false, error: "Container not found" };
    }

    if (!container.load_balancer_url) {
      return { healthy: false, error: "No load balancer URL available" };
    }

    // Try to hit the health check endpoint
    const startTime = Date.now();
    const healthUrl = `${container.load_balancer_url}${container.health_check_path || "/health"}`;

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = Date.now() - startTime;

      return {
        healthy: response.ok,
        statusCode: response.status,
        responseTime,
      };
    } catch (fetchError) {
      const responseTime = Date.now() - startTime;
      return {
        healthy: false,
        statusCode: 0,
        responseTime,
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Health check failed",
      };
    }
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

