// Universal test API key - created by scripts/seed-test-api-key.ts
// Use this for local development and CI testing
const UNIVERSAL_TEST_KEY = "eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export function getApiKey(): string {
  // Explicit API key override takes precedence
  if (__ENV.API_KEY) return __ENV.API_KEY;

  const env = __ENV.LOAD_TEST_ENV || "local";

  // For local/CI, use the universal test key
  if (env === "local") {
    return __ENV.LOCAL_API_KEY || UNIVERSAL_TEST_KEY;
  }

  // For staging/production, require explicit key
  const key = env === "staging" ? __ENV.STAGING_API_KEY : __ENV.PROD_API_KEY;
  if (!key) throw new Error(`API key required for ${env} environment`);
  return key;
}

export function getAuthHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` };
}

export function getPublicHeaders() {
  return { "Content-Type": "application/json" };
}

export function getInternalHeaders() {
  const key = __ENV.INTERNAL_API_KEY;
  if (!key && __ENV.LOAD_TEST_ENV !== "local") throw new Error("INTERNAL_API_KEY required");
  return { "Content-Type": "application/json", Authorization: `Bearer ${key || "local-dev-internal-key"}` };
}
