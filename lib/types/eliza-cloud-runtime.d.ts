/**
 * Eliza Cloud Runtime Types
 *
 * Type definitions for the __ELIZA_CLOUD__ global object
 * injected into all apps.
 *
 * Usage in app:
 * ```typescript
 * /// <reference types="@elizaos/cloud-types" />
 * // or
 * import type { ElizaCloudRuntime, PlatformCredential } from '@elizaos/cloud-types';
 *
 * const user = await __ELIZA_CLOUD__.getUser();
 * const creds = await __ELIZA_CLOUD__.getCredentials();
 * ```
 */

export interface ElizaCloudUser {
  id: string;
  email: string;
  name?: string;
  nickname?: string;
  avatar?: string;
  walletAddress?: string;
  walletChainType?: string;
  createdAt: string;
}

export interface ElizaCloudOrganization {
  id: string;
  name?: string;
  creditBalance?: number;
}

export interface ElizaCloudUserResponse {
  success: boolean;
  user: ElizaCloudUser;
  organization: ElizaCloudOrganization;
}

export type PlatformType =
  | "discord"
  | "twitter"
  | "google"
  | "gmail"
  | "github"
  | "slack"
  | "telegram";

export interface PlatformCredential {
  id: string;
  platform: PlatformType;
  platformUserId: string;
  platformUsername?: string;
  platformDisplayName?: string;
  platformAvatarUrl?: string;
  status: "pending" | "active" | "expired" | "revoked" | "error";
  scopes?: string[];
  linkedAt?: string;
  lastUsedAt?: string;
}

export interface PlatformTokenResponse {
  platform: PlatformType;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
  refreshed: boolean;
}

export interface ConnectPlatformOptions {
  /** Custom OAuth scopes to request */
  scopes?: string[];
}

export interface CredentialSessionStatus {
  status: "pending" | "completed" | "expired" | "failed" | "not_found";
  credentialId?: string;
  error?: string;
}

export interface StoredSecret {
  name: string;
  description?: string;
  createdAt: string;
}

export type BotPlatformType = "discord" | "telegram" | "twitter";

export interface BotConnection {
  id: string;
  platform: BotPlatformType;
  botId: string;
  botUsername: string;
  botName?: string;
  status: "active" | "error" | "disconnected";
  errorMessage?: string;
  connectedAt?: string;
  servers?: BotServer[];
}

export interface BotServer {
  id: string;
  serverId: string;
  serverName: string;
  serverIcon?: string;
  memberCount?: number;
  enabled: boolean;
  enabledAgents?: string[];
}

export interface BotConnectResult {
  bot: BotConnection;
  servers?: BotServer[];
}

export interface ElizaCloudRuntime {
  /** App ID for this app */
  readonly appId: string;

  /** Subdomain this app is served from */
  readonly subdomain: string;

  /** Custom domain (if configured) */
  readonly customDomain: string | null;

  /** Base URL for this app */
  readonly baseUrl: string;

  /** Eliza Cloud URL */
  readonly cloudUrl: string;

  /** App API URL */
  readonly apiUrl: string;

  /** Runtime configuration from bundle */
  readonly config: Record<string, boolean | string>;

  // =========================================================================
  // Authentication
  // =========================================================================

  /**
   * Get the current authenticated user.
   * @returns User info if authenticated, null otherwise
   */
  getUser(): Promise<ElizaCloudUserResponse | null>;

  /**
   * Redirect to login page.
   * @param provider - OAuth provider (default: "google")
   */
  login(provider?: string): void;

  /**
   * Log out the current user.
   */
  logout(): Promise<void>;

  // =========================================================================
  // Platform Credentials
  // =========================================================================

  /**
   * Get all connected platform credentials for the current user.
   * @returns List of credentials with platform, status, username
   */
  getCredentials(): Promise<PlatformCredential[]>;

  /**
   * Check if a specific platform is connected.
   * @param platform - Platform to check
   * @returns Credential info if connected, null otherwise
   */
  getCredential(platform: PlatformType): Promise<PlatformCredential | null>;

  /**
   * Connect a platform account via OAuth popup.
   * Opens a popup for the user to authorize, returns when complete.
   *
   * @example
   * ```typescript
   * try {
   *   const credential = await __ELIZA_CLOUD__.connectPlatform('discord');
   *   console.log('Connected:', credential.platformUsername);
   * } catch (err) {
   *   console.error('Failed to connect:', err.message);
   * }
   * ```
   *
   * @param platform - Platform to connect
   * @param options - Optional: { scopes: string[] }
   * @returns Connected credential info
   * @throws Error if popup blocked, authorization cancelled, or failed
   */
  connectPlatform(
    platform: PlatformType,
    options?: ConnectPlatformOptions
  ): Promise<PlatformCredential>;

  /**
   * Disconnect a platform credential.
   * @param platform - Platform to disconnect
   * @returns true if successful
   */
  disconnectPlatform(platform: PlatformType): Promise<boolean>;

  /**
   * Get the access token for a connected platform.
   * Automatically refreshes if expired.
   *
   * @example
   * ```typescript
   * const { accessToken } = await __ELIZA_CLOUD__.getPlatformToken('discord');
   * const response = await fetch('https://discord.com/api/users/@me', {
   *   headers: { Authorization: `Bearer ${accessToken}` }
   * });
   * ```
   *
   * @param platform - Platform to get token for
   * @returns Token data including accessToken, refreshToken, expiresAt
   * @throws Error if platform not connected
   */
  getPlatformToken(platform: PlatformType): Promise<PlatformTokenResponse>;

  // =========================================================================
  // Secrets (encrypted storage)
  // =========================================================================

  /**
   * Get a secret value by name. Decrypted at runtime.
   * @param name - Secret name (e.g., "OPENAI_API_KEY")
   * @returns Decrypted value or null if not found
   */
  getSecret(name: string): Promise<string | null>;

  /**
   * Store a secret. Value is encrypted at rest.
   * @param name - Secret name
   * @param value - Secret value
   * @param description - Optional description
   * @returns true if successful
   */
  setSecret(name: string, value: string, description?: string): Promise<boolean>;

  /**
   * Delete a secret.
   * @param name - Secret name
   * @returns true if successful
   */
  deleteSecret(name: string): Promise<boolean>;

  /**
   * List all stored secrets (names only, not values).
   * @returns List of secret metadata
   */
  listSecrets(): Promise<StoredSecret[]>;

  // =========================================================================
  // Bot Connections (Discord/Telegram/Twitter bots)
  // =========================================================================

  /**
   * Get all connected bot accounts.
   * @returns List of bot connections
   */
  getBots(): Promise<BotConnection[]>;

  /**
   * Get a specific bot connection.
   * @param id - Bot connection ID
   * @returns Bot info or null if not found
   */
  getBot(id: string): Promise<BotConnection | null>;

  /**
   * Connect a bot account using its token.
   *
   * @example
   * ```typescript
   * const result = await __ELIZA_CLOUD__.connectBot('discord', 'BOT_TOKEN_HERE');
   * console.log('Connected:', result.bot.botUsername, 'Servers:', result.servers);
   * ```
   *
   * @param platform - "discord" | "telegram" | "twitter"
   * @param token - Bot token (Discord/Telegram) or credentials
   * @returns Bot connection and discovered servers
   * @throws Error if token invalid
   */
  connectBot(platform: BotPlatformType, token: string): Promise<BotConnectResult>;

  /**
   * Disconnect a bot account.
   * @param id - Bot connection ID
   * @returns true if successful
   */
  disconnectBot(id: string): Promise<boolean>;

  // =========================================================================
  // Storage (unencrypted)
  // =========================================================================

  /**
   * Get a value from app storage.
   * @param key - Storage key
   * @returns Stored value or null
   */
  getStorage<T = unknown>(key: string): Promise<T | null>;

  /**
   * Set a value in app storage.
   * @param key - Storage key
   * @param value - Value to store
   * @returns true if successful
   */
  setStorage(key: string, value: unknown): Promise<boolean>;

  // =========================================================================
  // API Proxy
  // =========================================================================

  /**
   * Make a proxied API request to Eliza Cloud.
   * @param path - API path (e.g., "/agents")
   * @param options - Fetch options
   * @returns Fetch response
   */
  fetch(path: string, options?: RequestInit): Promise<Response>;
}

// Global declaration
declare global {
  interface Window {
    __ELIZA_CLOUD__: ElizaCloudRuntime;
  }

  const __ELIZA_CLOUD__: ElizaCloudRuntime;
}

export {};

