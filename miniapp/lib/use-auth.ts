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
import type { AuthUser, AuthState } from "./types";

const CLOUD_URL = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || "http://localhost:3000";
const AUTH_TOKEN_KEY = "miniapp_auth_token";
const USER_ID_KEY = "miniapp_user_id";
const ORG_ID_KEY = "miniapp_org_id";

/**
 * Auth hook that manages token-based authentication
 */
export function useAuth(): AuthState {
  const [ready, setReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
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
  const fetchUserInfo = useCallback(async (token: string) => {
    const response = await fetch("/api/proxy/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatar: data.user.avatar,
      });
    } else {
      // Token might be invalid, clear auth state
      clearAuth();
    }
  }, [clearAuth]);

  // Load auth state from localStorage on mount and on storage changes
  useEffect(() => {
    const loadAuthState = () => {
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      const storedUserId = localStorage.getItem(USER_ID_KEY);
      const storedOrgId = localStorage.getItem(ORG_ID_KEY);

      if (storedToken && storedUserId) {
        setAuthToken(storedToken);
        setUserId(storedUserId);
        setOrganizationId(storedOrgId);
        
        // Fetch user info
        fetchUserInfo(storedToken);
      } else {
        // Clear state if no token
        setAuthToken(null);
        setUserId(null);
        setOrganizationId(null);
        setUser(null);
      }
      
      setReady(true);
    };

    loadAuthState();

    // Listen for storage changes (e.g., from auth callback in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_KEY) {
        loadAuthState();
      }
    };

    // Also check on window focus (for same-tab navigation)
    const handleFocus = () => {
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (storedToken !== authToken) {
        loadAuthState();
      }
    };

    // Also listen for our custom auth event
    const handleAuthChanged = () => {
      loadAuthState();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("miniapp_auth_changed", handleAuthChanged);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("miniapp_auth_changed", handleAuthChanged);
    };
  }, [authToken, fetchUserInfo]);

  // Start the login flow
  const login = useCallback(async () => {
    // Get the callback URL for this miniapp
    const callbackUrl = `${window.location.origin}/auth/callback`;

    // Create a session on Cloud
    const response = await fetch(`${CLOUD_URL}/api/auth/miniapp-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      : `${CLOUD_URL}${loginUrl}`;
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
