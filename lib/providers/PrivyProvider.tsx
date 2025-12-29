"use client";

/**
 * Privy Provider - Legacy Compatibility Layer
 *
 * This module re-exports OAuth3 functionality for backwards compatibility.
 * All Privy-specific code has been replaced with OAuth3.
 *
 * Migration: Components should import from OAuth3Provider directly.
 * This file is maintained for backwards compatibility only.
 */

import OAuth3Provider, {
  useOAuth3,
  OAuth3AuthWrapper,
  useLoginWithEmail,
  useLoginWithOAuth,
  type OAuth3User,
  type OAuth3Session,
  type OAuth3Provider as OAuth3ProviderType,
} from "./OAuth3Provider";

// Re-export the hook with Privy-compatible name
export const usePrivy = useOAuth3;

// Re-export with both names for flexibility
export { useOAuth3 };

// Re-export login hooks
export { useLoginWithEmail, useLoginWithOAuth };

// Create a useLogin hook for backwards compatibility
export function useLogin() {
  const { login, ready, authenticated } = useOAuth3();
  return { login, ready, authenticated };
}

// Re-export utility hooks
export { useLogout, useLinkAccount, useWallets, useFundWallet } from "./OAuth3Provider";

// Re-export types with Privy-compatible names
export type PrivyUser = OAuth3User;
export type PrivySession = OAuth3Session;
export type PrivyProviderType = OAuth3ProviderType;

// Re-export OAuth3 types directly as well
export type { OAuth3User, OAuth3Session, OAuth3ProviderType as OAuth3Provider };

// Re-export the auth wrapper
export const PrivyAuthWrapper = OAuth3AuthWrapper;
export { OAuth3AuthWrapper };

// Re-export the default provider
export default OAuth3Provider;

/**
 * Compatibility type for components that destructure usePrivy result
 * Maps OAuth3 properties to Privy-compatible names
 */
export interface PrivyContextValue {
  ready: boolean;
  authenticated: boolean;
  user: OAuth3User | null;
  login: (provider?: OAuth3ProviderType) => Promise<void>;
  logout: () => Promise<void>;
  connectWallet: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  exportWallet: () => Promise<void>;
  linkWallet?: () => Promise<void>;
  linkEmail?: () => Promise<void>;
  linkGoogle?: () => Promise<void>;
  linkTwitter?: () => Promise<void>;
  linkDiscord?: () => Promise<void>;
  linkFarcaster?: () => Promise<void>;
}
