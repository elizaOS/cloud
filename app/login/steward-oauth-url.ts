const DEFAULT_STEWARD_API_URL =
  process.env.NEXT_PUBLIC_STEWARD_API_URL || "https://eliza.steward.fi";
const DEFAULT_STEWARD_TENANT_ID = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID || "elizacloud";

export type StewardOAuthProvider = "google" | "discord" | "github";

export function buildStewardOAuthAuthorizeUrl(
  provider: StewardOAuthProvider,
  origin: string,
  options?: {
    stewardApiUrl?: string;
    stewardTenantId?: string;
  },
): string {
  const redirectUri = `${origin}/login`;
  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    tenant_id: options?.stewardTenantId ?? DEFAULT_STEWARD_TENANT_ID,
  });

  return `${options?.stewardApiUrl ?? DEFAULT_STEWARD_API_URL}/auth/oauth/${provider}/authorize?${params.toString()}`;
}
