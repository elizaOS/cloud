"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useContext, useEffect, useState } from "react";
import { LocalStewardAuthContext } from "@/lib/providers/StewardProvider";

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

const STEWARD_TOKEN_KEY = "steward_session_token";

function decodeStewardToken(token: string): {
  id: string;
  email: string;
  walletAddress?: string;
  exp?: number;
} | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    return {
      id: payload.userId ?? payload.sub ?? "",
      email: payload.email ?? "",
      walletAddress: payload.address ?? undefined,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Read a valid non-expired Steward session directly from localStorage. */
function readStewardSessionFromStorage(): StewardSessionUser {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(STEWARD_TOKEN_KEY);
    if (!token) return null;
    const decoded = decodeStewardToken(token);
    if (!decoded) return null;
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }
    if (!decoded.id) return null;
    return {
      id: decoded.id,
      email: decoded.email,
      walletAddress: decoded.walletAddress,
    };
  } catch {
    return null;
  }
}

/**
 * Safe wrapper around @stwd/react useAuth that returns fallback defaults
 * when called outside <StewardProvider>.
 */
/**
 * Safe wrapper around the Steward auth context that returns a fallback when
 * StewardProvider is not mounted. Reads the context directly instead of
 * calling useAuth() inside try/catch (which violates Rules of Hooks).
 */
export function useStewardAuth() {
  const ctx = useContext(LocalStewardAuthContext);
  return ctx ?? STEWARD_AUTH_FALLBACK;
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
  const providerAuth = useStewardAuth();

  // Read directly from localStorage as a fallback / source of truth when the
  // @stwd/react provider is slow or flaky to initialize from storage.
  const [storageUser, setStorageUser] = useState<StewardSessionUser>(null);

  useEffect(() => {
    // Sync on mount
    setStorageUser(readStewardSessionFromStorage());

    // Keep in sync across tabs + when our own code updates the token
    const handler = () => setStorageUser(readStewardSessionFromStorage());
    window.addEventListener("storage", handler);
    window.addEventListener("steward-token-sync", handler);
    // Poll once more after a tick in case login just completed
    const t = setTimeout(handler, 250);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("steward-token-sync", handler);
      clearTimeout(t);
    };
  }, []);

  const stewardUser = providerAuth.user ?? storageUser;
  const stewardAuthenticated = providerAuth.isAuthenticated || storageUser !== null;

  // When Steward is the configured auth provider, don't gate `ready` on
  // Privy's SDK init — Privy is just a stub context here and may never
  // resolve `privyReady` if NEXT_PUBLIC_PRIVY_APP_ID is a placeholder.
  // Without this, the dashboard spinner hangs forever in steward-only setups.
  const stewardAuthEnabled = process.env.NEXT_PUBLIC_STEWARD_AUTH_ENABLED === "true";
  const ready = stewardAuthEnabled ? !providerAuth.isLoading : privyReady && !providerAuth.isLoading;
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
