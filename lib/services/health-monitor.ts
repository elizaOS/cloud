/**
 * Container Health Monitoring Service
 * Monitors deployed containers and updates their health status
 */

import { db } from "@/db/client";
import { containers } from "@/db/schemas";
import { eq, and } from "drizzle-orm";

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
  timeoutMs: number = 10000,
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const fullUrl = `${containerUrl}${healthCheckPath}`;

  try {
    console.log("Performing health check", { url: fullUrl });

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

    console.warn("Health check failed", { url: fullUrl, error: errorMessage });

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
 * Only updates status to 'failed' if container is currently 'running'
 * This prevents overwriting transitional states like 'building' or 'deploying'
 */
export async function updateContainerHealth(
  containerId: string,
  healthResult: HealthCheckResult,
): Promise<void> {
  try {
    // RACE CONDITION FIX: Use atomic conditional UPDATE instead of check-then-act
    // This prevents race conditions by including expected status in WHERE clause

    const baseUpdate = {
      last_health_check: healthResult.checkedAt,
      updated_at: new Date(),
    };

    if (!healthResult.healthy) {
      // Atomically mark as failed ONLY if currently running
      // The WHERE clause ensures we only update if status hasn't changed
      const [updatedContainer] = await db
        .update(containers)
        .set({
          ...baseUpdate,
          status: "failed",
          error_message: healthResult.error || "Health check failed",
        })
        .where(
          and(
            eq(containers.id, containerId),
            eq(containers.status, "running"), // Only update if still running
          ),
        )
        .returning({ id: containers.id });

      // If no rows were updated, container status has changed (not a race condition)
      if (!updatedContainer) {
        // Just update health check timestamp without changing status
        await db
          .update(containers)
          .set(baseUpdate)
          .where(eq(containers.id, containerId));

        console.log(
          "Container health check failed, but status changed (not running anymore)",
          {
            containerId,
            healthy: false,
          },
        );
        return;
      }

      console.log("Container health status updated to failed", {
        containerId,
        healthy: false,
        previousStatus: "running",
        newStatus: "failed",
      });
    } else {
      // Health check passed - atomically restore to running ONLY if currently failed
      const [updatedContainer] = await db
        .update(containers)
        .set({
          ...baseUpdate,
          status: "running",
          error_message: null,
        })
        .where(
          and(
            eq(containers.id, containerId),
            eq(containers.status, "failed"), // Only restore if currently failed
          ),
        )
        .returning({ id: containers.id });

      if (!updatedContainer) {
        // Just update health check timestamp for non-failed containers
        await db
          .update(containers)
          .set(baseUpdate)
          .where(eq(containers.id, containerId));

        console.log("Container health check passed, status unchanged", {
          containerId,
          healthy: true,
        });
        return;
      }

      console.log("Container health status restored to running", {
        containerId,
        healthy: true,
        previousStatus: "failed",
        newStatus: "running",
      });
    }
  } catch (error) {
    console.error(
      "Failed to update container health status",
      error instanceof Error ? error.message : String(error),
      { containerId },
    );
  }
}

/**
 * Monitor all running containers
 * This should be called periodically (e.g., via cron job)
 */
export async function monitorAllContainers(
  config: Partial<HealthMonitorConfig> = {},
): Promise<HealthCheckResult[]> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    console.log("Starting health check for all containers");

    // Get all running containers
    const runningContainers = await db
      .select()
      .from(containers)
      .where(eq(containers.status, "running"));

    console.log(
      `Found ${runningContainers.length} running containers to check`,
    );

    const results: HealthCheckResult[] = [];

    // Check each container
    for (const container of runningContainers) {
      if (!container.cloudflare_url) {
        console.warn("Container has no URL, skipping health check", {
          containerId: container.id,
        });
        continue;
      }

      const result = await checkContainerHealth(
        container.cloudflare_url,
        container.health_check_path || "/health",
        finalConfig.timeout,
      );

      result.containerId = container.id;
      results.push(result);

      // Update database
      await updateContainerHealth(container.id, result);

      if (!result.healthy) {
        console.warn("Container health check failed", {
          containerId: container.id,
          url: container.cloudflare_url,
          error: result.error,
        });
      }
    }

    const healthyCount = results.filter((r) => r.healthy).length;
    const unhealthyCount = results.length - healthyCount;

    console.log("Health check completed", {
      total: results.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
    });

    return results;
  } catch (error) {
    console.error(
      "Container health monitoring failed",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

/**
 * Get health status for a specific container
 */
export async function getContainerHealthStatus(
  containerId: string,
): Promise<HealthCheckResult | null> {
  try {
    // Note: We need to get container without organization_id here
    // So we still use db directly, but this is acceptable for health monitoring
    const results = await db
      .select()
      .from(containers)
      .where(eq(containers.id, containerId))
      .limit(1);

    if (results.length === 0 || !results[0].cloudflare_url) {
      return null;
    }

    const container = results[0];

    if (!container.cloudflare_url) {
      return null;
    }

    const result = await checkContainerHealth(
      container.cloudflare_url,
      container.health_check_path || "/health",
    );

    result.containerId = containerId;
    await updateContainerHealth(containerId, result);

    return result;
  } catch (error) {
    console.error(
      "Failed to get container health status",
      error instanceof Error ? error.message : String(error),
      { containerId },
    );
    return null;
  }
}

/**
 * Start continuous health monitoring
 * Call this on application startup
 */
export function startHealthMonitoring(
  intervalMs: number = 60000,
): NodeJS.Timeout {
  console.log("Starting continuous health monitoring", {
    intervalMs,
  });

  const interval = setInterval(async () => {
    try {
      await monitorAllContainers();
    } catch (error) {
      console.error(
        "Health monitoring cycle failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, intervalMs);

  // Also run immediately on startup
  monitorAllContainers().catch((error) => {
    console.error(
      "Initial health check failed",
      error instanceof Error ? error.message : String(error),
    );
  });

  return interval;
}

/**
 * Stop health monitoring
 */
export function stopHealthMonitoring(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  console.log("Health monitoring stopped");
}
