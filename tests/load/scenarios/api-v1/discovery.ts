import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders, getPublicHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { discoveryQueries, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const publicHeaders = getPublicHeaders();

interface Service { agentId: string; name: string }

export function discoverServices(sources = ["local"], limit = 20): Service[] {
  const res = http.post(`${baseUrl}/api/v1/discovery`, JSON.stringify({ sources, limit }), {
    headers, tags: { endpoint: "discovery" },
  });
  if (!check(res, { "discover 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  discoveryQueries.add(1);
  return parseBody<{ services: Service[] }>(res).services || [];
}

export function getServiceDetails(agentId: string): Record<string, unknown> | null {
  const res = http.get(`${baseUrl}/api/v1/discovery/${agentId}`, { headers, tags: { endpoint: "discovery" } });
  if (!check(res, { "details 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Record<string, unknown>>(res);
}

export function findMcpTools(tools: string[]): unknown[] {
  const res = http.post(`${baseUrl}/api/v1/discovery/mcp-tools`, JSON.stringify({ tools }), {
    headers, tags: { endpoint: "discovery" },
  });
  if (!check(res, { "find tools 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ results: unknown[] }>(res).results || [];
}

export function findA2aSkills(skills: string[]): unknown[] {
  const res = http.post(`${baseUrl}/api/v1/discovery/a2a-skills`, JSON.stringify({ skills }), {
    headers, tags: { endpoint: "discovery" },
  });
  if (!check(res, { "find skills 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ results: unknown[] }>(res).results || [];
}

export function getAgentCard(): Record<string, unknown> | null {
  const res = http.get(`${baseUrl}/.well-known/agent-card.json`, { headers: publicHeaders, tags: { endpoint: "discovery" } });
  if (!check(res, { "agent card 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Record<string, unknown>>(res);
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
