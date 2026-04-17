import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";
import {
  type ManagedMiladyGithubBinding,
  type ManagedMiladyGithubMode,
  readManagedMiladyGithubBinding,
  withManagedMiladyGithubBinding,
  withoutManagedMiladyGithubBinding,
} from "./milady-agent-config";

export interface ManagedMiladyGithubStatus {
  configured: boolean;
  connected: boolean;
  mode: ManagedMiladyGithubMode | null;
  connectionId: string | null;
  connectionRole: "owner" | "agent" | null;
  githubUserId: string | null;
  githubUsername: string | null;
  githubDisplayName: string | null;
  githubAvatarUrl: string | null;
  githubEmail: string | null;
  scopes: string[];
  source: "platform_credentials" | "secrets" | null;
  adminElizaUserId: string | null;
  connectedAt: string | null;
}

function toStatus(
  agentConfig: Record<string, unknown> | null | undefined,
  configured: boolean,
): ManagedMiladyGithubStatus {
  const binding = readManagedMiladyGithubBinding(agentConfig);

  return {
    configured,
    connected: Boolean(binding),
    mode: binding?.mode ?? null,
    connectionId: binding?.connectionId ?? null,
    connectionRole: binding?.connectionRole ?? null,
    githubUserId: binding?.githubUserId ?? null,
    githubUsername: binding?.githubUsername ?? null,
    githubDisplayName: binding?.githubDisplayName ?? null,
    githubAvatarUrl: binding?.githubAvatarUrl ?? null,
    githubEmail: binding?.githubEmail ?? null,
    scopes: binding?.scopes ?? [],
    source: binding?.source ?? null,
    adminElizaUserId: binding?.adminElizaUserId ?? null,
    connectedAt: binding?.connectedAt ?? null,
  };
}

function isGithubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}

export class ManagedMiladyGithubService {
  async getStatus(params: {
    agentId: string;
    organizationId: string;
  }): Promise<ManagedMiladyGithubStatus | null> {
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      return null;
    }

    return toStatus(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
      isGithubOAuthConfigured(),
    );
  }

  async connectAgent(params: {
    agentId: string;
    organizationId: string;
    binding: ManagedMiladyGithubBinding;
  }): Promise<{ restarted: boolean; status: ManagedMiladyGithubStatus }> {
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      throw new Error("Agent not found");
    }

    const nextConfig = withManagedMiladyGithubBinding(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
      params.binding,
    );

    await miladySandboxesRepository.update(sandbox.id, {
      agent_config: nextConfig,
    });

    let restarted = false;
    if (sandbox.status === "running") {
      const shutdown = await miladySandboxService.shutdown(
        sandbox.id,
        params.organizationId,
      );
      if (!shutdown.success) {
        throw new Error(shutdown.error || "Failed to restart agent");
      }

      const provision = await miladySandboxService.provision(
        sandbox.id,
        params.organizationId,
      );
      if (!provision.success) {
        throw new Error(provision.error || "Failed to restart agent");
      }
      restarted = true;
    }

    logger.info("[managed-github] Linked GitHub to managed Milady agent", {
      agentId: sandbox.id,
      organizationId: params.organizationId,
      githubUsername: params.binding.githubUsername,
      restarted,
    });

    return {
      restarted,
      status: toStatus(nextConfig, isGithubOAuthConfigured()),
    };
  }

  async disconnectAgent(params: {
    agentId: string;
    organizationId: string;
  }): Promise<{ restarted: boolean; status: ManagedMiladyGithubStatus }> {
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      throw new Error("Agent not found");
    }

    const currentConfig =
      (sandbox.agent_config as Record<string, unknown> | null) ?? {};
    const currentBinding = readManagedMiladyGithubBinding(currentConfig);

    // Revoke the OAuth connection if it exists
    if (
      currentBinding?.connectionId &&
      currentBinding.mode !== "shared-owner"
    ) {
      try {
        await oauthService.revokeConnection({
          organizationId: params.organizationId,
          connectionId: currentBinding.connectionId,
        });
      } catch (error) {
        logger.warn(
          "[managed-github] Failed to revoke OAuth connection during disconnect",
          {
            connectionId: currentBinding.connectionId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    const nextConfig = withoutManagedMiladyGithubBinding(currentConfig);

    await miladySandboxesRepository.update(sandbox.id, {
      agent_config: nextConfig,
    });

    let restarted = false;
    if (sandbox.status === "running") {
      const shutdown = await miladySandboxService.shutdown(
        sandbox.id,
        params.organizationId,
      );
      if (!shutdown.success) {
        throw new Error(shutdown.error || "Failed to restart agent");
      }

      const provision = await miladySandboxService.provision(
        sandbox.id,
        params.organizationId,
      );
      if (!provision.success) {
        throw new Error(provision.error || "Failed to restart agent");
      }
      restarted = true;
    }

    logger.info("[managed-github] Unlinked GitHub from managed Milady agent", {
      agentId: sandbox.id,
      organizationId: params.organizationId,
      restarted,
    });

    return {
      restarted,
      status: toStatus(nextConfig, isGithubOAuthConfigured()),
    };
  }

  /**
   * Get a valid GitHub access token for the agent's linked connection.
   * Auto-refreshes if needed (though GitHub OAuth App tokens don't expire).
   */
  async getAgentToken(params: {
    agentId: string;
    organizationId: string;
  }): Promise<{ accessToken: string; githubUsername: string } | null> {
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      return null;
    }

    const binding = readManagedMiladyGithubBinding(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
    );
    if (!binding) {
      return null;
    }

    const tokenResult = await oauthService.getValidToken({
      organizationId: params.organizationId,
      connectionId: binding.connectionId,
    });

    return {
      accessToken: tokenResult.accessToken,
      githubUsername: binding.githubUsername,
    };
  }
}

export const managedMiladyGithubService = new ManagedMiladyGithubService();
