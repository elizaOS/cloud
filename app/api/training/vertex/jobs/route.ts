import type { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getTuningJobStatus, listTuningJobs } from "@/lib/services/vertex-tuning";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKeyWithOrg(request);
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || process.env.GOOGLE_CLOUD_PROJECT;
    const region = searchParams.get("region") || "us-central1";
    const jobName = searchParams.get("name");

    if (!projectId) {
      return Response.json(
        {
          error:
            "projectId is required. Set it in the query string or provide GOOGLE_CLOUD_PROJECT.",
        },
        { status: 400 },
      );
    }

    if (jobName) {
      const job = await getTuningJobStatus(jobName);
      return Response.json({ job });
    }

    const jobs = await listTuningJobs(projectId, region);
    return Response.json({ jobs });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to query Vertex jobs",
      },
      { status: 500 },
    );
  }
}
