import { describe, expect, it } from "vitest";
import { ElizaCloudClient } from "./index";

const liveEnabled = process.env.ELIZA_CLOUD_SDK_LIVE === "1";
const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? "https://www.elizacloud.ai";
const apiKey = process.env.ELIZAOS_CLOUD_API_KEY ?? process.env.ELIZA_CLOUD_API_KEY;
const sessionToken = process.env.ELIZA_CLOUD_SESSION_TOKEN;
const generationEnabled = process.env.ELIZA_CLOUD_SDK_LIVE_GENERATION === "1";
const destructiveEnabled = process.env.ELIZA_CLOUD_SDK_LIVE_DESTRUCTIVE === "1";

const liveDescribe = liveEnabled ? describe : describe.skip;
const authedDescribe = liveEnabled && !!apiKey ? describe : describe.skip;
const sessionDescribe = liveEnabled && !!sessionToken ? describe : describe.skip;
const generationDescribe = liveEnabled && !!apiKey && generationEnabled ? describe : describe.skip;
const destructiveDescribe =
  liveEnabled && !!apiKey && destructiveEnabled ? describe : describe.skip;

function clientWithApiKey() {
  return new ElizaCloudClient({ baseUrl, apiKey });
}

function clientWithSession() {
  return new ElizaCloudClient({ baseUrl, bearerToken: sessionToken });
}

liveDescribe("ElizaCloudClient real API e2e: public/auth bootstrap", () => {
  it("fetches the live OpenAPI document", async () => {
    const client = new ElizaCloudClient({ baseUrl });
    const spec = await client.getOpenApiSpec();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it("starts a CLI login session and polls it as pending", async () => {
    const client = new ElizaCloudClient({ baseUrl });
    const started = await client.startCliLogin();
    expect(started.sessionId).toBeTruthy();
    expect(started.browserUrl).toContain("/auth/cli-login?session=");

    const polled = await client.pollCliLogin(started.sessionId);
    expect(polled.status).toBe("pending");
  });

  it("lists public models", async () => {
    const client = new ElizaCloudClient({ baseUrl });
    const models = await client.listModels();
    expect(Array.isArray(models.data)).toBe(true);
  });

  it("calls an arbitrary endpoint through callEndpoint", async () => {
    const client = new ElizaCloudClient({ baseUrl });
    const models = await client.callEndpoint("GET", "/api/v1/models", { skipAuth: true });
    expect(models).toBeTruthy();
  });
});

authedDescribe("ElizaCloudClient real API e2e: API-key read paths", () => {
  it("gets the authenticated user profile", async () => {
    await expect(clientWithApiKey().getUser()).resolves.toMatchObject({ success: true });
  });

  it("gets credit balance and summary", async () => {
    const client = clientWithApiKey();
    await expect(client.getCreditsBalance({ fresh: true })).resolves.toHaveProperty("balance");
    await expect(client.getCreditsSummary()).resolves.toHaveProperty("success", true);
  });

  it("lists containers and quota", async () => {
    const client = clientWithApiKey();
    await expect(client.listContainers()).resolves.toHaveProperty("success", true);
    await expect(client.getContainerQuota()).resolves.toBeTruthy();
  });

  it("lists Milady agents", async () => {
    await expect(clientWithApiKey().listMiladyAgents()).resolves.toHaveProperty("success", true);
  });
});

sessionDescribe("ElizaCloudClient real API e2e: session-only API key management", () => {
  it("lists API keys with a browser session bearer token", async () => {
    await expect(clientWithSession().listApiKeys()).resolves.toHaveProperty("keys");
  });

  it("creates, regenerates, updates, and deletes an API key", async () => {
    const client = clientWithSession();
    const created = await client.createApiKey({
      name: `sdk-e2e-${Date.now()}`,
      description: "Created by @elizaos/cloud-sdk live e2e",
    });
    expect(created.plainKey).toMatch(/^eliza_/);

    await expect(client.regenerateApiKey(created.apiKey.id)).resolves.toHaveProperty("plainKey");
    await expect(client.updateApiKey(created.apiKey.id, { name: `${created.apiKey.name}-renamed` })).resolves.toBeTruthy();
    await expect(client.deleteApiKey(created.apiKey.id)).resolves.toBeTruthy();
  });
});

generationDescribe("ElizaCloudClient real API e2e: paid generation paths", () => {
  it("creates a responses API completion", async () => {
    const response = await clientWithApiKey().createResponse({
      model: process.env.ELIZA_CLOUD_SDK_TEXT_MODEL ?? "openai/gpt-5.4-mini",
      input: "Return the word ok.",
      max_output_tokens: 16,
    });
    expect(response).toBeTruthy();
  });

  it("creates a chat completion", async () => {
    const response = await clientWithApiKey().createChatCompletion({
      model: process.env.ELIZA_CLOUD_SDK_TEXT_MODEL ?? "openai/gpt-5.4-mini",
      messages: [{ role: "user", content: "Return the word ok." }],
      max_tokens: 16,
    });
    expect(response).toBeTruthy();
  });

  it("creates embeddings", async () => {
    const response = await clientWithApiKey().createEmbeddings({
      model: process.env.ELIZA_CLOUD_SDK_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: "Eliza Cloud SDK live e2e",
    });
    expect(response.data[0]?.embedding.length).toBeGreaterThan(0);
  });

  it("generates an image", async () => {
    const response = await clientWithApiKey().generateImage({
      prompt: "A simple orange circle on a white background",
      numImages: 1,
    });
    expect(response.images.length).toBeGreaterThan(0);
  });
});

destructiveDescribe("ElizaCloudClient real API e2e: destructive resource paths", () => {
  it("creates and deletes a Milady agent when credits are available", async () => {
    const client = clientWithApiKey();
    const created = await client.createMiladyAgent({
      agentName: `sdk-e2e-${Date.now()}`,
      agentConfig: {},
    });
    expect(created.data.id).toBeTruthy();

    await expect(client.getMiladyAgent(created.data.id)).resolves.toHaveProperty("success", true);
    await expect(client.deleteMiladyAgent(created.data.id)).resolves.toBeTruthy();
  });
});
