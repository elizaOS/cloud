import type { MiladySandbox } from "@/db/schemas/milady-sandboxes";

type AgentWithId = Pick<MiladySandbox, "id">;

function normalizeBaseDomain(value: string | undefined): string | null {
  const normalized = value
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");

  return normalized ? normalized : null;
}

export function getMiladyAgentBaseDomain(): string | null {
  return (
    normalizeBaseDomain(process.env.NEXT_PUBLIC_ELIZA_CLOUD_AGENT_BASE_DOMAIN) ??
    normalizeBaseDomain(process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN) ??
    normalizeBaseDomain(process.env.NEXT_PUBLIC_MILADY_AGENT_BASE_DOMAIN) ??
    normalizeBaseDomain(process.env.MILADY_AGENT_BASE_DOMAIN) ??
    "waifu.fun"
  );
}

export function getMiladyWebUiUrl(agent: AgentWithId): string | null {
  const baseDomain = getMiladyAgentBaseDomain();
  if (!baseDomain) {
    return null;
  }

  return `https://${agent.id}.${baseDomain}`;
}
