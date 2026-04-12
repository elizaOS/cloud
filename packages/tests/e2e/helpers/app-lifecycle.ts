/**
 * App Lifecycle Test Helpers
 *
 * Utilities for creating, configuring, and cleaning up apps in E2E tests.
 * Designed to run against live Eliza Cloud using API key auth.
 */

import * as api from "./api-client";

/** Unique suffix for test isolation */
function testSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a test app payload */
export function testAppPayload(overrides?: Record<string, unknown>) {
  const suffix = testSuffix();
  return {
    name: `E2E Test App ${suffix}`,
    description: "Automated E2E test app — safe to delete",
    app_url: `https://test-${suffix}.example.com`,
    skipGitHubRepo: true,
    ...overrides,
  };
}

/** Create an app and return the parsed response body */
export async function createTestApp(
  overrides?: Record<string, unknown>,
): Promise<{ response: Response; body: any }> {
  const payload = testAppPayload(overrides);
  const response = await api.post("/api/v1/apps", payload, {
    authenticated: true,
  });
  const body = await response.json();
  return { response, body };
}

/** Delete an app, swallowing 404s (already deleted) */
export async function deleteTestApp(appId: string): Promise<void> {
  await api.del(`/api/v1/apps/${appId}?deleteGitHubRepo=false&deleteVercelProject=false`, {
    authenticated: true,
  });
}

/** Enable monetization on an app */
export async function enableMonetization(
  appId: string,
  settings?: {
    inferenceMarkupPercentage?: number;
    purchaseSharePercentage?: number;
  },
): Promise<{ response: Response; body: any }> {
  const response = await api.put(
    `/api/v1/apps/${appId}/monetization`,
    {
      monetizationEnabled: true,
      inferenceMarkupPercentage: settings?.inferenceMarkupPercentage ?? 50,
      purchaseSharePercentage: settings?.purchaseSharePercentage ?? 10,
    },
    { authenticated: true },
  );
  const body = await response.json();
  return { response, body };
}

/** Get monetization settings for an app */
export async function getMonetization(appId: string): Promise<{ response: Response; body: any }> {
  const response = await api.get(`/api/v1/apps/${appId}/monetization`, {
    authenticated: true,
  });
  const body = await response.json();
  return { response, body };
}

/** Get earnings for an app */
export async function getEarnings(appId: string): Promise<{ response: Response; body: any }> {
  const response = await api.get(`/api/v1/apps/${appId}/earnings`, {
    authenticated: true,
  });
  const body = await response.json();
  return { response, body };
}

/** Get public info for an app (no auth required) */
export async function getPublicAppInfo(appId: string): Promise<{ response: Response; body: any }> {
  const response = await api.get(`/api/v1/apps/${appId}/public`);
  const body = await response.json();
  return { response, body };
}

/** Generate a test character payload for agent publishing */
export function testCharacterPayload(overrides?: Record<string, unknown>) {
  const suffix = testSuffix();
  return {
    name: `E2E Test Agent ${suffix}`,
    bio: "Automated E2E test agent for monetization testing",
    system: "You are a helpful assistant created for automated testing.",
    topics: ["testing", "automation"],
    adjectives: ["helpful", "reliable"],
    ...overrides,
  };
}
