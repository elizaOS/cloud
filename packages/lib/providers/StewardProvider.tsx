"use client";

import { StewardProvider, useAuth as useStewardAuth } from "@stwd/react";
import { StewardClient } from "@stwd/sdk";
import { useEffect, useMemo, useRef } from "react";

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
function AuthTokenSync({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, getToken, user } = useStewardAuth();
  const lastSyncedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      lastSyncedToken.current = null;
      // Clear the server-side cookie on sign out
      fetch("/api/auth/steward-session", { method: "DELETE" }).catch(() => {});
      return;
    }

    const token = getToken();
    if (token && token !== lastSyncedToken.current) {
      lastSyncedToken.current = token;

      // Set the server-side session cookie so Next.js server components
      // can read the steward JWT (localStorage is client-only)
      fetch("/api/auth/steward-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch((err) => console.warn("[steward] Failed to set session cookie", err));

      // Dispatch a custom event so non-React code (fetch wrappers, etc.)
      // can pick up the fresh JWT without coupling to React context.
      window.dispatchEvent(
        new CustomEvent("steward-token-sync", {
          detail: { token, userId: user?.id },
        }),
      );
    }
  }, [isAuthenticated, getToken, user]);

  return children;
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
      auth={{ baseUrl: apiUrl }}
      tenantId={tenantId && !isPlaceholderValue(tenantId) ? tenantId : undefined}
    >
      <AuthTokenSync>{children}</AuthTokenSync>
    </StewardProvider>
  );
}
