/**
 * Container Health Monitoring Service
 * Monitors deployed containers and updates their health status
 */

import { db } from "@/db/drizzle";
import { containers } from "@/db/sass/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export interface HealthCheckResult {
  containerId: string;
  healthy: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  checkedAt: Date;
}

export interface HealthMonitorConfig {
  checkIntervalMs: number;
  timeout: number;
  unhealthyThreshold: number; // Number of failed checks before marking unhealthy
  retryOnFailure: boolean;
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: 60000, // 1 minute
  timeout: 10000, // 10 seconds
  unhealthyThreshold: 3,
  retryOnFailure: true,
};

/**
 * Perform health check on a container
 */
export async function checkContainerHealth(
  containerUrl: string,
  healthCheckPath: string = "/health",
  timeoutMs: number = 10000
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const fullUrl = `${containerUrl}${healthCheckPath}`;

  try {
    logger.debug("Performing health check", { url: fullUrl });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(fullUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "ElizaOS-HealthMonitor/1.0",
      },
    });

    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;
    const healthy = response.ok; // 200-299 status codes

    return {
      containerId: "", // Set by caller
      healthy,
      statusCode: response.status,
      responseTime,
      checkedAt: new Date(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.warn("Health check failed", { url: fullUrl, error: errorMessage });

    return {
      containerId: "", // Set by caller
      healthy: false,
      responseTime,
      error: errorMessage,
      checkedAt: new Date(),
    };
  }
}

/**
 * Update container health status in database
 */
export async function updateContainerHealth(
  containerId: string,
  healthResult: HealthCheckResult
): Promise<void> {
  try {
    await db
      .update(containers)
      .set({
        last_health_check: healthResult.checkedAt,
        // Update status to 'unhealthy' if check failed, keep current status if healthy
        status: healthResult.healthy
          ? undefined // Don't change status
          : "failed", // Mark as failed if unhealthy
        error_message: healthResult.error || null,
        updated_at: new Date(),
      })
      .where(eq(containers.id, containerId));

    logger.debug("Container health status updated", {
      containerId,
      healthy: healthResult.healthy,
    });
  } catch (error) {
    logger.error(
      "Failed to update container health status",
      error instanceof Error ? error : new Error(String(error)),
      { containerId }
    );
  }
}

/**
 * Monitor all running containers
 * This should be called periodically (e.g., via cron job)
 */
export async function monitorAllContainers(
  config: Partial<HealthMonitorConfig> = {}
): Promise<HealthCheckResult[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    logger.info("Starting health check for all containers");

    // Get all running containers
    const runningContainers = await db
      .select()
      .from(containers)
      .where(eq(containers.status, "running"));

    logger.info(`Found ${runningContainers.length} running containers to check`);

    const results: HealthCheckResult[] = [];

    // Check each container
    for (const container of runningContainers) {
      if (!container.cloudflare_url) {
        logger.warn("Container has no URL, skipping health check", {
          containerId: container.id,
        });
        continue;
      }

      const result = await checkContainerHealth(
        container.cloudflare_url,
        container.health_check_path || "/health",
        finalConfig.timeout
      );

      result.containerId = container.id;
      results.push(result);

      // Update database
      await updateContainerHealth(container.id, result);

      if (!result.healthy) {
        logger.warn("Container health check failed", {
          containerId: container.id,
          url: container.cloudflare_url,
          error: result.error,
        });
      }
    }

    const healthyCount = results.filter((r) => r.healthy).length;
    const unhealthyCount = results.length - healthyCount;

    logger.info("Health check completed", {
      total: results.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
    });

    return results;
  } catch (error) {
    logger.error(
      "Container health monitoring failed",
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}

/**
 * Get health status for a specific container
 */
export async function getContainerHealthStatus(
  containerId: string
): Promise<HealthCheckResult | null> {
  try {
    const container = await db
      .select()
      .from(containers)
      .where(eq(containers.id, containerId))
      .limit(1);

    if (container.length === 0 || !container[0].cloudflare_url) {
      return null;
    }

    const result = await checkContainerHealth(
      container[0].cloudflare_url,
      container[0].health_check_path || "/health"
    );

    result.containerId = containerId;
    await updateContainerHealth(containerId, result);

    return result;
  } catch (error) {
    logger.error(
      "Failed to get container health status",
      error instanceof Error ? error : new Error(String(error)),
      { containerId }
    );
    return null;
  }
}

/**
 * Start continuous health monitoring
 * Call this on application startup
 */
export function startHealthMonitoring(
  intervalMs: number = 60000
): NodeJS.Timeout {
  logger.info("Starting continuous health monitoring", {
    intervalMs,
  });

  const interval = setInterval(async () => {
    try {
      await monitorAllContainers();
    } catch (error) {
      logger.error(
        "Health monitoring cycle failed",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }, intervalMs);

  // Also run immediately on startup
  monitorAllContainers().catch((error) => {
    logger.error(
      "Initial health check failed",
      error instanceof Error ? error : new Error(String(error))
    );
  });

  return interval;
}

/**
 * Stop health monitoring
 */
export function stopHealthMonitoring(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  logger.info("Health monitoring stopped");
}

