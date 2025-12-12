/**
 * Authentication Helper for Load Tests
 *
 * Provides API key management and request header generation.
 * Supports hardhat key 0 for local testing.
 */

import http from "k6/http";
import { getBaseUrl } from "../config/environments";

// Hardhat account 0 private key (well-known test key)
const HARDHAT_PRIVATE_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_ADDRESS_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export interface AuthHeaders {
  "Content-Type": string;
  Authorization?: string;
}

export function getApiKey(): string {
  // Priority: explicit API key > generated from hardhat
  if (__ENV.API_KEY) {
    return __ENV.API_KEY;
  }

  if (__ENV.LOAD_TEST_ENV === "local" || !__ENV.LOAD_TEST_ENV) {
    return __ENV.LOCAL_API_KEY || "sk_test_load_testing_key";
  }

  if (__ENV.LOAD_TEST_ENV === "staging") {
    const key = __ENV.STAGING_API_KEY;
    if (!key) throw new Error("STAGING_API_KEY required for staging environment");
    return key;
  }

  if (__ENV.LOAD_TEST_ENV === "production") {
    const key = __ENV.PROD_API_KEY;
    if (!key) throw new Error("PROD_API_KEY required for production environment");
    return key;
  }

  throw new Error(`Unknown environment: ${__ENV.LOAD_TEST_ENV}`);
}

export function getAuthHeaders(): AuthHeaders {
  const apiKey = getApiKey();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function getPublicHeaders(): AuthHeaders {
  return {
    "Content-Type": "application/json",
  };
}

export function getInternalHeaders(): AuthHeaders {
  const internalKey = __ENV.INTERNAL_API_KEY || "local-dev-internal-api-key";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${internalKey}`,
  };
}

/**
 * Create a test API key for load testing.
 * This creates a new key that can be used and then deleted after the test.
 */
export function createTestApiKey(name: string): { id: string; plainKey: string } | null {
  const headers = getAuthHeaders();
  const baseUrl = getBaseUrl();

  const response = http.post(
    `${baseUrl}/api/mcp`,
    JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "create_api_key",
        arguments: { name, description: "Load test key - auto cleanup" },
      },
      id: Date.now(),
    }),
    { headers }
  );

  if (response.status !== 200) {
    console.error(`Failed to create test API key: ${response.status}`);
    return null;
  }

  const body = JSON.parse(response.body as string);
  if (body.error) {
    console.error(`API error creating key: ${body.error.message}`);
    return null;
  }

  const result = JSON.parse(body.result?.content?.[0]?.text || "{}");
  return {
    id: result.apiKey?.id,
    plainKey: result.plainKey,
  };
}

/**
 * Delete a test API key.
 */
export function deleteTestApiKey(apiKeyId: string): boolean {
  const headers = getAuthHeaders();
  const baseUrl = getBaseUrl();

  const response = http.post(
    `${baseUrl}/api/mcp`,
    JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "delete_api_key",
        arguments: { apiKeyId },
      },
      id: Date.now(),
    }),
    { headers }
  );

  return response.status === 200;
}

export function getHardhatWallet() {
  return {
    privateKey: HARDHAT_PRIVATE_KEY_0,
    address: HARDHAT_ADDRESS_0,
  };
}

