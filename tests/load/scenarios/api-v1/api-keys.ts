import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl, getConfig } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { generateApiKeyName } from "../../helpers/data-generators";
import { recordHttpError } from "../../helpers/metrics";
import { Counter } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const config = getConfig();

const apiKeysCreated = new Counter("api_keys_created");
const apiKeysDeleted = new Counter("api_keys_deleted");

interface ApiKey { id: string; name: string }
interface CreateResult { apiKey: ApiKey; plainKey: string }

export function listApiKeys(): ApiKey[] {
  const res = http.get(`${baseUrl}/api/v1/api-keys`, { headers, tags: { endpoint: "api-keys" } });
  if (!check(res, { "list 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ apiKeys: ApiKey[] }>(res).apiKeys || [];
}

export function createApiKey(name?: string): CreateResult | null {
  const res = http.post(`${baseUrl}/api/v1/api-keys`, JSON.stringify({ name: name || generateApiKeyName() }), {
    headers, tags: { endpoint: "api-keys" },
  });
  if (!check(res, { "create 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  apiKeysCreated.add(1);
  return parseBody<CreateResult>(res);
}

export function deleteApiKey(keyId: string): boolean {
  const res = http.del(`${baseUrl}/api/v1/api-keys/${keyId}`, null, { headers, tags: { endpoint: "api-keys" } });
  if (!check(res, { "delete 2xx": (r) => r.status >= 200 && r.status < 300 })) {
    recordHttpError(res.status);
    return false;
  }
  apiKeysDeleted.add(1);
  return true;
}

export function apiKeyCrudCycle() {
  group("API Key CRUD", () => {
    listApiKeys();
    sleep(0.5);
    if (config.safeMode) return;

    const created = createApiKey();
    if (!created) return;
    check(null, { "key created": () => created.plainKey.startsWith("sk_") });
    sleep(0.5);
    deleteApiKey(created.apiKey.id);
  });
  sleep(1);
}

export function apiKeyReadOnly() {
  group("API Key Read", () => listApiKeys());
  sleep(0.5);
}

export default function () {
  apiKeyCrudCycle();
}
