"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAuth as useStewardAuth } from "@stwd/react";

export type SessionAuthSource = "none" | "privy" | "steward" | "both";

export type PrivySessionUser = ReturnType<typeof usePrivy>["user"];
export type StewardSessionUser = ReturnType<typeof useStewardAuth>["user"];
export type SessionUser = PrivySessionUser | StewardSessionUser;

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
    stewardUser,
    user: privyUser || stewardUser,
  };
}
