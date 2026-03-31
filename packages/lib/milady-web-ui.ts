import type { MiladySandbox } from "@/db/schemas/milady-sandboxes";

const DEFAULT_AGENT_BASE_DOMAIN = "waifu.fun";

type MiladyWebUiTarget = Pick<MiladySandbox, "id" | "headscale_ip" | "web_ui_port" | "bridge_port">;

type MiladyClientWebUiTarget = MiladyWebUiTarget & {
  canonicalWebUiUrl?: string | null;
};

export interface MiladyWebUiUrlOptions {
  baseDomain?: string | null;
  path?: string;
}

/** Resolved base domain for the current deployment (e.g. "waifu.fun"). */
export function getAgentBaseDomain(): string {
  return (
    normalizeAgentBaseDomain(process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN) ?? DEFAULT_AGENT_BASE_DOMAIN
  );
}

function normalizeAgentBaseDomain(baseDomain?: string | null): string | null {
  if (!baseDomain) {
    return null;
  }

  const normalizedDomain = baseDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");

  return normalizedDomain || null;
}

function applyPath(baseUrl: string, path = "/"): string {
  if (!path || path === "/") {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  const normalizedPath = new URL(path, "https://milady.local");

  url.pathname = normalizedPath.pathname;
  url.search = normalizedPath.search;
  url.hash = normalizedPath.hash;

  return url.toString();
}

// Server-only: reads process.env. Do not import in client components.
// For client use, pass canonical_web_ui_url from the server and call
// getClientSafeMiladyAgentWebUiUrl instead.
export function getMiladyAgentPublicWebUiUrl(
  sandbox: Pick<MiladySandbox, "id" | "headscale_ip">,
  options: MiladyWebUiUrlOptions = {},
): string | null {
  const normalizedDomain = normalizeAgentBaseDomain(
    options.baseDomain ?? process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN ?? DEFAULT_AGENT_BASE_DOMAIN,
  );
  if (!normalizedDomain) {
    return null;
  }

  return applyPath(`https://${sandbox.id}.${normalizedDomain}`, options.path);
}

export function getMiladyAgentDirectWebUiUrl(
  sandbox: MiladyWebUiTarget,
  options: Pick<MiladyWebUiUrlOptions, "path"> = {},
): string | null {
  if (!sandbox.headscale_ip) {
    return null;
  }

  const port = sandbox.web_ui_port ?? sandbox.bridge_port;
  if (!port) {
    return null;
  }

  return applyPath(`http://${sandbox.headscale_ip}:${port}`, options.path);
}

export function getPreferredMiladyAgentWebUiUrl(
  sandbox: MiladyWebUiTarget,
  options: MiladyWebUiUrlOptions = {},
): string | null {
  return (
    getMiladyAgentPublicWebUiUrl(sandbox, options) ?? getMiladyAgentDirectWebUiUrl(sandbox, options)
  );
}

export function getClientSafeMiladyAgentWebUiUrl(
  sandbox: MiladyClientWebUiTarget,
  options: Pick<MiladyWebUiUrlOptions, "path"> = {},
): string | null {
  if (sandbox.canonicalWebUiUrl) {
    return applyPath(sandbox.canonicalWebUiUrl, options.path);
  }

  return null;
}
