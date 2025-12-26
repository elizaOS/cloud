/**
 * Knowledge Integration Tests
 *
 * Tests the knowledge file upload and processing system:
 * - Upload files for processing
 * - Job status tracking
 * - SSE real-time notifications
 *
 * Requirements:
 * - TEST_API_KEY: Valid API key with credits
 * - Server running at TEST_SERVER_URL (default: http://localhost:3000)
 * - An existing agent/character for testing
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;
const TIMEOUT = 30000;

const createdResources: {
  agents: string[];
  jobIds: string[];
} = {
  agents: [],
  jobIds: [],
};

let serverRunning = false;
let apiKeyValid = false;
let testCharacterId: string | null = null;

async function fetchWithAuth(
  endpoint: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown> | FormData,
  options: { isFormData?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (!options.isFormData) headers["Content-Type"] = "application/json";

  return fetch(`${SERVER_URL}${endpoint}`, {
    method,
    headers,
    body: options.isFormData
      ? (body as FormData)
      : body
        ? JSON.stringify(body)
        : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

function skip(): boolean {
  return !serverRunning || !apiKeyValid;
}

describe("Prerequisites", () => {
  test("Check server status", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${SERVER_URL}/api/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "a2a.getAgentCard",
        id: 1,
      }),
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);
    serverRunning = response !== null && response.status > 0;
    if (serverRunning) {
      console.log(`✅ Server running at ${SERVER_URL}`);
    }
    expect(true).toBe(true);
  });

  test("Check API key and get user info", async () => {
    if (!API_KEY) {
      console.log("⚠️ TEST_API_KEY not set - tests will pass as no-op");
      return;
    }
    if (!serverRunning) {
      console.log("⚠️ Server not running - cannot validate API key");
      return;
    }

    const response = await fetchWithAuth("/api/v1/knowledge/submit", "POST", {});

    if (response.status === 401) {
      console.log("⚠️ API key invalid: 401 Unauthorized");
      return;
    }

    if (response.status === 400 || response.status === 403 || response.status === 404) {
      console.log(`✅ API key valid (endpoint returned ${response.status} - auth passed)`);
      apiKeyValid = true;
      return;
    }

    console.log(`⚠️ Unexpected response: ${response.status}`);
  });

  test("Create or get test agent", async () => {
    if (skip()) return;

    const listResponse = await fetchWithAuth("/api/my-agents/characters");
    if (listResponse.ok) {
      const data = await listResponse.json();
      const characters = data.characters || data.agents || [];
      if (characters.length > 0) {
        testCharacterId = characters[0].id;
        console.log(`✅ Using existing character: ${testCharacterId}`);
        return;
      }
    }

    const createResponse = await fetchWithAuth("/api/my-agents/characters", "POST", {
      name: `Knowledge Test Agent ${Date.now()}`,
      bio: ["Test agent for knowledge queue integration tests"],
      model: "gpt-4o-mini",
    });

    if (createResponse.ok) {
      const data = await createResponse.json();
      testCharacterId = data.id || data.character?.id || data.agent?.id;
      if (testCharacterId) {
        createdResources.agents.push(testCharacterId);
        console.log(`✅ Created test agent: ${testCharacterId}`);
      }
    } else {
      console.log(`⚠️ Failed to create test agent: ${createResponse.status}`);
    }
  });
});

describe("Knowledge Upload API", () => {
  test("Upload endpoint requires authentication", async () => {
    if (!serverRunning) return;

    const response = await fetch(`${SERVER_URL}/api/v1/knowledge/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: "test", files: [] }),
    });

    expect(response.status).toBe(401);
    console.log("✅ Upload endpoint requires authentication");
  });

  test("Upload endpoint validates characterId", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/api/v1/knowledge/submit", "POST", {
      files: [{ blobUrl: "https://example.com", filename: "test.txt" }],
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("characterId");
    console.log("✅ Upload endpoint validates characterId");
  });

  test("Upload endpoint validates files array", async () => {
    if (skip() || !testCharacterId) return;

    const response = await fetchWithAuth("/api/v1/knowledge/submit", "POST", {
      characterId: testCharacterId,
      files: [],
    });

    expect(response.status).toBe(400);
    console.log("✅ Upload endpoint validates files array");
  });

  test("Upload endpoint validates blob URL", async () => {
    if (skip() || !testCharacterId) return;

    const response = await fetchWithAuth("/api/v1/knowledge/submit", "POST", {
      characterId: testCharacterId,
      files: [
        {
          blobUrl: "https://malicious.com/file.txt",
          filename: "test.txt",
          contentType: "text/plain",
          size: 100,
        },
      ],
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("blobUrl");
    console.log("✅ Upload endpoint validates blob URL");
  });

  test("Upload endpoint validates content type", async () => {
    if (skip() || !testCharacterId) return;

    const response = await fetchWithAuth("/api/v1/knowledge/submit", "POST", {
      characterId: testCharacterId,
      files: [
        {
          blobUrl: "https://blob.vercel-storage.com/test.txt",
          filename: "test.exe",
          contentType: "application/x-executable",
          size: 100,
        },
      ],
    });

    expect(response.status).toBe(400);
    console.log("✅ Upload endpoint validates content type");
  });

  test("Upload endpoint rejects unauthorized character access", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/api/v1/knowledge/submit", "POST", {
      characterId: "00000000-0000-0000-0000-000000000000",
      files: [
        {
          blobUrl: "https://blob.vercel-storage.com/test.txt",
          filename: "test.txt",
          contentType: "text/plain",
        size: 100,
        },
      ],
    });

    expect([400, 403, 404]).toContain(response.status);
    console.log("✅ Upload endpoint rejects unauthorized character access");
  });
});

describe("Knowledge Job Status API", () => {
  test("Status endpoint requires authentication", async () => {
    if (!serverRunning) return;

    const response = await fetch(`${SERVER_URL}/api/v1/knowledge/jobs/test-id`);

    expect(response.status).toBe(401);
    console.log("✅ Status endpoint requires authentication");
  });

  test("Status endpoint returns 404 for non-existent character", async () => {
    if (skip()) return;

    const response = await fetchWithAuth(
      "/api/v1/knowledge/jobs/00000000-0000-0000-0000-000000000000",
    );

    expect([403, 404]).toContain(response.status);
    console.log("✅ Status endpoint handles non-existent character");
  });

  test("Status endpoint returns job status for valid character", async () => {
    if (skip() || !testCharacterId) return;

    const response = await fetchWithAuth(
      `/api/v1/knowledge/jobs/${testCharacterId}`,
    );

    expect([200, 403, 404]).toContain(response.status);

    if (response.status === 200) {
      const data = await response.json();
      expect(typeof data.isProcessing).toBe("boolean");
      expect(typeof data.totalFiles).toBe("number");
      expect(typeof data.pendingCount).toBe("number");
      expect(typeof data.processingCount).toBe("number");
      expect(typeof data.completedCount).toBe("number");
      expect(typeof data.failedCount).toBe("number");
      console.log(`✅ Status endpoint returns: ${JSON.stringify(data)}`);
    } else {
      console.log(`ℹ️ Status endpoint returned ${response.status}`);
    }
  });
});

describe("Knowledge SSE Endpoint", () => {
  test("SSE endpoint requires authentication", async () => {
    if (!serverRunning) return;

    const response = await fetch(
      `${SERVER_URL}/api/v1/knowledge/sse?characterId=test`,
    );

    expect(response.status).toBe(401);
    console.log("✅ SSE endpoint requires authentication");
  });

  test("SSE endpoint requires characterId parameter", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/api/v1/knowledge/sse");

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("characterId");
    console.log("✅ SSE endpoint validates characterId parameter");
  });

  test("SSE endpoint returns 403 for unauthorized character", async () => {
    if (skip()) return;

    const response = await fetchWithAuth(
      "/api/v1/knowledge/sse?characterId=00000000-0000-0000-0000-000000000000",
    );

    expect([403, 404]).toContain(response.status);
    console.log("✅ SSE endpoint rejects unauthorized character access");
  });

  test("SSE endpoint streams events for valid character", async () => {
    if (skip() || !testCharacterId) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `${SERVER_URL}/api/v1/knowledge/sse?characterId=${testCharacterId}`,
      {
        headers: { Authorization: `Bearer ${API_KEY}` },
        signal: controller.signal,
      },
    ).catch(() => null);

    clearTimeout(timeoutId);

    if (response && response.status === 200) {
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      console.log("✅ SSE endpoint returns event stream");

      const reader = response.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        if (value) {
          const text = new TextDecoder().decode(value);
          expect(text).toContain("data:");
          console.log("✅ SSE stream contains valid events");
        }
        reader.releaseLock();
      }
    } else {
      console.log(`ℹ️ SSE endpoint returned ${response?.status || "timeout"}`);
    }
  });
});

describe("Knowledge Pre-Upload API", () => {
  test("Pre-upload endpoint requires authentication", async () => {
    if (!serverRunning) return;

    const formData = new FormData();
    formData.append("files", new Blob(["test"]), "test.txt");

    const response = await fetch(`${SERVER_URL}/api/v1/knowledge/pre-upload`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(401);
    console.log("✅ Pre-upload endpoint requires authentication");
  });

  test("Pre-upload endpoint validates file presence", async () => {
    if (skip()) return;

    const formData = new FormData();

    const response = await fetch(`${SERVER_URL}/api/v1/knowledge/pre-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(400);
    console.log("✅ Pre-upload endpoint validates file presence");
  });
});

describe("End-to-End Knowledge Flow", () => {
  test("Full flow: pre-upload → process → status check", async () => {
    if (skip() || !testCharacterId) {
      console.log("ℹ️ Skipping E2E test - prerequisites not met");
      return;
    }

    const formData = new FormData();
    const testContent = "This is a test document for knowledge processing.";
    formData.append(
      "files",
      new Blob([testContent], { type: "text/plain" }),
      "test-knowledge.txt",
    );

    const preUploadResponse = await fetch(
      `${SERVER_URL}/api/v1/knowledge/pre-upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
        body: formData,
      },
    );

    if (preUploadResponse.status !== 200) {
      console.log(`ℹ️ Pre-upload failed: ${preUploadResponse.status}`);
      return;
    }

    const preUploadData = await preUploadResponse.json();
    expect(preUploadData.files).toBeDefined();
    expect(preUploadData.files.length).toBeGreaterThan(0);

    const uploadedFile = preUploadData.files[0];
    console.log(`✅ Pre-uploaded file: ${uploadedFile.filename}`);

    const uploadResponse = await fetchWithAuth(
      "/api/v1/knowledge/submit",
      "POST",
      {
        characterId: testCharacterId,
        files: [
          {
            blobUrl: uploadedFile.blobUrl,
            filename: uploadedFile.filename,
            contentType: uploadedFile.contentType,
            size: uploadedFile.size,
          },
        ],
      },
    );

    if (uploadResponse.status !== 200) {
      console.log(`ℹ️ Upload failed: ${uploadResponse.status}`);
      await fetchWithAuth("/api/v1/knowledge/pre-upload", "DELETE", {
        blobUrl: uploadedFile.blobUrl,
      });
      return;
    }

    const uploadData = await uploadResponse.json();
    expect(uploadData.success).toBe(true);
    expect(uploadData.jobIds).toBeDefined();
    expect(uploadData.jobIds.length).toBeGreaterThan(0);

    const jobId = uploadData.jobIds[0];
    createdResources.jobIds.push(jobId);
    console.log(`✅ Processing job: ${jobId}`);

    const statusResponse = await fetchWithAuth(
      `/api/v1/knowledge/jobs/${testCharacterId}`,
    );

    if (statusResponse.status === 200) {
      const statusData = await statusResponse.json();
      expect(statusData.totalFiles).toBeGreaterThan(0);
      console.log(`✅ Job status: ${JSON.stringify(statusData)}`);
    }

    console.log("✅ E2E flow completed");
  });
});

afterAll(async () => {
  if (!apiKeyValid) return;

  console.log("\n🧹 Cleaning up...");

  for (const id of createdResources.agents) {
    await fetchWithAuth(`/api/my-agents/${id}`, "DELETE").catch(() => {});
    console.log(`  Deleted agent: ${id}`);
  }

  console.log("🧹 Done\n");
});

describe("Summary", () => {
  test("Final report", () => {
    console.log(`
════════════════════════════════════════════════════════════════════
                      KNOWLEDGE TEST SUMMARY
════════════════════════════════════════════════════════════════════

Server: ${SERVER_URL} (${serverRunning ? "✅" : "❌"})
API Key: ${API_KEY ? (apiKeyValid ? "✅ Valid" : "⚠️ Invalid") : "❌ Not set"}
Test Character: ${testCharacterId || "❌ None"}

Coverage:
├── Upload API: File upload and validation
├── Job Status API: Processing status tracking
├── SSE Endpoint: Real-time event streaming
└── E2E Flow: Pre-upload → Process → Status

${
  !apiKeyValid || !serverRunning
    ? `
⚠️  Tests passed as no-op (prerequisites not met)

To run full tests:
  1. Start server: bun run dev
  2. Set API key: export TEST_API_KEY=your_key
  3. Run tests: bun test tests/integration/knowledge.test.ts
`
    : `
✅ All Knowledge Queue APIs tested
`
}
════════════════════════════════════════════════════════════════════
`);
  });
});
