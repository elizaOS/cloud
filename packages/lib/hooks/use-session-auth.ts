"use client";

import { useContext, useEffect, useState } from "react";
import { LocalStewardAuthContext } from "@/lib/providers/StewardProvider";

export type SessionAuthSource = "none" | "steward";

export type StewardSessionUser = { id: string; email: string; walletAddress?: string } | null;
export type SessionUser = StewardSessionUser;

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
  stewardAuthenticated: boolean;
  stewardUser: StewardSessionUser;
  user: SessionUser;
}

export function useSessionAuth(): SessionAuthState {
  const providerAuth = useStewardAuth();

  // Read directly from localStorage as a fallback / source of truth when the
  // @stwd/react provider is slow or flaky to initialize from storage.
  const [storageUser, setStorageUser] = useState<StewardSessionUser>(null);

  useEffect(() => {
    setStorageUser(readStewardSessionFromStorage());

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

  const ready = !providerAuth.isLoading;
  const authenticated = stewardAuthenticated;
  const authSource: SessionAuthSource = stewardAuthenticated ? "steward" : "none";

  return {
    ready,
    authenticated,
    authSource,
    stewardAuthenticated,
    stewardUser: stewardUser as StewardSessionUser,
    user: stewardUser as StewardSessionUser,
  };
}
