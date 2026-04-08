import { resolveStewardContainerUrl } from "@/lib/services/docker-sandbox-utils";
import {
  type ManagedMiladyEnvironmentResult,
  prepareManagedMiladyBaseEnvironment,
} from "@/lib/services/managed-milady-config";

export type { ManagedMiladyEnvironmentResult } from "@/lib/services/managed-milady-config";

export async function prepareManagedMiladyEnvironment(params: {
  existingEnv?: Record<string, string> | null;
  organizationId: string;
  userId: string;
  /** Sandbox/agent ID — used as STEWARD_AGENT_ID for Docker-backed agents. */
  sandboxId?: string;
}): Promise<ManagedMiladyEnvironmentResult> {
  const existingEnv = { ...(params.existingEnv ?? {}) };
  const baseEnvironment = await prepareManagedMiladyBaseEnvironment({
    existingEnv,
    organizationId: params.organizationId,
    userId: params.userId,
  });
  const environmentVars: Record<string, string> = {
    ...baseEnvironment.environmentVars,
  };

  // Steward env vars — Docker-backed agents need these to talk to the wallet vault.
  // STEWARD_API_URL is resolved for container reachability (host.docker.internal
  // or the explicit override). STEWARD_AGENT_ID maps to the sandbox ID.
  // STEWARD_AGENT_TOKEN is set during provisioning in docker-sandbox-provider.ts.
  const stewardContainerUrl = resolveStewardContainerUrl(
    process.env.STEWARD_API_URL || "http://localhost:3200",
    process.env.STEWARD_CONTAINER_URL,
  );

  if (!existingEnv.STEWARD_API_URL) {
    environmentVars.STEWARD_API_URL = stewardContainerUrl;
  }
  if (params.sandboxId && !existingEnv.STEWARD_AGENT_ID) {
    environmentVars.STEWARD_AGENT_ID = params.sandboxId;
  }

  const changed = JSON.stringify(existingEnv) !== JSON.stringify(environmentVars);

  return {
    apiToken: baseEnvironment.apiToken,
    changed,
    environmentVars,
    userApiKey: baseEnvironment.userApiKey,
  };
}
