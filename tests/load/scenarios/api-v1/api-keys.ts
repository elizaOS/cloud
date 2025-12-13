import { check, group, sleep } from "k6";
import { getConfig } from "../../config/environments";
import { httpGet, httpPost, httpDelete } from "../../helpers/http";
import { generateApiKeyName } from "../../helpers/data-generators";
import { Counter } from "k6/metrics";

const config = getConfig();
const apiKeysCreated = new Counter("api_keys_created");
const apiKeysDeleted = new Counter("api_keys_deleted");

interface ApiKey { id: string; name: string }
interface CreateResult { apiKey: ApiKey; plainKey: string }

export function listApiKeys(): ApiKey[] {
  const body = httpGet<{ apiKeys: ApiKey[] }>("/api/v1/api-keys", { tags: { endpoint: "api-keys" } });
  return body?.apiKeys ?? [];
}

export function createApiKey(name?: string): CreateResult | null {
  const body = httpPost<CreateResult>("/api/v1/api-keys", { name: name || generateApiKeyName() }, { tags: { endpoint: "api-keys" } });
  if (!body) return null;
  apiKeysCreated.add(1);
  return body;
}

export function deleteApiKey(keyId: string): boolean {
  const deleted = httpDelete(`/api/v1/api-keys/${keyId}`, { tags: { endpoint: "api-keys" } });
  if (deleted) apiKeysDeleted.add(1);
  return deleted;
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
