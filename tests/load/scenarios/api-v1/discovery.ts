import { group, sleep } from "k6";
import { httpGet, httpPost } from "../../helpers/http";
import { discoveryQueries } from "../../helpers/metrics";

interface Service { agentId: string; name: string }

export function discoverServices(sources = ["local"], limit = 20): Service[] {
  const body = httpPost<{ services: Service[] }>("/api/v1/discovery", { sources, limit }, { tags: { endpoint: "discovery" } });
  if (!body) return [];
  discoveryQueries.add(1);
  return body.services ?? [];
}

export function getServiceDetails(agentId: string): Record<string, unknown> | null {
  return httpGet<Record<string, unknown>>(`/api/v1/discovery/${agentId}`, { tags: { endpoint: "discovery" } });
}

export function findMcpTools(tools: string[]): unknown[] {
  const body = httpPost<{ results: unknown[] }>("/api/v1/discovery/mcp-tools", { tools }, { tags: { endpoint: "discovery" } });
  return body?.results ?? [];
}

export function findA2aSkills(skills: string[]): unknown[] {
  const body = httpPost<{ results: unknown[] }>("/api/v1/discovery/a2a-skills", { skills }, { tags: { endpoint: "discovery" } });
  return body?.results ?? [];
}

export function getAgentCard(): Record<string, unknown> | null {
  return httpGet<Record<string, unknown>>("/.well-known/agent-card.json", { public: true, tags: { endpoint: "discovery" } });
}

export function discoveryOperationsCycle() {
  group("Discovery", () => {
    getAgentCard();
    sleep(0.3);
    const services = discoverServices(["local"], 10);
    sleep(0.3);
    if (services.length > 0) getServiceDetails(services[0].agentId);
    sleep(0.3);
    findMcpTools(["check_credits", "list_agents"]);
    sleep(0.3);
    findA2aSkills(["chat", "getBalance"]);
  });
  sleep(1);
}

export default function () {
  discoveryOperationsCycle();
}
