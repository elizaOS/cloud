export function getApiKey(): string {
  if (__ENV.API_KEY) return __ENV.API_KEY;

  const env = __ENV.LOAD_TEST_ENV || "local";
  if (env === "local") return __ENV.LOCAL_API_KEY || "sk_test_load_testing_key";
  
  const key = env === "staging" ? __ENV.STAGING_API_KEY : __ENV.PROD_API_KEY;
  if (!key) throw new Error(`API key required for ${env}`);
  return key;
}

export function getAuthHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` };
}

export function getPublicHeaders() {
  return { "Content-Type": "application/json" };
}
