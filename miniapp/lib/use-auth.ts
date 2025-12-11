/**
 * Auth Hook for Miniapp
 *
 * Uses token-based authentication via pass-through to Eliza Cloud.
 * The auth flow:
 * 1. User clicks login → redirect to Cloud
 * 2. User logs in via Privy on Cloud
 * 3. Cloud generates auth token and redirects back
 * 4. Miniapp stores token and uses it for API calls
 *
 * IMPORTANT: This file imports types from ./types.ts to ensure complete
 * separation from the main app. Never import types from the parent app.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { getCloudUrl } from "./cloud-url";
import type { AuthState, AuthUser } from "./types";

const AUTH_TOKEN_KEY = "miniapp_auth_token";
const USER_ID_KEY = "miniapp_user_id";
const ORG_ID_KEY = "miniapp_org_id";

/**
 * Helper to safely get localStorage value (handles SSR)
 */
function getStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

/**
 * Auth hook that manages token-based authentication
 */
export function useAuth(): AuthState {
  // Use lazy initialization to avoid calling setState in effect
  const [ready, setReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(() =>
    getStoredValue(AUTH_TOKEN_KEY),
  );
  const [userId, setUserId] = useState<string | null>(() =>
    getStoredValue(USER_ID_KEY),
  );
  const [organizationId, setOrganizationId] = useState<string | null>(() =>
    getStoredValue(ORG_ID_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(null);

  // Clear auth state - defined first since it's used by other callbacks
  const clearAuth = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(ORG_ID_KEY);
    setAuthToken(null);
    setUserId(null);
    setOrganizationId(null);
    setUser(null);
  }, []);

  // Fetch user info from Cloud API - defined before the useEffect that uses it
  const fetchUserInfo = useCallback(
    async (token: string) => {
      console.log(
        "[useAuth] Fetching user info with token:",
        token.slice(0, 20) + "...",
      );
      try {
        const response = await fetch("/api/proxy/user", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log("[useAuth] User info response:", {
          ok: response.ok,
          status: response.status,
        });

        if (response.ok) {
          const data = await response.json();
          console.log("[useAuth] User info received:", {
            email: data.user?.email,
            name: data.user?.name,
          });
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            avatar: data.user.avatar,
          });
        } else if (response.status === 401) {
          console.warn("[useAuth] Token invalid (401), clearing auth");
          const errorData = await response.json().catch(() => ({}));
          console.log("[useAuth] 401 error details:", errorData);
          clearAuth();
        } else {
          console.warn("[useAuth] Unexpected status:", response.status);
        }
      } catch (error) {
        // Network error - don't clear auth, just skip user info fetch
        console.warn("[useAuth] Failed to fetch user info:", error);
      }
    },
    [clearAuth],
  );

  // Sync localStorage to state on mount (handles SSR hydration mismatch)
  // This is necessary because lazy initialization doesn't work correctly with SSR:
  // - During SSR, window is undefined so getStoredValue returns null
  // - During hydration, React reuses the SSR state instead of re-initializing
  // - This effect reads the actual localStorage values after mount
  useEffect(() => {
    // Read fresh values from localStorage on mount
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const storedUserId = localStorage.getItem(USER_ID_KEY);
    const storedOrgId = localStorage.getItem(ORG_ID_KEY);

    console.log("[useAuth] Mount sync:", {
      hasToken: !!storedToken,
      tokenPrefix: storedToken?.slice(0, 15),
      userId: storedUserId,
    });

    if (storedToken) {
      setAuthToken(storedToken);
      setUserId(storedUserId);
      setOrganizationId(storedOrgId);
    }

    setReady(true);
  }, []);

  // Fetch user info whenever authToken changes
  useEffect(() => {
    console.log("[useAuth] Token or ready changed:", {
      hasToken: !!authToken,
      tokenPrefix: authToken?.slice(0, 15),
      ready,
    });
    if (authToken && ready) {
      fetchUserInfo(authToken);
    }
  }, [authToken, ready, fetchUserInfo]);

  // Listen for storage changes (e.g., from auth callback in another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_KEY) {
        const newToken = localStorage.getItem(AUTH_TOKEN_KEY);
        const newUserId = localStorage.getItem(USER_ID_KEY);
        const newOrgId = localStorage.getItem(ORG_ID_KEY);

        if (newToken && newUserId) {
          setAuthToken(newToken);
          setUserId(newUserId);
          setOrganizationId(newOrgId);
          fetchUserInfo(newToken);
        } else {
          clearAuth();
        }
      }
    };

    const handleAuthChanged = () => {
      const newToken = localStorage.getItem(AUTH_TOKEN_KEY);
      const newUserId = localStorage.getItem(USER_ID_KEY);
      const newOrgId = localStorage.getItem(ORG_ID_KEY);

      if (newToken && newUserId) {
        setAuthToken(newToken);
        setUserId(newUserId);
        setOrganizationId(newOrgId);
        fetchUserInfo(newToken);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("miniapp_auth_changed", handleAuthChanged);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("miniapp_auth_changed", handleAuthChanged);
    };
  }, [fetchUserInfo, clearAuth]);

  // Start the login flow
  const login = useCallback(async () => {
    // Get the callback URL for this miniapp
    const callbackUrl = `${window.location.origin}/auth/callback`;
    const cloudUrl = getCloudUrl();

    console.log("[useAuth] Login - using Cloud URL:", cloudUrl);

    // Create a session on Cloud
    // Include ngrok-skip-browser-warning header to bypass ngrok's interstitial page
    const response = await fetch(`${cloudUrl}/api/auth/miniapp-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        callbackUrl,
        appId: "miniapp",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create auth session");
    }

    const { loginUrl } = await response.json();

    // Redirect to Cloud for authentication
    // The loginUrl might be relative - ensure it's absolute
    const absoluteLoginUrl = loginUrl.startsWith("http")
      ? loginUrl
      : `${cloudUrl}${loginUrl}`;
    window.location.href = absoluteLoginUrl;
  }, []);

  // Logout
  const logout = useCallback(() => {
    clearAuth();
    window.location.href = "/";
  }, [clearAuth]);

  return {
    ready,
    authenticated: !!authToken,
    user,
    userId,
    organizationId,
    authToken,
    login,
    logout,
  };
}

/**
 * Get the current auth token (for use in API calls)
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
