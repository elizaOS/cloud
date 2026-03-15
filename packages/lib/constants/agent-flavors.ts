/**
 * Agent Flavor Presets — predefined Docker image configurations for different
 * agent types.  The default flavor ("milady") preserves backwards compatibility
 * with the existing hardcoded image.
 */

export interface AgentFlavor {
  id: string;
  name: string;
  description: string;
  dockerImage: string;
  defaultEnvVars?: Record<string, string>;
}

export const AGENT_FLAVORS: AgentFlavor[] = [
  {
    id: "milady",
    name: "Milady",
    description: "Full milady agent with VRM companion UI",
    dockerImage: "milady/agent:cloud-full-ui",
  },
  {
    id: "cloud-agent",
    name: "Cloud Agent (Slim)",
    description: "Lightweight ElizaOS agent with bridge only, no UI",
    dockerImage: "elizaos/agent:slim",
  },
  {
    id: "custom",
    name: "Custom Image",
    description: "Bring your own Docker image",
    dockerImage: "", // user provides
  },
];

export function getFlavorById(id: string): AgentFlavor | undefined {
  return AGENT_FLAVORS.find((f) => f.id === id);
}

export function getDefaultFlavor(): AgentFlavor {
  return AGENT_FLAVORS[0]; // milady
}
