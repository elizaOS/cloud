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
 * PRODUCTION FIX: Dynamically discovers log streams instead of hardcoding
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
  const region = process.env.AWS_REGION || "us-east-1";
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

  const logGroupName = `/ecs/elizaos-user-${containerName}`;

  try {
    // First, discover the latest log streams
    const { DescribeLogStreamsCommand } = await import(
      "@aws-sdk/client-cloudwatch-logs"
    );
    
    const streamsResponse = await client.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: "LastEventTime",
        descending: true,
        limit: 5, // Get up to 5 most recent streams
      })
    );

    const logStreams = streamsResponse.logStreams || [];
    
    if (logStreams.length === 0) {
      console.warn(`No log streams found for ${logGroupName}`);
      return [];
    }

    // Aggregate logs from all recent streams (in case of task restarts)
    const allLogs: Array<{ timestamp: string; message: string }> = [];

    for (const stream of logStreams) {
      if (!stream.logStreamName) continue;

      try {
        const command = new GetLogEventsCommand({
          logGroupName,
          logStreamName: stream.logStreamName,
          limit: Math.ceil((options.limit || 100) / logStreams.length),
          startTime: options.since?.getTime(),
          startFromHead: false, // Get most recent logs first
        });

        const response = await client.send(command);
        const events = response.events || [];

        allLogs.push(
          ...events.map((event: OutputLogEvent) => ({
            timestamp: new Date(event.timestamp || 0).toISOString(),
            message: event.message || "",
          }))
        );
      } catch (streamError) {
        console.warn(
          `Failed to fetch logs from stream ${stream.logStreamName}:`,
          streamError
        );
        // Continue with other streams
      }
    }

    // Sort by timestamp descending and limit
    return allLogs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, options.limit || 100);
      
  } catch (error) {
    console.error("Error fetching CloudWatch logs:", error);
    
    // Check if log group doesn't exist
    if (
      error instanceof Error &&
      error.name === "ResourceNotFoundException"
    ) {
      console.warn(`Log group ${logGroupName} not found - container may not be deployed yet`);
    }
    
    return [];
  }
}
