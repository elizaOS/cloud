import { group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { httpGet, httpPost, httpPatch, httpDelete } from "../../helpers/http";
import { generateAgentPayload, generateAgentName } from "../../helpers/data-generators";
import { agentsCreated, agentsDeleted, agentCreationTime } from "../../helpers/metrics";

const baseUrl = getBaseUrl();

interface Agent { id: string; name: string }

export function listAgents(): Agent[] {
  const body = httpGet<{ agents: Agent[] }>("/api/v1/app/agents", { tags: { endpoint: "agents" } });
  return body?.agents ?? [];
}

export function createAgent(): string | null {
  const start = Date.now();
  const body = httpPost<{ agent: { id: string } }>("/api/v1/app/agents", generateAgentPayload(), {
    expectedStatus: 201, tags: { endpoint: "agents" },
  });
  agentCreationTime.add(Date.now() - start);
  if (!body?.agent?.id) return null;
  agentsCreated.add(1);
  return body.agent.id;
}

export function getAgent(agentId: string): Agent | null {
  const body = httpGet<{ agent: Agent }>(`/api/v1/app/agents/${agentId}`, { tags: { endpoint: "agents" } });
  return body?.agent ?? null;
}

export function updateAgent(agentId: string): boolean {
  return httpPatch(`/api/v1/app/agents/${agentId}`, { name: generateAgentName() }, { tags: { endpoint: "agents" } }) !== null;
}

export function deleteAgent(agentId: string): boolean {
  const deleted = httpDelete(`/api/v1/app/agents/${agentId}`, { tags: { endpoint: "agents" } });
  if (deleted) agentsDeleted.add(1);
  return deleted;
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
