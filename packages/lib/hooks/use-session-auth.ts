"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAuth as useStewardAuthRaw } from "@stwd/react";

export type SessionAuthSource = "none" | "privy" | "steward" | "both";

export type PrivySessionUser = ReturnType<typeof usePrivy>["user"];
export type StewardSessionUser = { id: string; email: string; walletAddress?: string } | null;
export type SessionUser = PrivySessionUser | StewardSessionUser;

/** Default state when StewardProvider is not mounted */
const STEWARD_AUTH_FALLBACK = {
  isAuthenticated: false,
  isLoading: false,
  user: null as StewardSessionUser,
  session: null,
  signOut: () => {},
  getToken: () => null,
} as const;

/**
 * Safe wrapper around @stwd/react useAuth that returns fallback defaults
 * when called outside <StewardProvider> (e.g. when steward auth is disabled).
 *
 * The try/catch is intentional — useAuth throws if the context is missing,
 * and we need graceful degradation when StewardProvider is conditionally mounted.
 */
// biome-ignore lint/correctness/useHookAtTopLevel: intentional try/catch for missing provider
export function useStewardAuth() {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: see above
    return useStewardAuthRaw();
  } catch {
    return STEWARD_AUTH_FALLBACK;
  }
}

export interface SessionAuthState {
  ready: boolean;
  authenticated: boolean;
  authSource: SessionAuthSource;
  privyAuthenticated: boolean;
  stewardAuthenticated: boolean;
  privyUser: PrivySessionUser;
  stewardUser: StewardSessionUser;
  user: SessionUser;
}

export function useSessionAuth(): SessionAuthState {
  const { ready: privyReady, authenticated: privyAuthenticated, user: privyUser } = usePrivy();
  const {
    isAuthenticated: stewardAuthenticated,
    isLoading: stewardLoading,
    user: stewardUser,
  } = useStewardAuth();

  const ready = privyReady && !stewardLoading;
  const authenticated = privyAuthenticated || stewardAuthenticated;

  const authSource: SessionAuthSource = privyAuthenticated
    ? stewardAuthenticated
      ? "both"
      : "privy"
    : stewardAuthenticated
      ? "steward"
      : "none";

  return {
    ready,
    authenticated,
    authSource,
    privyAuthenticated,
    stewardAuthenticated,
    privyUser,
    stewardUser: stewardUser as StewardSessionUser,
    user: privyUser || (stewardUser as StewardSessionUser),
  };
}
