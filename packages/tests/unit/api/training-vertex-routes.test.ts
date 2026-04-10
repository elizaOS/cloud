import { beforeEach, describe, expect, mock, test } from "bun:test";

import { jsonRequest } from "./route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockRequireAuth = mock();
const mockRequireAuthOrApiKey = mock();
const mockRequireAdmin = mock();
const mockExportAsTrainingJSONL = mock();
const mockRecordSubmittedJob = mock();
const mockSyncJobStatus = mock();
const mockListVisibleJobs = mock();
const mockListVisibleTunedModels = mock();
const mockListVisibleAssignments = mock();
const mockResolveModelPreferences = mock();
const mockActivateAssignment = mock();
const mockDeactivateAssignment = mock();
const mockOrchestrateVertexTuning = mock();
const mockNormalizeVertexBaseModel = mock();
const mockGetTuningJobStatus = mock();
const mockListTuningJobs = mock();

mock.module("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  requireAuthOrApiKey: mockRequireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
  requireAdmin: mockRequireAdmin,
}));

mock.module("@/lib/services/llm-trajectory", () => ({
  llmTrajectoryService: {
    exportAsTrainingJSONL: mockExportAsTrainingJSONL,
  },
}));

mock.module("@/lib/services/vertex-model-registry", () => ({
  vertexModelRegistryService: {
    recordSubmittedJob: mockRecordSubmittedJob,
    syncJobStatus: mockSyncJobStatus,
    listVisibleJobs: mockListVisibleJobs,
    listVisibleTunedModels: mockListVisibleTunedModels,
    listVisibleAssignments: mockListVisibleAssignments,
    resolveModelPreferences: mockResolveModelPreferences,
    activateAssignment: mockActivateAssignment,
    deactivateAssignment: mockDeactivateAssignment,
  },
}));

mock.module("@/lib/services/vertex-tuning", () => ({
  orchestrateVertexTuning: mockOrchestrateVertexTuning,
  normalizeVertexBaseModel: mockNormalizeVertexBaseModel,
  getTuningJobStatus: mockGetTuningJobStatus,
  listTuningJobs: mockListTuningJobs,
}));

beforeEach(() => {
  mockRequireAuthOrApiKeyWithOrg.mockReset();
  mockRequireAuth.mockReset();
  mockRequireAuthOrApiKey.mockReset();
  mockRequireAdmin.mockReset();
  mockExportAsTrainingJSONL.mockReset();
  mockRecordSubmittedJob.mockReset();
  mockSyncJobStatus.mockReset();
  mockListVisibleJobs.mockReset();
  mockListVisibleTunedModels.mockReset();
  mockListVisibleAssignments.mockReset();
  mockResolveModelPreferences.mockReset();
  mockActivateAssignment.mockReset();
  mockDeactivateAssignment.mockReset();
  mockOrchestrateVertexTuning.mockReset();
  mockNormalizeVertexBaseModel.mockReset();
  mockGetTuningJobStatus.mockReset();
  mockListTuningJobs.mockReset();

  mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
    user: {
      id: "00000000-0000-0000-0000-000000000222",
      organization_id: "00000000-0000-0000-0000-000000000111",
    },
  });
  mockRequireAuth.mockResolvedValue({
    id: "00000000-0000-0000-0000-000000000222",
    organization_id: "00000000-0000-0000-0000-000000000111",
  });
  mockRequireAuthOrApiKey.mockResolvedValue({
    user: {
      id: "00000000-0000-0000-0000-000000000222",
      organization_id: "00000000-0000-0000-0000-000000000111",
    },
  });
  mockRequireAdmin.mockResolvedValue({
    role: "super_admin",
    user: {
      id: "00000000-0000-0000-0000-000000000222",
    },
  });
  mockExportAsTrainingJSONL.mockResolvedValue('{"messages":[{"role":"user","content":"hi"}]}');
  mockNormalizeVertexBaseModel.mockReturnValue("gemini-2.5-flash-lite");
  mockOrchestrateVertexTuning.mockResolvedValue({
    job: {
      name: "projects/demo/locations/us-central1/tuningJobs/job-1",
      state: "JOB_STATE_PENDING",
      tunedModelDisplayName: "demo-handler",
      createTime: "2026-04-08T12:00:00.000Z",
      updateTime: "2026-04-08T12:00:00.000Z",
    },
    slot: "should_respond",
    scope: "organization",
    recommendedModelId: "projects/demo/locations/us-central1/endpoints/demo-handler",
    modelPreferencePatch: {
      scope: "organization",
      slot: "should_respond",
      modelPreferences: {
        shouldRespondModel: "projects/demo/locations/us-central1/endpoints/demo-handler",
      },
    },
    trainingDatasetUri: "gs://bucket/data/training.jsonl",
    validationDatasetUri: undefined,
    region: "us-central1",
    sourceModel: "publishers/google/models/gemini-2.5-flash-lite-preview-06-17",
  });
  mockRecordSubmittedJob.mockResolvedValue({
    job: {
      id: "local-job-1",
      vertex_job_name: "projects/demo/locations/us-central1/tuningJobs/job-1",
    },
    tunedModel: undefined,
  });
  mockSyncJobStatus.mockResolvedValue({
    job: {
      id: "local-job-1",
      vertex_job_name: "projects/demo/locations/us-central1/tuningJobs/job-1",
      last_remote_payload: { state: "JOB_STATE_RUNNING" },
    },
    tunedModel: undefined,
  });
  mockListVisibleJobs.mockResolvedValue([{ id: "local-job-1" }]);
  mockListVisibleTunedModels.mockResolvedValue([{ id: "model-1", activeAssignments: [] }]);
  mockListVisibleAssignments.mockResolvedValue([
    {
      assignment: { id: "assignment-1" },
      tunedModel: { id: "model-1" },
    },
  ]);
  mockResolveModelPreferences.mockResolvedValue({
    modelPreferences: {
      responseHandlerModel: "projects/demo/locations/us-central1/endpoints/demo-handler",
    },
    assignments: [],
    sources: {},
  });
  mockActivateAssignment.mockResolvedValue({
    assignment: { id: "assignment-1", slot: "should_respond" },
    tunedModel: { id: "model-1" },
  });
  mockDeactivateAssignment.mockResolvedValue(1);
  mockGetTuningJobStatus.mockResolvedValue({
    name: "projects/demo/locations/us-central1/tuningJobs/job-1",
    state: "JOB_STATE_RUNNING",
    tunedModelDisplayName: "demo-handler",
    createTime: "2026-04-08T12:00:00.000Z",
    updateTime: "2026-04-08T12:10:00.000Z",
  });
  mockListTuningJobs.mockResolvedValue([{ name: "remote-job-1" }]);
});

describe("training vertex routes", () => {
  test("persists user-scoped tuning jobs against the authenticated user", async () => {
    const { POST } = await import("@/app/api/training/vertex/tune/route");

    const response = await POST(
      jsonRequest("http://localhost:3000/api/training/vertex/tune", "POST", {
        scope: "user",
        ownerId: "00000000-0000-0000-0000-000000000999",
        slot: "response_handler",
        projectId: "demo",
        gcsBucket: "demo-bucket",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockOrchestrateVertexTuning).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user",
        ownerId: "00000000-0000-0000-0000-000000000222",
      }),
    );
    expect(mockRecordSubmittedJob).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "user",
        organizationId: "00000000-0000-0000-0000-000000000111",
        userId: "00000000-0000-0000-0000-000000000222",
      }),
    );
  });

  test("returns synced local records when querying a tracked job", async () => {
    const { GET } = await import("@/app/api/training/vertex/jobs/route");

    const response = await GET(
      jsonRequest("http://localhost:3000/api/training/vertex/jobs?jobId=local-job-1", "GET"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockSyncJobStatus).toHaveBeenCalledWith({ jobId: "local-job-1" });
    expect(payload.jobRecord.id).toBe("local-job-1");
  });

  test("lists visible tuned models with resolved active preferences", async () => {
    const { GET } = await import("@/app/api/training/vertex/models/route");

    const response = await GET(
      jsonRequest("http://localhost:3000/api/training/vertex/models", "GET"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockListVisibleTunedModels).toHaveBeenCalledWith(
      {
        organizationId: "00000000-0000-0000-0000-000000000111",
        userId: "00000000-0000-0000-0000-000000000222",
      },
      {
        scope: undefined,
        slot: undefined,
      },
    );
    expect(payload.resolvedModelPreferences.responseHandlerModel).toContain("demo-handler");
  });

  test("requires super-admin access for global assignment activation", async () => {
    mockRequireAdmin.mockResolvedValueOnce({
      role: "viewer",
      user: {
        id: "00000000-0000-0000-0000-000000000222",
      },
    });

    const { POST } = await import("@/app/api/training/vertex/assignments/route");

    const response = await POST(
      jsonRequest("http://localhost:3000/api/training/vertex/assignments", "POST", {
        scope: "global",
        slot: "should_respond",
        tunedModelId: "model-1",
      }),
    );

    expect(response.status).toBe(403);
    expect(mockActivateAssignment).not.toHaveBeenCalled();
  });

  test("rejects global tuning jobs for non-super-admin users", async () => {
    mockRequireAdmin.mockResolvedValueOnce({
      role: "viewer",
      user: {
        id: "00000000-0000-0000-0000-000000000222",
      },
    });

    const { POST } = await import("@/app/api/training/vertex/tune/route");
    const response = await POST(
      jsonRequest("http://localhost:3000/api/training/vertex/tune", "POST", {
        scope: "global",
        slot: "should_respond",
        projectId: "demo",
        gcsBucket: "demo-bucket",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("super-admin");
    expect(mockOrchestrateVertexTuning).not.toHaveBeenCalled();
  });

  test("returns 400 when no trajectories are available for generated Cloud training data", async () => {
    mockExportAsTrainingJSONL.mockResolvedValueOnce("");

    const { POST } = await import("@/app/api/training/vertex/tune/route");
    const response = await POST(
      jsonRequest("http://localhost:3000/api/training/vertex/tune", "POST", {
        slot: "response_handler",
        projectId: "demo",
        gcsBucket: "demo-bucket",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("No matching Cloud trajectories were found");
    expect(mockOrchestrateVertexTuning).not.toHaveBeenCalled();
  });

  test("returns persisted jobs without calling Vertex when persisted=true", async () => {
    const { GET } = await import("@/app/api/training/vertex/jobs/route");

    const response = await GET(
      jsonRequest("http://localhost:3000/api/training/vertex/jobs?persisted=true", "GET"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.persistedJobs).toEqual([{ id: "local-job-1" }]);
    expect(mockListTuningJobs).not.toHaveBeenCalled();
  });

  test("returns remote status for an explicit Vertex job name", async () => {
    const { GET } = await import("@/app/api/training/vertex/jobs/route");

    const response = await GET(
      jsonRequest(
        "http://localhost:3000/api/training/vertex/jobs?name=projects/demo/locations/us-central1/tuningJobs/job-1",
        "GET",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetTuningJobStatus).toHaveBeenCalledWith(
      "projects/demo/locations/us-central1/tuningJobs/job-1",
    );
    expect(mockSyncJobStatus).toHaveBeenCalledWith({
      vertexJobName: "projects/demo/locations/us-central1/tuningJobs/job-1",
    });
    expect(payload.job.state).toBe("JOB_STATE_RUNNING");
  });

  test("lists assignments with explicit scope and inactive filter overrides", async () => {
    const { GET } = await import("@/app/api/training/vertex/assignments/route");

    const response = await GET(
      jsonRequest(
        "http://localhost:3000/api/training/vertex/assignments?scope=user&slot=should_respond&active=false",
        "GET",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockListVisibleAssignments).toHaveBeenCalledWith(
      {
        organizationId: "00000000-0000-0000-0000-000000000111",
        userId: "00000000-0000-0000-0000-000000000222",
      },
      {
        scope: "user",
        slot: "should_respond",
        activeOnly: false,
      },
    );
    expect(payload.assignments).toHaveLength(1);
  });

  test("deactivates the authenticated user's assignment for user scope", async () => {
    const { DELETE } = await import("@/app/api/training/vertex/assignments/route");

    const response = await DELETE(
      jsonRequest("http://localhost:3000/api/training/vertex/assignments", "DELETE", {
        scope: "user",
        slot: "response_handler",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeactivateAssignment).toHaveBeenCalledWith({
      scope: "user",
      slot: "response_handler",
      organizationId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
    });
    expect(payload.deactivatedCount).toBe(1);
  });
});
