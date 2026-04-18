import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";
import { requireAdmin, requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { llmTrajectoryService } from "@/lib/services/llm-trajectory";
import { vertexModelRegistryService } from "@/lib/services/vertex-model-registry";
import { normalizeVertexBaseModel, orchestrateVertexTuning } from "@/lib/services/vertex-tuning";

export const dynamic = "force-dynamic";

function defaultPurposeForSlot(slot: string): string | undefined {
  switch (slot) {
    case "action_planner":
    case "planner":
      return "planner";
    case "response":
      return "response";
    case "should_respond":
    case "response_handler":
    default:
      return "should_respond";
  }
}

export async function POST(request: NextRequest) {
  const tempDirs: string[] = [];

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const scope =
      typeof body.scope === "string" &&
      (body.scope === "global" || body.scope === "organization" || body.scope === "user")
        ? body.scope
        : "organization";

    if (scope === "global") {
      const admin = await requireAdmin(request);
      if (admin.role !== "super_admin") {
        return Response.json(
          {
            error: "Global tuned-model jobs require super-admin access.",
          },
          { status: 403 },
        );
      }
    }

    const projectId =
      (typeof body.projectId === "string" && body.projectId) || process.env.GOOGLE_CLOUD_PROJECT;
    const gcsBucket =
      (typeof body.gcsBucket === "string" && body.gcsBucket) ||
      process.env.GOOGLE_CLOUD_TUNING_BUCKET;

    if (!projectId || !gcsBucket) {
      return Response.json(
        {
          error:
            "projectId and gcsBucket are required. Set them in the request or provide GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_TUNING_BUCKET.",
        },
        { status: 400 },
      );
    }

    const slot = (typeof body.slot === "string" && body.slot) || "should_respond";
    const displayName =
      (typeof body.displayName === "string" && body.displayName) ||
      `eliza-cloud-${slot.replace(/_/g, "-")}-${Date.now()}`;
    let trainingDataPath =
      typeof body.trainingDataPath === "string" ? body.trainingDataPath : undefined;
    const validationDataPath =
      typeof body.validationDataPath === "string" ? body.validationDataPath : undefined;

    let generatedFromTrajectories = false;
    if (!trainingDataPath) {
      const jsonl = await llmTrajectoryService.exportAsTrainingJSONL(user.organization_id, {
        purpose: typeof body.purpose === "string" ? body.purpose : defaultPurposeForSlot(slot),
        model: typeof body.modelFilter === "string" ? body.modelFilter : undefined,
        limit: typeof body.limit === "number" ? body.limit : 5000,
      });

      if (!jsonl.trim()) {
        return Response.json(
          {
            error:
              "No matching Cloud trajectories were found. Provide trainingDataPath or record more LLM calls first.",
          },
          { status: 400 },
        );
      }

      const tempDir = await mkdtemp(path.join(os.tmpdir(), "eliza-cloud-vertex-"));
      tempDirs.push(tempDir);
      trainingDataPath = path.join(tempDir, "training.jsonl");
      await writeFile(trainingDataPath, `${jsonl.trim()}\n`);
      generatedFromTrajectories = true;
    }

    const result = await orchestrateVertexTuning({
      projectId,
      region: (typeof body.region === "string" && body.region) || "us-central1",
      gcsBucket,
      baseModel: normalizeVertexBaseModel(
        typeof body.baseModel === "string" ? body.baseModel : undefined,
        slot as any,
      ),
      trainingDataPath,
      validationDataPath,
      epochs: typeof body.epochs === "number" ? body.epochs : 3,
      displayName,
      slot: slot as any,
      scope: scope as any,
      ownerId:
        scope === "user" ? user.id : scope === "organization" ? user.organization_id : undefined,
      accessToken: typeof body.accessToken === "string" ? body.accessToken : undefined,
    });

    const persisted = await vertexModelRegistryService.recordSubmittedJob({
      vertexJobName: result.job.name,
      projectId,
      region: result.region,
      displayName,
      baseModel: normalizeVertexBaseModel(
        typeof body.baseModel === "string" ? body.baseModel : undefined,
        slot as any,
      ),
      slot: slot as any,
      scope,
      organizationId: scope === "global" ? undefined : user.organization_id,
      userId: scope === "user" ? user.id : undefined,
      createdByUserId: user.id,
      trainingDataPath,
      validationDataPath,
      trainingDataUri: result.trainingDatasetUri,
      validationDataUri: result.validationDatasetUri,
      recommendedModelId: result.recommendedModelId,
      remoteJob: result.job,
      metadata: {
        generatedFromTrajectories,
      },
    });

    return Response.json(
      {
        ...result,
        organizationId: user.organization_id,
        generatedFromTrajectories,
        jobRecord: persisted.job,
        tunedModelRecord: persisted.tunedModel,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to submit Vertex tuning job",
      },
      { status: 500 },
    );
  } finally {
    await Promise.all(tempDirs.map((tempDir) => rm(tempDir, { recursive: true, force: true })));
  }
}
