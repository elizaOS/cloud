export const MILADY_INTERNAL_CONFIG_PREFIX = "__milady";
export const MILADY_CHARACTER_OWNERSHIP_KEY = "__miladyCharacterOwnership";
export const MILADY_REUSE_EXISTING_CHARACTER = "reuse-existing";

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
  return (
    agentConfig?.[MILADY_CHARACTER_OWNERSHIP_KEY] ===
    MILADY_REUSE_EXISTING_CHARACTER
  );
}
