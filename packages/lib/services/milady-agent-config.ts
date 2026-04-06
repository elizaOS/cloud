export const MILADY_INTERNAL_CONFIG_PREFIX = "__milady";
export const MILADY_CHARACTER_OWNERSHIP_KEY = "__miladyCharacterOwnership";
export const MILADY_REUSE_EXISTING_CHARACTER = "reuse-existing";
export const MILADY_MANAGED_DISCORD_KEY = "__miladyManagedDiscord";
export const MILADY_MANAGED_GITHUB_KEY = "__miladyManagedGithub";

export interface ManagedMiladyDiscordBinding {
  mode: "cloud-managed";
  applicationId?: string;
  guildId: string;
  guildName: string;
  adminDiscordUserId: string;
  adminDiscordUsername: string;
  adminDiscordDisplayName?: string;
  adminElizaUserId: string;
  botNickname?: string;
  connectedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cloneAgentConfig(agentConfig?: Record<string, unknown> | null): Record<string, unknown> {
  return asRecord(agentConfig) ? { ...agentConfig } : {};
}

export function stripReservedMiladyConfigKeys(
  agentConfig?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!agentConfig) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(agentConfig).filter(
      ([key]) => !key.toLowerCase().startsWith(MILADY_INTERNAL_CONFIG_PREFIX),
    ),
  );
}

export function withReusedMiladyCharacterOwnership(
  agentConfig?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...stripReservedMiladyConfigKeys(agentConfig),
    [MILADY_CHARACTER_OWNERSHIP_KEY]: MILADY_REUSE_EXISTING_CHARACTER,
  };
}

export function reusesExistingMiladyCharacter(
  agentConfig?: Record<string, unknown> | null,
): boolean {
  return agentConfig?.[MILADY_CHARACTER_OWNERSHIP_KEY] === MILADY_REUSE_EXISTING_CHARACTER;
}

export function readManagedMiladyDiscordBinding(
  agentConfig?: Record<string, unknown> | null,
): ManagedMiladyDiscordBinding | null {
  const binding = asRecord(agentConfig?.[MILADY_MANAGED_DISCORD_KEY]);
  if (!binding) {
    return null;
  }

  const guildId = typeof binding.guildId === "string" ? binding.guildId.trim() : "";
  const guildName = typeof binding.guildName === "string" ? binding.guildName.trim() : "";
  const adminDiscordUserId =
    typeof binding.adminDiscordUserId === "string" ? binding.adminDiscordUserId.trim() : "";
  const adminDiscordUsername =
    typeof binding.adminDiscordUsername === "string" ? binding.adminDiscordUsername.trim() : "";
  const adminElizaUserId =
    typeof binding.adminElizaUserId === "string" ? binding.adminElizaUserId.trim() : "";
  const connectedAt = typeof binding.connectedAt === "string" ? binding.connectedAt.trim() : "";

  if (!guildId || !guildName || !adminDiscordUserId || !adminDiscordUsername || !adminElizaUserId) {
    return null;
  }

  return {
    mode: "cloud-managed",
    guildId,
    guildName,
    adminDiscordUserId,
    adminDiscordUsername,
    adminElizaUserId,
    connectedAt: connectedAt || new Date(0).toISOString(),
    ...(typeof binding.applicationId === "string" && binding.applicationId.trim()
      ? { applicationId: binding.applicationId.trim() }
      : {}),
    ...(typeof binding.adminDiscordDisplayName === "string" &&
    binding.adminDiscordDisplayName.trim()
      ? { adminDiscordDisplayName: binding.adminDiscordDisplayName.trim() }
      : {}),
    ...(typeof binding.botNickname === "string" && binding.botNickname.trim()
      ? { botNickname: binding.botNickname.trim() }
      : {}),
  };
}

export function withManagedMiladyDiscordBinding(
  agentConfig: Record<string, unknown> | null | undefined,
  binding: ManagedMiladyDiscordBinding,
): Record<string, unknown> {
  const next = cloneAgentConfig(agentConfig);
  next[MILADY_MANAGED_DISCORD_KEY] = {
    mode: "cloud-managed",
    guildId: binding.guildId,
    guildName: binding.guildName,
    adminDiscordUserId: binding.adminDiscordUserId,
    adminDiscordUsername: binding.adminDiscordUsername,
    adminElizaUserId: binding.adminElizaUserId,
    connectedAt: binding.connectedAt,
    ...(binding.applicationId ? { applicationId: binding.applicationId } : {}),
    ...(binding.adminDiscordDisplayName
      ? { adminDiscordDisplayName: binding.adminDiscordDisplayName }
      : {}),
    ...(binding.botNickname ? { botNickname: binding.botNickname } : {}),
  };
  return next;
}

export function withoutManagedMiladyDiscordBinding(
  agentConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = cloneAgentConfig(agentConfig);
  delete next[MILADY_MANAGED_DISCORD_KEY];
  return next;
}

// --- GitHub managed binding ---

export interface ManagedMiladyGithubBinding {
  mode: "cloud-managed";
  connectionId: string;
  githubUserId: string;
  githubUsername: string;
  githubDisplayName?: string;
  githubAvatarUrl?: string;
  githubEmail?: string;
  scopes: string[];
  adminElizaUserId: string;
  connectedAt: string;
}

export function readManagedMiladyGithubBinding(
  agentConfig?: Record<string, unknown> | null,
): ManagedMiladyGithubBinding | null {
  const binding = asRecord(agentConfig?.[MILADY_MANAGED_GITHUB_KEY]);
  if (!binding) {
    return null;
  }

  const connectionId = typeof binding.connectionId === "string" ? binding.connectionId.trim() : "";
  const githubUserId = typeof binding.githubUserId === "string" ? binding.githubUserId.trim() : "";
  const githubUsername =
    typeof binding.githubUsername === "string" ? binding.githubUsername.trim() : "";
  const adminElizaUserId =
    typeof binding.adminElizaUserId === "string" ? binding.adminElizaUserId.trim() : "";
  const connectedAt = typeof binding.connectedAt === "string" ? binding.connectedAt.trim() : "";

  if (!connectionId || !githubUserId || !githubUsername || !adminElizaUserId) {
    return null;
  }

  return {
    mode: "cloud-managed",
    connectionId,
    githubUserId,
    githubUsername,
    adminElizaUserId,
    connectedAt: connectedAt || new Date(0).toISOString(),
    scopes: Array.isArray(binding.scopes) ? binding.scopes : [],
    ...(typeof binding.githubDisplayName === "string" && binding.githubDisplayName.trim()
      ? { githubDisplayName: binding.githubDisplayName.trim() }
      : {}),
    ...(typeof binding.githubAvatarUrl === "string" && binding.githubAvatarUrl.trim()
      ? { githubAvatarUrl: binding.githubAvatarUrl.trim() }
      : {}),
    ...(typeof binding.githubEmail === "string" && binding.githubEmail.trim()
      ? { githubEmail: binding.githubEmail.trim() }
      : {}),
  };
}

export function withManagedMiladyGithubBinding(
  agentConfig: Record<string, unknown> | null | undefined,
  binding: ManagedMiladyGithubBinding,
): Record<string, unknown> {
  const next = cloneAgentConfig(agentConfig);
  next[MILADY_MANAGED_GITHUB_KEY] = {
    mode: "cloud-managed",
    connectionId: binding.connectionId,
    githubUserId: binding.githubUserId,
    githubUsername: binding.githubUsername,
    adminElizaUserId: binding.adminElizaUserId,
    connectedAt: binding.connectedAt,
    scopes: binding.scopes,
    ...(binding.githubDisplayName ? { githubDisplayName: binding.githubDisplayName } : {}),
    ...(binding.githubAvatarUrl ? { githubAvatarUrl: binding.githubAvatarUrl } : {}),
    ...(binding.githubEmail ? { githubEmail: binding.githubEmail } : {}),
  };
  return next;
}

export function withoutManagedMiladyGithubBinding(
  agentConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = cloneAgentConfig(agentConfig);
  delete next[MILADY_MANAGED_GITHUB_KEY];
  return next;
}
