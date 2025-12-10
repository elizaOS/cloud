/**
 * Agent Lifecycle Service
 *
 * Manages the lifecycle of agents per organization with proper
 * multi-tenancy, plugin configuration, secrets management,
 * and agent state tracking.
 *
 * Each organization can have their own configured agent instances
 * with custom settings, platform connections, and secrets.
 */

import { db } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  orgAgentInstances,
  orgAgentConfigs,
  type OrgAgentInstance,
  type NewOrgAgentInstance,
  type OrgAgentConfig,
  type NewOrgAgentConfig,
} from "@/db/schemas/org-agents";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import {
  ORG_CHARACTER_IDS,
  getOrgCharacter,
  isOrgCharacter,
  type orgCharacters,
} from "@/lib/eliza/characters/org";
import type { Character } from "@elizaos/core";

// =============================================================================
// TYPES
// =============================================================================

export type OrgAgentType = keyof typeof orgCharacters;

export type OrgAgentStatus = "active" | "inactive" | "configuring" | "error";

export interface OrgAgentInstanceWithConfig extends OrgAgentInstance {
  config: OrgAgentConfig | null;
}

export interface CreateOrgAgentParams {
  organizationId: string;
  agentType: OrgAgentType;
  displayName?: string;
  enabled?: boolean;
  platformConfigs?: {
    discord?: {
      applicationId?: string;
      botToken?: string;
      enabledGuilds?: string[];
    };
    telegram?: {
      botToken?: string;
      enabledChats?: string[];
    };
    twitter?: {
      username?: string;
      email?: string;
      password?: string;
      twoFactorSecret?: string;
    };
  };
  customSettings?: Record<string, unknown>;
  createdBy?: string;
}

export interface UpdateOrgAgentParams {
  displayName?: string;
  enabled?: boolean;
  status?: OrgAgentStatus;
  platformConfigs?: CreateOrgAgentParams["platformConfigs"];
  customSettings?: Record<string, unknown>;
}

export interface OrgAgentWithCharacter {
  instance: OrgAgentInstance;
  config: OrgAgentConfig | null;
  character: Character;
  secrets: Record<string, string>;
}

// =============================================================================
// SERVICE
// =============================================================================

class AgentLifecycleService {
  /**
   * Get or create an org agent instance for an organization.
   * Each org can have one instance of each agent type.
   */
  async getOrCreateInstance(
    organizationId: string,
    agentType: OrgAgentType,
    createdBy?: string
  ): Promise<OrgAgentInstance> {
    // Check for existing instance
    const existing = await this.getInstance(organizationId, agentType);
    if (existing) {
      return existing;
    }

    // Create new instance
    return this.createInstance({
      organizationId,
      agentType,
      createdBy,
    });
  }

  /**
   * Create a new org agent instance for an organization.
   */
  async createInstance(params: CreateOrgAgentParams): Promise<OrgAgentInstance> {
    const { organizationId, agentType, displayName, enabled, createdBy } = params;

    // Validate agent type
    if (!isOrgCharacter(agentType)) {
      throw new Error(`Invalid org agent type: ${agentType}`);
    }

    const character = getOrgCharacter(agentType);
    if (!character) {
      throw new Error(`Character not found for agent type: ${agentType}`);
    }

    // Check if instance already exists
    const existing = await this.getInstance(organizationId, agentType);
    if (existing) {
      throw new Error(`Org agent ${agentType} already exists for organization ${organizationId}`);
    }

    logger.info("[OrgAgentLifecycle] Creating agent instance", {
      organizationId,
      agentType,
      characterName: character.name,
    });

    // Create the instance
    const [instance] = await db
      .insert(orgAgentInstances)
      .values({
        organization_id: organizationId,
        agent_type: agentType,
        display_name: displayName || character.name,
        enabled: enabled ?? false, // Default to disabled until configured
        status: "configuring",
        created_by: createdBy,
      })
      .returning();

    // Create default config if platform configs provided
    if (params.platformConfigs || params.customSettings) {
      await this.createConfig(instance.id, {
        platformConfigs: params.platformConfigs,
        customSettings: params.customSettings,
      });

      // Store secrets securely
      if (params.platformConfigs) {
        await this.storeAgentSecrets(organizationId, instance.id, params.platformConfigs);
      }
    }

    return instance;
  }

  /**
   * Get an org agent instance by organization and type.
   */
  async getInstance(
    organizationId: string,
    agentType: OrgAgentType
  ): Promise<OrgAgentInstance | null> {
    const [instance] = await db
      .select()
      .from(orgAgentInstances)
      .where(
        and(
          eq(orgAgentInstances.organization_id, organizationId),
          eq(orgAgentInstances.agent_type, agentType)
        )
      )
      .limit(1);

    return instance || null;
  }

  /**
   * Get an org agent instance by ID.
   */
  async getInstanceById(instanceId: string): Promise<OrgAgentInstance | null> {
    const [instance] = await db
      .select()
      .from(orgAgentInstances)
      .where(eq(orgAgentInstances.id, instanceId))
      .limit(1);

    return instance || null;
  }

  /**
   * Get all org agent instances for an organization.
   */
  async getOrgInstances(organizationId: string): Promise<OrgAgentInstance[]> {
    return db
      .select()
      .from(orgAgentInstances)
      .where(eq(orgAgentInstances.organization_id, organizationId));
  }

  /**
   * Alias for getOrgInstances for API consistency.
   */
  async listInstances(organizationId: string): Promise<OrgAgentInstance[]> {
    return this.getOrgInstances(organizationId);
  }

  /**
   * Get all enabled org agents for an organization.
   */
  async getEnabledAgents(organizationId: string): Promise<OrgAgentInstance[]> {
    return db
      .select()
      .from(orgAgentInstances)
      .where(
        and(
          eq(orgAgentInstances.organization_id, organizationId),
          eq(orgAgentInstances.enabled, true),
          eq(orgAgentInstances.status, "active")
        )
      );
  }

  /**
   * Get org agent instance with its config and character.
   */
  async getAgentWithCharacter(
    organizationId: string,
    agentType: OrgAgentType
  ): Promise<OrgAgentWithCharacter | null> {
    const instance = await this.getInstance(organizationId, agentType);
    if (!instance) {
      return null;
    }

    const character = getOrgCharacter(agentType);
    if (!character) {
      return null;
    }

    const config = await this.getConfig(instance.id);
    const secrets = await this.getAgentSecrets(organizationId, instance.id);

    return {
      instance,
      config,
      character,
      secrets,
    };
  }

  /**
   * Update an org agent instance.
   */
  async updateInstance(
    instanceId: string,
    params: UpdateOrgAgentParams
  ): Promise<OrgAgentInstance> {
    const instance = await this.getInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Org agent instance not found: ${instanceId}`);
    }

    logger.info("[OrgAgentLifecycle] Updating agent instance", {
      instanceId,
      params,
    });

    const updateData: Partial<OrgAgentInstance> = {
      updated_at: new Date(),
    };

    if (params.displayName !== undefined) {
      updateData.display_name = params.displayName;
    }
    if (params.enabled !== undefined) {
      updateData.enabled = params.enabled;
    }
    if (params.status !== undefined) {
      updateData.status = params.status;
    }

    const [updated] = await db
      .update(orgAgentInstances)
      .set(updateData)
      .where(eq(orgAgentInstances.id, instanceId))
      .returning();

    // Update config if provided
    if (params.platformConfigs || params.customSettings) {
      await this.updateConfig(instanceId, {
        platformConfigs: params.platformConfigs,
        customSettings: params.customSettings,
      });

      // Update secrets if platform configs provided
      if (params.platformConfigs) {
        await this.storeAgentSecrets(
          instance.organization_id,
          instanceId,
          params.platformConfigs
        );
      }
    }

    return updated;
  }

  /**
   * Enable an org agent instance.
   */
  async enableAgent(instanceId: string): Promise<OrgAgentInstance> {
    const instance = await this.getInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Org agent instance not found: ${instanceId}`);
    }

    // Validate that agent is properly configured
    const config = await this.getConfig(instanceId);
    if (!config) {
      throw new Error("Agent must be configured before enabling");
    }

    return this.updateInstance(instanceId, {
      enabled: true,
      status: "active",
    });
  }

  /**
   * Disable an org agent instance.
   */
  async disableAgent(instanceId: string): Promise<OrgAgentInstance> {
    return this.updateInstance(instanceId, {
      enabled: false,
      status: "inactive",
    });
  }

  /**
   * Delete an org agent instance.
   */
  async deleteInstance(instanceId: string): Promise<void> {
    const instance = await this.getInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Org agent instance not found: ${instanceId}`);
    }

    logger.info("[OrgAgentLifecycle] Deleting agent instance", { instanceId });

    // Delete secrets
    await this.deleteAgentSecrets(instance.organization_id, instanceId);

    // Delete config
    await db
      .delete(orgAgentConfigs)
      .where(eq(orgAgentConfigs.instance_id, instanceId));

    // Delete instance
    await db
      .delete(orgAgentInstances)
      .where(eq(orgAgentInstances.id, instanceId));
  }

  // ===========================================================================
  // CONFIG MANAGEMENT
  // ===========================================================================

  /**
   * Create config for an agent instance.
   */
  async createConfig(
    instanceId: string,
    params: {
      platformConfigs?: CreateOrgAgentParams["platformConfigs"];
      customSettings?: Record<string, unknown>;
    }
  ): Promise<OrgAgentConfig> {
    // Remove secrets from platform configs (they're stored separately)
    const sanitizedPlatformConfigs = this.sanitizePlatformConfigs(params.platformConfigs);

    const [config] = await db
      .insert(orgAgentConfigs)
      .values({
        instance_id: instanceId,
        discord_config: sanitizedPlatformConfigs?.discord || null,
        telegram_config: sanitizedPlatformConfigs?.telegram || null,
        twitter_config: sanitizedPlatformConfigs?.twitter || null,
        custom_settings: params.customSettings || null,
      })
      .returning();

    return config;
  }

  /**
   * Get config for an agent instance.
   */
  async getConfig(instanceId: string): Promise<OrgAgentConfig | null> {
    const [config] = await db
      .select()
      .from(orgAgentConfigs)
      .where(eq(orgAgentConfigs.instance_id, instanceId))
      .limit(1);

    return config || null;
  }

  /**
   * Update config for an agent instance.
   */
  async updateConfig(
    instanceId: string,
    params: {
      platformConfigs?: CreateOrgAgentParams["platformConfigs"];
      customSettings?: Record<string, unknown>;
    }
  ): Promise<OrgAgentConfig> {
    const existing = await this.getConfig(instanceId);
    const sanitizedPlatformConfigs = this.sanitizePlatformConfigs(params.platformConfigs);

    if (existing) {
      const [updated] = await db
        .update(orgAgentConfigs)
        .set({
          discord_config: sanitizedPlatformConfigs?.discord ?? existing.discord_config,
          telegram_config: sanitizedPlatformConfigs?.telegram ?? existing.telegram_config,
          twitter_config: sanitizedPlatformConfigs?.twitter ?? existing.twitter_config,
          custom_settings: params.customSettings ?? existing.custom_settings,
          updated_at: new Date(),
        })
        .where(eq(orgAgentConfigs.instance_id, instanceId))
        .returning();

      return updated;
    }

    return this.createConfig(instanceId, params);
  }

  /**
   * Remove secrets from platform configs (stored separately in secrets service).
   */
  private sanitizePlatformConfigs(
    configs?: CreateOrgAgentParams["platformConfigs"]
  ): CreateOrgAgentParams["platformConfigs"] | undefined {
    if (!configs) return undefined;

    return {
      discord: configs.discord
        ? {
            applicationId: configs.discord.applicationId,
            enabledGuilds: configs.discord.enabledGuilds,
            // botToken is stored in secrets
          }
        : undefined,
      telegram: configs.telegram
        ? {
            enabledChats: configs.telegram.enabledChats,
            // botToken is stored in secrets
          }
        : undefined,
      twitter: configs.twitter
        ? {
            username: configs.twitter.username,
            // email, password, twoFactorSecret stored in secrets
          }
        : undefined,
    };
  }

  // ===========================================================================
  // SECRETS MANAGEMENT
  // ===========================================================================

  /**
   * Store secrets for an agent instance.
   */
  private async storeAgentSecrets(
    organizationId: string,
    instanceId: string,
    platformConfigs: CreateOrgAgentParams["platformConfigs"]
  ): Promise<void> {
    if (!secretsService.isConfigured) {
      logger.warn("[OrgAgentLifecycle] Secrets service not configured, skipping");
      return;
    }

    const secrets: Record<string, string> = {};

    if (platformConfigs?.discord?.botToken) {
      secrets.DISCORD_API_TOKEN = platformConfigs.discord.botToken;
    }
    if (platformConfigs?.discord?.applicationId) {
      secrets.DISCORD_APPLICATION_ID = platformConfigs.discord.applicationId;
    }
    if (platformConfigs?.telegram?.botToken) {
      secrets.TELEGRAM_BOT_TOKEN = platformConfigs.telegram.botToken;
    }
    if (platformConfigs?.twitter?.password) {
      secrets.TWITTER_PASSWORD = platformConfigs.twitter.password;
    }
    if (platformConfigs?.twitter?.email) {
      secrets.TWITTER_EMAIL = platformConfigs.twitter.email;
    }
    if (platformConfigs?.twitter?.twoFactorSecret) {
      secrets.TWITTER_2FA_SECRET = platformConfigs.twitter.twoFactorSecret;
    }

    if (Object.keys(secrets).length > 0) {
      await secretsService.upsertBatch({
        organizationId,
        projectId: instanceId, // Use instance ID as project ID for isolation
        secrets,
      });
    }
  }

  /**
   * Get secrets for an agent instance.
   */
  async getAgentSecrets(
    organizationId: string,
    instanceId: string
  ): Promise<Record<string, string>> {
    if (!secretsService.isConfigured) {
      return {};
    }

    return secretsService.getDecrypted({
      organizationId,
      projectId: instanceId,
    });
  }

  /**
   * Delete secrets for an agent instance.
   */
  private async deleteAgentSecrets(
    organizationId: string,
    instanceId: string
  ): Promise<void> {
    if (!secretsService.isConfigured) {
      return;
    }

    // Delete all secrets for this instance
    const secretKeys = [
      "DISCORD_API_TOKEN",
      "DISCORD_APPLICATION_ID",
      "TELEGRAM_BOT_TOKEN",
      "TWITTER_PASSWORD",
      "TWITTER_EMAIL",
      "TWITTER_2FA_SECRET",
    ];

    for (const key of secretKeys) {
      await secretsService.delete({
        organizationId,
        projectId: instanceId,
        key,
      });
    }
  }

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Provision all org agents for a new organization.
   * Creates disabled instances that can be configured later.
   */
  async provisionOrgAgents(
    organizationId: string,
    createdBy?: string
  ): Promise<OrgAgentInstance[]> {
    logger.info("[OrgAgentLifecycle] Provisioning org agents", { organizationId });

    const instances: OrgAgentInstance[] = [];

    for (const agentType of ORG_CHARACTER_IDS) {
      const existing = await this.getInstance(organizationId, agentType);
      if (!existing) {
        const instance = await this.createInstance({
          organizationId,
          agentType,
          createdBy,
        });
        instances.push(instance);
      } else {
        instances.push(existing);
      }
    }

    return instances;
  }

  /**
   * Get a summary of org agent status for an organization.
   */
  async getOrgAgentSummary(organizationId: string): Promise<{
    total: number;
    enabled: number;
    configured: number;
    byAgent: Record<OrgAgentType, { enabled: boolean; status: OrgAgentStatus; configured: boolean }>;
  }> {
    const instances = await this.getOrgInstances(organizationId);
    const configs = await db
      .select()
      .from(orgAgentConfigs)
      .where(
        inArray(
          orgAgentConfigs.instance_id,
          instances.map((i) => i.id)
        )
      );

    const configMap = new Map(configs.map((c) => [c.instance_id, c]));

    const byAgent = {} as Record<
      OrgAgentType,
      { enabled: boolean; status: OrgAgentStatus; configured: boolean }
    >;

    for (const agentType of ORG_CHARACTER_IDS) {
      const instance = instances.find((i) => i.agent_type === agentType);
      byAgent[agentType] = {
        enabled: instance?.enabled ?? false,
        status: (instance?.status as OrgAgentStatus) ?? "inactive",
        configured: instance ? configMap.has(instance.id) : false,
      };
    }

    return {
      total: ORG_CHARACTER_IDS.length,
      enabled: instances.filter((i) => i.enabled).length,
      configured: configs.length,
      byAgent,
    };
  }

  // ===========================================================================
  // ACTIVITY LOGGING
  // ===========================================================================

  /**
   * Log activity for an agent instance.
   */
  async logActivity(
    instanceId: string,
    params: {
      action: string;
      userId?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void> {
    // Update last_activity_at on the instance
    await db
      .update(orgAgentInstances)
      .set({ last_activity_at: new Date() })
      .where(eq(orgAgentInstances.id, instanceId));

    logger.info("[OrgAgentLifecycle] Activity logged", {
      instanceId,
      action: params.action,
      userId: params.userId,
    });
  }

  // ===========================================================================
  // CHARACTER BUILDING
  // ===========================================================================

  /**
   * Build a fully configured character for an org agent instance.
   * Merges base character with org-specific config and secrets.
   */
  async buildConfiguredCharacter(
    organizationId: string,
    agentType: OrgAgentType
  ): Promise<Character> {
    const agentData = await this.getAgentWithCharacter(organizationId, agentType);
    if (!agentData) {
      throw new Error(`Org agent ${agentType} not found for organization ${organizationId}`);
    }

    const { character, config, secrets } = agentData;

    // Build settings with org-specific overrides
    const settings: Record<string, unknown> = {
      ...(character.settings || {}),
      // Inject secrets
      secrets: {
        ...((character.settings?.secrets as Record<string, string>) || {}),
        ...secrets,
      },
    };

    // Apply custom settings from config
    if (config?.custom_settings) {
      Object.assign(settings, config.custom_settings);
    }

    // Apply platform-specific settings
    if (config?.discord_config) {
      settings.discord = {
        ...((settings.discord as Record<string, unknown>) || {}),
        ...config.discord_config,
      };
    }
    if (config?.telegram_config) {
      settings.telegram = {
        ...((settings.telegram as Record<string, unknown>) || {}),
        ...config.telegram_config,
      };
    }
    if (config?.twitter_config) {
      settings.twitter = {
        ...((settings.twitter as Record<string, unknown>) || {}),
        ...config.twitter_config,
      };
    }

    // Build unique ID for this org's agent instance
    const instanceId = `${agentType}-${organizationId.substring(0, 8)}`;

    return {
      ...character,
      id: instanceId as `${string}-${string}-${string}-${string}-${string}`,
      settings,
    };
  }
}

// Export singleton instance
export const agentLifecycleService = new AgentLifecycleService();

// Legacy alias for backwards compatibility
export const orgAgentLifecycleService = agentLifecycleService;

