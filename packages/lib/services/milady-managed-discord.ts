import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { logger } from "@/lib/utils/logger";
import {
  type ManagedMiladyDiscordBinding,
  readManagedMiladyDiscordBinding,
  withManagedMiladyDiscordBinding,
  withoutManagedMiladyDiscordBinding,
} from "./milady-agent-config";

const ROLES_PLUGIN_ID = "@miladyai/plugin-roles";
export const DISCORD_DEVELOPER_PORTAL_URL = "https://discord.com/developers/applications";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = asRecord(parent[key]);
  if (existing) {
    return existing;
  }

  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function withDiscordConnectorAdmin(
  agentConfig: Record<string, unknown> | null | undefined,
  adminDiscordUserId: string,
): Record<string, unknown> {
  const next = { ...(agentConfig ?? {}) };
  const plugins = ensureRecord(next, "plugins");
  const entries = ensureRecord(plugins, "entries");
  const rolesEntry = ensureRecord(entries, ROLES_PLUGIN_ID);
  rolesEntry.enabled = true;

  const roleConfig = ensureRecord(rolesEntry, "config");
  const connectorAdmins = ensureRecord(roleConfig, "connectorAdmins");
  connectorAdmins.discord = [adminDiscordUserId];

  return next;
}

function withoutDiscordConnectorAdmin(
  agentConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(agentConfig ?? {}) };
  const plugins = asRecord(next.plugins);
  const entries = asRecord(plugins?.entries);
  const rolesEntry = asRecord(entries?.[ROLES_PLUGIN_ID]);
  const roleConfig = asRecord(rolesEntry?.config);
  const connectorAdmins = asRecord(roleConfig?.connectorAdmins);

  if (connectorAdmins) {
    delete connectorAdmins.discord;
    if (Object.keys(connectorAdmins).length === 0 && roleConfig) {
      delete roleConfig.connectorAdmins;
    }
  }

  if (roleConfig && Object.keys(roleConfig).length === 0 && rolesEntry) {
    delete rolesEntry.config;
  }

  return next;
}

export interface ManagedMiladyDiscordStatus {
  applicationId: string | null;
  configured: boolean;
  connected: boolean;
  developerPortalUrl: string;
  guildId: string | null;
  guildName: string | null;
  adminDiscordUserId: string | null;
  adminDiscordUsername: string | null;
  adminDiscordDisplayName: string | null;
  adminElizaUserId: string | null;
  botNickname: string | null;
  connectedAt: string | null;
}

function toStatus(
  agentConfig: Record<string, unknown> | null | undefined,
  configured: boolean,
  applicationId: string | null,
): ManagedMiladyDiscordStatus {
  const binding = readManagedMiladyDiscordBinding(agentConfig);

  return {
    applicationId,
    configured,
    connected: Boolean(binding),
    developerPortalUrl: DISCORD_DEVELOPER_PORTAL_URL,
    guildId: binding?.guildId ?? null,
    guildName: binding?.guildName ?? null,
    adminDiscordUserId: binding?.adminDiscordUserId ?? null,
    adminDiscordUsername: binding?.adminDiscordUsername ?? null,
    adminDiscordDisplayName: binding?.adminDiscordDisplayName ?? null,
    adminElizaUserId: binding?.adminElizaUserId ?? null,
    botNickname: binding?.botNickname ?? null,
    connectedAt: binding?.connectedAt ?? null,
  };
}

export class ManagedMiladyDiscordService {
  async getStatus(params: {
    agentId: string;
    organizationId: string;
    configured: boolean;
    applicationId: string | null;
  }): Promise<ManagedMiladyDiscordStatus | null> {
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      return null;
    }

    return toStatus(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
      params.configured,
      params.applicationId,
    );
  }

  async connectAgent(params: {
    agentId: string;
    organizationId: string;
    binding: ManagedMiladyDiscordBinding;
  }): Promise<{ restarted: boolean; status: ManagedMiladyDiscordStatus }> {
    const conflictingGuildLinks = await miladySandboxesRepository.findByManagedDiscordGuildId(
      params.binding.guildId,
    );
    const conflict = conflictingGuildLinks.find((sandbox) => sandbox.id !== params.agentId);
    if (conflict) {
      throw new Error("Discord server is already linked to another agent");
    }

    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      throw new Error("Agent not found");
    }

    let nextConfig = withManagedMiladyDiscordBinding(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
      params.binding,
    );
    nextConfig = withDiscordConnectorAdmin(nextConfig, params.binding.adminDiscordUserId);

    await miladySandboxesRepository.update(sandbox.id, {
      agent_config: nextConfig,
    });

    let restarted = false;
    if (sandbox.status === "running") {
      const shutdown = await miladySandboxService.shutdown(sandbox.id, params.organizationId);
      if (!shutdown.success) {
        throw new Error(shutdown.error || "Failed to restart agent");
      }

      const provision = await miladySandboxService.provision(sandbox.id, params.organizationId);
      if (!provision.success) {
        throw new Error(provision.error || "Failed to restart agent");
      }
      restarted = true;
    }

    logger.info("[managed-discord] Linked Discord to managed Milady agent", {
      agentId: sandbox.id,
      organizationId: params.organizationId,
      guildId: params.binding.guildId,
      adminDiscordUserId: params.binding.adminDiscordUserId,
      restarted,
    });

    return {
      restarted,
      status: toStatus(nextConfig, true, params.binding.applicationId ?? null),
    };
  }

  async disconnectAgent(params: {
    agentId: string;
    organizationId: string;
    configured: boolean;
    applicationId: string | null;
  }): Promise<{ restarted: boolean; status: ManagedMiladyDiscordStatus }> {
    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      params.agentId,
      params.organizationId,
    );
    if (!sandbox) {
      throw new Error("Agent not found");
    }

    let nextConfig = withoutManagedMiladyDiscordBinding(
      (sandbox.agent_config as Record<string, unknown> | null) ?? {},
    );
    nextConfig = withoutDiscordConnectorAdmin(nextConfig);

    await miladySandboxesRepository.update(sandbox.id, {
      agent_config: nextConfig,
    });

    let restarted = false;
    if (sandbox.status === "running") {
      const shutdown = await miladySandboxService.shutdown(sandbox.id, params.organizationId);
      if (!shutdown.success) {
        throw new Error(shutdown.error || "Failed to restart agent");
      }

      const provision = await miladySandboxService.provision(sandbox.id, params.organizationId);
      if (!provision.success) {
        throw new Error(provision.error || "Failed to restart agent");
      }
      restarted = true;
    }

    logger.info("[managed-discord] Unlinked Discord from managed Milady agent", {
      agentId: sandbox.id,
      organizationId: params.organizationId,
      restarted,
    });

    return {
      restarted,
      status: toStatus(nextConfig, params.configured, params.applicationId),
    };
  }
}

export const managedMiladyDiscordService = new ManagedMiladyDiscordService();
