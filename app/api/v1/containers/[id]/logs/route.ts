import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getContainer } from "@/lib/services";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  type OutputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]/logs
 * Get container logs from AWS CloudWatch
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKey(request);

    // Verify container belongs to user's organization
    const container = await getContainer(id, user.organization_id);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Check if container has been deployed to ECS
    if (!container.ecs_service_arn) {
      return NextResponse.json(
        {
          success: false,
          error: "Container has not been deployed to ECS yet",
        },
        { status: 400 },
      );
    }

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "100");
    const since = searchParams.get("since"); // ISO timestamp

    // Get logs from CloudWatch
    const logs = await getCloudWatchLogs(container.name, {
      limit,
      since: since ? new Date(since) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        container: {
          id: container.id,
          name: container.name,
          status: container.status,
          ecs_service_arn: container.ecs_service_arn,
        },
        logs,
        total: logs.length,
        filters: {
          limit,
          since,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching container logs:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch container logs",
      },
      { status: 500 },
    );
  }
}

/**
 * Get logs from CloudWatch for a container
 */
async function getCloudWatchLogs(
  containerName: string,
  options: {
    limit?: number;
    since?: Date;
  }
): Promise<
  Array<{
    timestamp: string;
    message: string;
  }>
> {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not configured");
  }

  const client = new CloudWatchLogsClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const logGroupName = `/ecs/elizaos-${containerName}`;

  try {
    const command = new GetLogEventsCommand({
      logGroupName,
      logStreamName: "ecs", // This would need to be more dynamic in production
      limit: options.limit || 100,
      startTime: options.since?.getTime(),
      startFromHead: false, // Get most recent logs first
    });

    const response = await client.send(command);
    const events = response.events || [];

    return events.map((event: OutputLogEvent) => ({
      timestamp: new Date(event.timestamp || 0).toISOString(),
      message: event.message || "",
    }));
  } catch (error) {
    console.error("Error fetching CloudWatch logs:", error);
    // Return empty array if logs not available yet
    return [];
  }
}
