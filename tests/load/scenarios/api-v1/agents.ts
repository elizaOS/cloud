import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { generateAgentPayload, generateAgentName } from "../../helpers/data-generators";
import { agentsCreated, agentsDeleted, agentCreationTime, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();

interface Agent { id: string; name: string }

export function listAgents(): Agent[] {
  const res = http.get(`${baseUrl}/api/v1/app/agents`, { headers, tags: { endpoint: "agents" } });
  if (!check(res, { "list 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ agents: Agent[] }>(res).agents || [];
}

export function createAgent(): string | null {
  const start = Date.now();
  const res = http.post(`${baseUrl}/api/v1/app/agents`, JSON.stringify(generateAgentPayload()), {
    headers, tags: { endpoint: "agents" },
  });
  agentCreationTime.add(Date.now() - start);

  // API returns 201 for creation
  if (!check(res, { "create 201": (r) => r.status === 201 })) {
    recordHttpError(res.status);
    return null;
  }
  agentsCreated.add(1);
  return parseBody<{ agent: { id: string } }>(res).agent?.id || null;
}

export function getAgent(agentId: string): Agent | null {
  const res = http.get(`${baseUrl}/api/v1/app/agents/${agentId}`, { headers, tags: { endpoint: "agents" } });
  if (!check(res, { "get 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<{ agent: Agent }>(res).agent || null;
}

export function updateAgent(agentId: string): boolean {
  const res = http.patch(`${baseUrl}/api/v1/app/agents/${agentId}`, JSON.stringify({ name: generateAgentName() }), {
    headers, tags: { endpoint: "agents" },
  });
  if (!check(res, { "update 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return false;
  }
  return true;
}

export function deleteAgent(agentId: string): boolean {
  const res = http.del(`${baseUrl}/api/v1/app/agents/${agentId}`, null, { headers, tags: { endpoint: "agents" } });
  if (!check(res, { "delete 2xx": (r) => r.status >= 200 && r.status < 300 })) {
    recordHttpError(res.status);
    return false;
  }
  agentsDeleted.add(1);
  return true;
}

export function agentCrudCycle() {
  group("Agent CRUD", () => {
    listAgents();
    const agentId = createAgent();
    if (!agentId) return;
    sleep(0.5);
    getAgent(agentId);
    sleep(0.5);
    updateAgent(agentId);
    sleep(0.5);
    deleteAgent(agentId);
  });
  sleep(1);
}

export function agentReadOnly() {
  group("Agent Read", () => {
    const agents = listAgents();
    if (agents.length > 0) getAgent(agents[Math.floor(Math.random() * agents.length)].id);
  });
  sleep(0.5);
}

export default function () {
  agentCrudCycle();
}
