import { group, sleep } from "k6";
import { httpGet } from "../../helpers/http";

interface Container {
  id: string;
  name: string;
  status: string;
}
interface Quota {
  used: number;
  limit: number;
  available: number;
}

export function listContainers(): Container[] {
  const body = httpGet<{ containers: Container[] }>("/api/v1/containers", {
    tags: { endpoint: "containers" },
  });
  return body?.containers ?? [];
}

export function getContainerQuota(): Quota | null {
  return httpGet<Quota>("/api/v1/containers/quota", {
    tags: { endpoint: "containers" },
  });
}

export function getContainer(containerId: string): Container | null {
  return httpGet<Container>(`/api/v1/containers/${containerId}`, {
    tags: { endpoint: "containers" },
  });
}

export function getContainerHealth(
  containerId: string,
): Record<string, unknown> | null {
  return httpGet<Record<string, unknown>>(
    `/api/v1/containers/${containerId}/health`,
    { tags: { endpoint: "containers" } },
  );
}

export function getContainerMetrics(
  containerId: string,
): Record<string, unknown> | null {
  return httpGet<Record<string, unknown>>(
    `/api/v1/containers/${containerId}/metrics`,
    { tags: { endpoint: "containers" } },
  );
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

export default function main() {
  containerReadOperations();
}
