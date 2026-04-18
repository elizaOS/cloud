/**
 * Agent Flavor Presets — predefined Docker image configurations for different
 * agent types.  The default Milady flavor resolves its image at runtime from
 * the MILADY_DOCKER_IMAGE env var so operators can pin a tag without touching code.
 */

/** Runtime-resolved default image for the Milady flavor. */
const DEFAULT_MILADY_IMAGE =
  process.env.MILADY_DOCKER_IMAGE || "ghcr.io/milady-ai/agent:v2.0.0-steward-5";

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
    description: "Full milady agent with Steward wallet vault integration and VRM companion UI",
    dockerImage: DEFAULT_MILADY_IMAGE,
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
