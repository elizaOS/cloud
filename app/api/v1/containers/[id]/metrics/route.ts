/**
 * Container Metrics API
 * Fetches metrics for DWS containers using DWS observability service
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getContainer } from "@/lib/services/containers";
import { DWSObservability } from "@/lib/services/dws/observability";

export const dynamic = "force-dynamic";

interface ContainerMetrics {
  cpu_utilization: number;
  memory_utilization: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  task_count: number;
  healthy_task_count: number;
  timestamp: string;
}

/**
 * GET /api/v1/containers/[id]/metrics
 * Retrieves metrics for a container using DWS observability service.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify container belongs to user's organization
    const container = await getContainer(id, user.organization_id!);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Check if container has been deployed
    const containerId = container.dws_container_id || container.id;
    if (!container.dws_container_id && !container.ecs_service_arn) {
      return NextResponse.json(
        {
          success: false,
          error: "Container has not been deployed yet",
        },
        { status: 400 },
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const periodMinutes = parseInt(searchParams.get("period") || "60");

    // Fetch metrics using DWS observability
    const metrics = await getContainerMetrics(
      containerId,
      container.desired_count || 1,
      periodMinutes,
    );

    return NextResponse.json({
      success: true,
      data: {
        container: {
          id: container.id,
          name: container.name,
          status: container.status,
        },
        metrics,
        period_minutes: periodMinutes,
      },
    });
  } catch (error) {
    logger.error("Error fetching container metrics:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch container metrics",
      },
      { status: 500 },
    );
  }
}

/**
 * Get metrics for a container using DWS observability
 */
async function getContainerMetrics(
  containerId: string,
  desiredCount: number,
  periodMinutes: number,
): Promise<ContainerMetrics> {
  const observability = new DWSObservability();

  // Get current container metrics
  const currentMetrics = await observability.getContainerMetrics(containerId);

  if (currentMetrics) {
    return {
      cpu_utilization: currentMetrics.cpu.usagePercent,
      memory_utilization: currentMetrics.memory.usagePercent,
      network_rx_bytes: currentMetrics.network.rxBytes,
      network_tx_bytes: currentMetrics.network.txBytes,
      task_count: desiredCount,
      healthy_task_count: desiredCount,
      timestamp: currentMetrics.timestamp.toISOString(),
    };
  }

  // If no current metrics, try to get historical data
  const now = new Date();
  const startTime = new Date(now.getTime() - periodMinutes * 60 * 1000);

  const [cpuData, memoryData] = await Promise.allSettled([
    observability.getMetricData({
      containerId,
      metricName: "cpu_utilization",
      startTime,
      endTime: now,
      period: 300,
      stat: "Average",
    }),
    observability.getMetricData({
      containerId,
      metricName: "memory_utilization",
      startTime,
      endTime: now,
      period: 300,
      stat: "Average",
    }),
  ]);

  const cpuPoints = cpuData.status === "fulfilled" ? cpuData.value : [];
  const memoryPoints = memoryData.status === "fulfilled" ? memoryData.value : [];

  const latestCpu = cpuPoints.length > 0 ? cpuPoints[cpuPoints.length - 1].value : 0;
  const latestMemory = memoryPoints.length > 0 ? memoryPoints[memoryPoints.length - 1].value : 0;

  return {
    cpu_utilization: latestCpu,
    memory_utilization: latestMemory,
    network_rx_bytes: 0,
    network_tx_bytes: 0,
    task_count: desiredCount,
    healthy_task_count: desiredCount,
    timestamp: now.toISOString(),
  };
}
