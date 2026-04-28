"use client";

import { StewardProvider, useAuth as useStewardAuth } from "@stwd/react";
import { StewardAuth, StewardClient } from "@stwd/sdk";
import { createContext, useEffect, useMemo, useRef } from "react";

/**
 * Steward auth provider for Eliza Cloud.
 *
 * Mirrors the PrivyProvider pattern: wraps children in an auth context,
 * syncs JWT tokens to a global API client, and validates env config on mount.
 *
 * Requires NEXT_PUBLIC_STEWARD_API_URL to be set.
 * Optional: NEXT_PUBLIC_STEWARD_TENANT_ID for multi-tenant setups.
 */

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("your_steward_") ||
    normalized.includes("your-steward-") ||
    normalized.includes("replace_with") ||
    normalized.includes("placeholder")
  );
}

/**
 * Inner wrapper that syncs the Steward JWT to a global API client
 * so authenticated requests outside React components work correctly.
 */
const STEWARD_TOKEN_KEY = "steward_session_token";
const STEWARD_REFRESH_TOKEN_KEY = "steward_refresh_token";

export const LocalStewardAuthContext = createContext<ReturnType<typeof useStewardAuth> | null>(
  null,
);

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STEWARD_TOKEN_KEY);
  } catch {
    return null;
  }
}

function readStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STEWARD_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function tokenIsExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

/**
 * Syncs the Steward JWT from localStorage to a server cookie so Next.js
 * server components can read it. Works independent of @stwd/react's internal
 * auth state (which can be slow/flaky to initialize from storage during
 * hydration) by reading localStorage directly.
 */
/** How often to check token expiry and trigger refresh (ms) */
const REFRESH_CHECK_INTERVAL_MS = 60_000; // 1 min
/** Refresh when fewer than this many seconds remain */
const REFRESH_AHEAD_SECS = 120;

function tokenSecsRemaining(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (!payload.exp) return null;
    return payload.exp - Date.now() / 1000;
  } catch {
    return null;
  }
}

/**
 * Wipe every trace of an in-browser Steward / Privy session.
 *
 * Use this when the SERVER has rejected a token that locally still looks
 * valid (JWT decodes with future exp, but DELETE/POST /api/auth/steward-session
 * returned 401, or the user's session was revoked / db reset / cookies
 * cleared on one device but not another). Without this, a stale-but-not-
 * expired token sits in localStorage, useSessionAuth() reports
 * authenticated=true, every authed call 401s, and pages that gate UI on
 * `authenticated` get stuck in dead-end loading states (notably
 * /auth/cli-login).
 *
 * Safe to call multiple times. Best-effort: ignores fetch / storage errors.
 * Dispatches `steward-token-sync` so any listener (useSessionAuth, etc.)
 * recomputes auth state and re-renders the user back to a login surface.
 */
export function clearStaleStewardSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STEWARD_TOKEN_KEY);
    localStorage.removeItem(STEWARD_REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
  // Best-effort: clear any Privy state too, so we don't trip the same
  // bug from the other auth provider.
  try {
    const privyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("privy:")) privyKeys.push(key);
    }
    for (const key of privyKeys) localStorage.removeItem(key);
  } catch {
    // ignore
  }
  // Server-side cookies (HttpOnly — JS can't touch them directly).
  fetch("/api/auth/steward-session", { method: "DELETE" }).catch(() => {});
  // Notify any in-tab listeners; the "storage" event covers cross-tab.
  try {
    window.dispatchEvent(new CustomEvent("steward-token-sync"));
  } catch {
    // ignore
  }
}

function AuthTokenSync({ children }: { children: React.ReactNode }) {
  const auth = useStewardAuth();
  const { isAuthenticated, user } = auth;
  const lastSyncedToken = useRef<string | null>(null);
  const lastSyncedRefreshToken = useRef<string | null>(null);
  const wasAuthenticated = useRef(false);
  const authInstanceRef = useRef<InstanceType<typeof StewardAuth> | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_STEWARD_API_URL ?? "http://localhost:3200";
  const tenantId = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID;

  // Create a standalone StewardAuth for refresh purposes (uses localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    authInstanceRef.current = new StewardAuth({
      baseUrl: apiUrl,
      ...(tenantId ? { tenantId } : {}),
    });
  }, [apiUrl, tenantId]);

  // Sync localStorage token → cookie and keep it alive via auto-refresh
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run trigger
  useEffect(() => {
    const syncToken = () => {
      const token = readStoredToken();
      const refreshToken = readStoredRefreshToken();
      if (!token) {
        // No token at all — clear the server cookie if we had one
        if (wasAuthenticated.current && lastSyncedToken.current) {
          lastSyncedToken.current = null;
          lastSyncedRefreshToken.current = null;
          wasAuthenticated.current = false;
          fetch("/api/auth/steward-session", { method: "DELETE" }).catch(() => {});
        }
        return;
      }

      // If the token is expired, don't push it to the server (the server would
      // reject it anyway), but don't delete the cookie either — the refresh
      // path may recover. Only explicit sign-out clears cookies.
      if (tokenIsExpired(token)) return;

      if (token === lastSyncedToken.current && refreshToken === lastSyncedRefreshToken.current) {
        return;
      }
      lastSyncedToken.current = token;
      lastSyncedRefreshToken.current = refreshToken;
      wasAuthenticated.current = true;

      fetch("/api/auth/steward-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, refreshToken }),
      })
        .then((res) => {
          if (res.status === 401) {
            // Server says this token is invalid even though it decodes as
            // non-expired locally — it was revoked, the signing key
            // rotated, or the user's session was wiped. Trying to use it
            // anywhere in the app will 401 forever and trap pages that
            // gate on `authenticated` (useSessionAuth) in dead-end
            // loading states. Wipe it now so the next render falls back
            // to "logged out" and the user can sign in fresh.
            console.warn("[steward] Stored token rejected by server (401) — clearing");
            // Also reset our in-memory sync sentinels so any subsequent
            // legitimate sign-in can re-sync.
            lastSyncedToken.current = null;
            lastSyncedRefreshToken.current = null;
            wasAuthenticated.current = false;
            clearStaleStewardSession();
          }
        })
        .catch((err) => console.warn("[steward] Failed to set session cookie", err));

      window.dispatchEvent(
        new CustomEvent("steward-token-sync", {
          detail: { token, userId: user?.id },
        }),
      );
    };

    const checkAndRefresh = async () => {
      const token = readStoredToken();
      if (!token) return;

      const secs = tokenSecsRemaining(token);

      // Refresh eagerly when the token is within the lookahead window OR
      // already expired (e.g. tab was idle longer than 15 min). Dropping
      // the `secs > 0` guard is the key fix for the silent-logout bug:
      // previously, once the access token expired we stopped trying to
      // refresh even though the refresh token was still good.
      if (secs !== null && secs >= REFRESH_AHEAD_SECS) return;

      const auth = authInstanceRef.current;
      if (!auth) return;

      try {
        const newSession = await auth.refreshSession();
        if (newSession) {
          // refreshSession already updated localStorage, now sync the new token to cookie
          syncToken();
        } else if (secs !== null && secs <= 0) {
          // Refresh returned null AND the access token is truly expired —
          // now it's safe to clear the server cookie; the user is logged out.
          if (wasAuthenticated.current && lastSyncedToken.current) {
            lastSyncedToken.current = null;
            lastSyncedRefreshToken.current = null;
            wasAuthenticated.current = false;
            fetch("/api/auth/steward-session", { method: "DELETE" }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn("[steward] Auto-refresh failed", err);
      }
    };

    // Initial sync + eager refresh check (covers returning-from-idle tabs)
    syncToken();
    void checkAndRefresh();

    // Periodic refresh check
    const refreshInterval = setInterval(() => {
      void checkAndRefresh();
    }, REFRESH_CHECK_INTERVAL_MS);

    // Also sync on storage events (cross-tab, login flow)
    const handler = () => syncToken();
    window.addEventListener("storage", handler);

    // When the tab becomes visible again, immediately check-and-refresh.
    // Browser timers (setInterval) are throttled heavily in background tabs
    // (down to ~1 call per minute in Chrome, and suspended entirely in some
    // cases), so a user coming back after 15 min may have an expired token
    // even though the interval "should" have kept it alive.
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        syncToken();
        void checkAndRefresh();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    // Also refresh on network reconnect, which commonly correlates with
    // tab-wakeup scenarios (laptop opening, WiFi reconnecting).
    const onlineHandler = () => {
      void checkAndRefresh();
    };
    window.addEventListener("online", onlineHandler);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener("storage", handler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("online", onlineHandler);
    };
  }, [isAuthenticated, user]);

  return (
    <LocalStewardAuthContext.Provider value={auth}>{children}</LocalStewardAuthContext.Provider>
  );
}

export function StewardAuthProvider({ children }: { children: React.ReactNode }) {
  const hasLoggedConfigError = useRef(false);

  const apiUrl = process.env.NEXT_PUBLIC_STEWARD_API_URL ?? "http://localhost:3200";
  const tenantId = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID;
  const hasValidUrl = !isPlaceholderValue(apiUrl);

  // Create a StewardClient instance once (no API key needed for user-facing auth flows)
  const client = useMemo(
    () =>
      new StewardClient({
        baseUrl: apiUrl,
        ...(tenantId && !isPlaceholderValue(tenantId) ? { tenantId } : {}),
      }),
    [apiUrl, tenantId],
  );

  // Stabilize the auth prop so the inner <StewardProvider> doesn't recreate its
  // StewardAuth instance on every render (which would thrash auth state).
  const authConfig = useMemo(() => ({ baseUrl: apiUrl }), [apiUrl]);

  useEffect(() => {
    if (typeof window === "undefined" || hasValidUrl || hasLoggedConfigError.current) return;
    hasLoggedConfigError.current = true;
    console.error(
      "NEXT_PUBLIC_STEWARD_API_URL is missing or invalid! Steward auth will not function.",
    );
  }, [hasValidUrl]);

  if (!hasValidUrl) {
    // Steward is optional, so we just render children without the provider
    // rather than showing an error screen (unlike Privy which is required).
    return <>{children}</>;
  }

  return (
    <StewardProvider
      client={client}
      agentId="eliza-cloud"
      auth={authConfig}
      tenantId={tenantId && !isPlaceholderValue(tenantId) ? tenantId : undefined}
    >
      <AuthTokenSync>{children}</AuthTokenSync>
    </StewardProvider>
  );
}
