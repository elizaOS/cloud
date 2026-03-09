/**
 * VercelSandboxProvider — SandboxProvider implementation using Vercel Sandbox SDK.
 *
 * Extracted from the inline Vercel code in MiladySandboxService to support
 * the pluggable provider pattern (MILADY_SANDBOX_PROVIDER env var).
 */

import { logger } from "@/lib/utils/logger";
import type { SandboxProvider, SandboxHandle, SandboxCreateConfig } from "./sandbox-provider";

// Set MILADY_AGENT_TEMPLATE_URL to override the default template repo.
const CLOUD_AGENT_TEMPLATE_URL = process.env.MILADY_AGENT_TEMPLATE_URL ?? "https://github.com/elizaos/milady-cloud-agent-template.git";
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SANDBOX_VCPUS = 4;
const SANDBOX_HEALTH_PORT = 2138;
const SANDBOX_BRIDGE_PORT = 18790;
const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 2_000;

export class VercelSandboxProvider implements SandboxProvider {

  async create(config: SandboxCreateConfig): Promise<SandboxHandle> {
    const { Sandbox } = await import("@vercel/sandbox");
    const creds = this.getSandboxCreds();
    if (!creds.hasOIDC && !creds.hasAccessToken) {
      throw new Error("Vercel Sandbox credentials not configured");
    }

    const env: Record<string, string> = {
      ...config.environmentVars,
      AGENT_NAME: config.agentName,
      PORT: String(SANDBOX_HEALTH_PORT),
      BRIDGE_PORT: String(SANDBOX_BRIDGE_PORT),
    };

    const opts: Record<string, unknown> = {
      source: config.snapshotId
        ? { type: "snapshot", snapshotId: config.snapshotId }
        : { url: CLOUD_AGENT_TEMPLATE_URL, type: "git" },
      resources: { vcpus: config.resources?.vcpus ?? SANDBOX_VCPUS },
      timeout: config.timeout ?? SANDBOX_TIMEOUT_MS,
      ports: [SANDBOX_HEALTH_PORT, SANDBOX_BRIDGE_PORT],
      runtime: "node24",
      env,
    };

    if (creds.hasAccessToken) {
      opts.teamId = creds.teamId;
      opts.projectId = creds.projectId;
      opts.token = creds.token;
    }

    type SB = { sandboxId?: string; domain: (port: number) => string };
    const sb = (await Sandbox.create(opts)) as SB;
    const sandboxId = sb.sandboxId ?? `sandbox-${crypto.randomUUID().slice(0, 8)}`;

    // Write .env.local as a fallback — some SDK versions ignore the env create option
    const envContent = Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n");
    const sbWithShell = sb as SB & { runCommand?: (opts: { cmd: string; args: string[]; env?: Record<string, string> }) => Promise<unknown> };
    if (typeof sbWithShell.runCommand === "function") {
      await sbWithShell.runCommand({ cmd: "sh", args: ["-c", `cat > /app/.env.local << 'ENVEOF'\n${envContent}\nENVEOF`] });
    }

    return {
      sandboxId,
      bridgeUrl: `https://${sb.domain(SANDBOX_BRIDGE_PORT)}`,
      healthUrl: `https://${sb.domain(SANDBOX_HEALTH_PORT)}`,
    };
  }

  async stop(sandboxId: string): Promise<void> {
    const { Sandbox } = await import("@vercel/sandbox");
    const creds = this.getSandboxCreds();
    const opts: Record<string, unknown> = {};
    if (creds.hasAccessToken) {
      opts.teamId = creds.teamId;
      opts.projectId = creds.projectId;
      opts.token = creds.token;
    }
    const sb = await Sandbox.get({ sandboxId, ...opts }) as {
      shutdown?: () => Promise<void>;
      close?: () => Promise<void>;
    };
    if (typeof sb.shutdown === "function") await sb.shutdown();
    else if (typeof sb.close === "function") await sb.close();
  }

  async checkHealth(healthUrl: string): Promise<boolean> {
    const url = healthUrl.replace(/\/$/, "") + "/health";
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const ok = await fetch(url, { signal: AbortSignal.timeout(5_000) })
          .then((r) => r.ok)
          .catch(() => false);
        if (ok) return true;
      } catch {
        // ignore, retry
      }
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    return false;
  }

  private getSandboxCreds() {
    const hasOIDC = !!process.env.VERCEL_OIDC_TOKEN;
    const { VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId, VERCEL_TOKEN: token } = process.env;
    return { hasOIDC, hasAccessToken: !!(teamId && projectId && token), teamId, projectId, token };
  }
}
