import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl, getConfig } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const config = getConfig();

interface Container { id: string; name: string; status: string }
interface Quota { used: number; limit: number; available: number }

export function listContainers(): Container[] {
  const res = http.get(`${baseUrl}/api/v1/containers`, { headers, tags: { endpoint: "containers" } });
  if (!check(res, { "list 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ containers: Container[] }>(res).containers || [];
}

export function getContainerQuota(): Quota | null {
  const res = http.get(`${baseUrl}/api/v1/containers/quota`, { headers, tags: { endpoint: "containers" } });
  if (!check(res, { "quota 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Quota>(res);
}

export function getContainer(containerId: string): Container | null {
  const res = http.get(`${baseUrl}/api/v1/containers/${containerId}`, { headers, tags: { endpoint: "containers" } });
  if (!check(res, { "get 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Container>(res);
}

export function getContainerHealth(containerId: string): Record<string, unknown> | null {
  const res = http.get(`${baseUrl}/api/v1/containers/${containerId}/health`, { headers, tags: { endpoint: "containers" } });
  if (res.status === 404) return null;
  if (!check(res, { "health 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Record<string, unknown>>(res);
}

export function getContainerMetrics(containerId: string): Record<string, unknown> | null {
  const res = http.get(`${baseUrl}/api/v1/containers/${containerId}/metrics`, { headers, tags: { endpoint: "containers" } });
  if (res.status === 404) return null;
  if (!check(res, { "metrics 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Record<string, unknown>>(res);
}

export function containerReadOperations() {
  group("Container Read", () => {
    const containers = listContainers();
    sleep(0.3);
    getContainerQuota();
    sleep(0.3);
    if (containers.length > 0) {
      getContainer(containers[0].id);
      sleep(0.3);
      getContainerHealth(containers[0].id);
      getContainerMetrics(containers[0].id);
    }
  });
  sleep(1);
}

export default function () {
  containerReadOperations();
}
