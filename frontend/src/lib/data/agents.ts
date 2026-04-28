import { useQuery } from "@tanstack/react-query";
import { api } from "../api-client";

export interface Agent {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

interface AgentsListResponse {
  characters?: Agent[];
  agents?: Agent[];
  data?: Agent[];
}

/**
 * GET /api/my-agents/characters — converted in the API workspace, returns the
 * caller's characters. Some legacy responses use `characters`, some use
 * `agents`; we coerce.
 */
export function useMyAgents() {
  return useQuery({
    queryKey: ["my-agents", "characters"],
    queryFn: async () => {
      const data = await api<AgentsListResponse>("/api/my-agents/characters");
      return data.characters ?? data.agents ?? data.data ?? [];
    },
  });
}

/**
 * GET /api/v1/agents/:agentId — agent detail. TODO(api) confirm the public
 * shape once Agent G publishes the v1 types.
 */
export function useAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api<{ agent: Agent }>(`/api/v1/agents/${agentId}`).then((r) => r.agent),
    enabled: Boolean(agentId),
  });
}
