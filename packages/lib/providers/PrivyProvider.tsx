"use client";

import {
  type PrivyClientConfig,
  PrivyProvider as PrivyProviderReactAuth,
  usePrivy,
} from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { useEffect, useMemo, useRef } from "react";

// Define configuration outside component to prevent recreating on every render
const loginMethods: ("wallet" | "email" | "google" | "discord" | "github")[] = [
  "wallet",
  "email",
  "google",
  "discord",
  "github",
];

// Use a unique string key on globalThis to store connectors cache
// This survives HMR (Hot Module Replacement) and module re-evaluations
// which would otherwise cause WalletConnect to be initialized multiple times
const SOLANA_CONNECTORS_KEY = "__ELIZA_CLOUD_SOLANA_CONNECTORS__";

type SolanaConnectors = ReturnType<typeof toSolanaWalletConnectors>;

// Create Solana wallet connectors once globally to prevent
// WalletConnect double-initialization in React Strict Mode and during HMR
const getSolanaConnectors = (): SolanaConnectors => {
  const globalCache = globalThis as unknown as Record<
    string,
    SolanaConnectors | undefined
  >;

  if (globalCache[SOLANA_CONNECTORS_KEY]) {
    return globalCache[SOLANA_CONNECTORS_KEY];
  }

  const connectors = toSolanaWalletConnectors();
  globalCache[SOLANA_CONNECTORS_KEY] = connectors;
  return connectors;
};

function isPlaceholderPrivyValue(value: string | undefined): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("your_privy_") ||
    normalized.includes("your-privy-") ||
    normalized.includes("replace_with")
  );
}

/**
 * Wrapper component to handle post-authentication logic
 * Handles migration of anonymous user data after successful authentication
 */
function PrivyAuthWrapper({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const migrationAttempted = useRef(false);

  useEffect(() => {
    // Call migration endpoint after successful authentication
    if (ready && authenticated && user && !migrationAttempted.current) {
      migrationAttempted.current = true;

      // Check for anonymous session token in localStorage
      // (httpOnly cookies can't be read via document.cookie, so we use localStorage as backup)
      let sessionToken = localStorage.getItem("eliza-anon-session-token");

      // Also check document.cookie as fallback (in case cookie was set without httpOnly in dev)
      const hasAnonCookie = document.cookie.includes("eliza-anon-session");

      // Also check URL for session token (in case localStorage was cleared)
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionToken = urlParams.get("session");
      if (urlSessionToken && !sessionToken) {
        sessionToken = urlSessionToken;
      }

      if (sessionToken || hasAnonCookie) {
        // Helper function to attempt migration with retry
        const attemptMigration = async (retryCount = 0): Promise<void> => {
          const maxRetries = 3;
          const retryDelay = 1000; // 1 second

          try {
            // Get fresh access token to ensure auth is ready
            const accessToken = await getAccessToken();

            const response = await fetch("/api/auth/migrate-anonymous", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
              },
              body: JSON.stringify({ sessionToken: sessionToken || undefined }),
            });

            const data = await response.json();

            if (data.success && data.migrated) {
              cleanupAndNotify();
              reloadIfNeeded();
            } else if (data.error && retryCount < maxRetries) {
              setTimeout(() => attemptMigration(retryCount + 1), retryDelay);
            } else {
              cleanupAndNotify();
            }
          } catch (_error) {
            if (retryCount < maxRetries) {
              setTimeout(() => attemptMigration(retryCount + 1), retryDelay);
            } else {
              cleanupAndNotify();
            }
          }
        };

        const cleanupAndNotify = () => {
          localStorage.removeItem("eliza-anon-session-token");
          window.dispatchEvent(new CustomEvent("anonymous-session-migrated"));
        };

        const reloadIfNeeded = () => {
          // Instead of a hard reload (which breaks client-side navigation),
          // dispatch an event that components can listen to for soft refresh.
          // Hard reloads were causing client-side routing to break.
          window.dispatchEvent(new CustomEvent("anon-migration-complete"));
        };

        // Small delay to ensure Privy auth cookies are set
        setTimeout(() => attemptMigration(), 500);
      }
    }
  }, [ready, authenticated, user, getAccessToken]);

  return children;
}

export default function PrivyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasLoggedPrivyConfigError = useRef(false);

  // Memoize the config to prevent unnecessary re-renders (must be before early return)
  // PrivyClientConfig accepts partial configurations at runtime, but the type is strict.
  // We define the exact shape we're providing and cast to the expected interface.
  const privyConfig = useMemo(
    (): PrivyClientConfig => ({
      loginMethods,
      embeddedWallets: {
        ethereum: {
          createOnLogin: "users-without-wallets",
        },
        solana: {
          createOnLogin: "users-without-wallets",
        },
      },
      appearance: {
        walletChainType: "ethereum-and-solana",
        theme: "dark",
        accentColor: "#6366F1",
        walletList: [
          "metamask",
          "phantom",
          "coinbase_wallet",
          "rabby_wallet",
          "okx_wallet",
        ],
      },
      externalWallets: {
        solana: {
          // Use cached connectors to prevent WalletConnect double-init in Strict Mode
          connectors: getSolanaConnectors(),
        },
      },
    }),
    [],
  );

  // Check if Privy App ID is configured
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;
  const playwrightTestAuthEnabled =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_AUTH === "true";
  const stewardAuthEnabled =
    process.env.NEXT_PUBLIC_STEWARD_AUTH_ENABLED === "true";
  const resolvedClientId = isPlaceholderPrivyValue(clientId)
    ? undefined
    : clientId?.trim();
  const hasValidAppId =
    typeof appId === "string" &&
    appId.trim().length === 25 &&
    !isPlaceholderPrivyValue(appId);
  const shouldUseFallbackPrivyContext =
    stewardAuthEnabled || playwrightTestAuthEnabled;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      hasValidAppId ||
      shouldUseFallbackPrivyContext ||
      hasLoggedPrivyConfigError.current
    ) {
      return;
    }

    hasLoggedPrivyConfigError.current = true;
    console.error("NEXT_PUBLIC_PRIVY_APP_ID is missing or invalid!");
  }, [hasValidAppId, shouldUseFallbackPrivyContext]);

  if (!hasValidAppId) {
    // When Steward auth is enabled and Privy isn't configured,
    // provide a minimal Privy context with a dummy app ID so that
    // child components calling usePrivy() get a valid context instead
    // of throwing. Auth is fully handled by Steward; Privy hooks will
    // simply report unauthenticated.
    if (shouldUseFallbackPrivyContext) {
      return (
        <PrivyProviderReactAuth
          appId="cm00000000000000000000000"
          config={privyConfig}
        >
          {children}
        </PrivyProviderReactAuth>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            Configuration Error
          </h1>
          <p className="mt-2">Privy configuration is missing.</p>
          <p className="text-sm text-gray-500 mt-1">
            Please set NEXT_PUBLIC_PRIVY_APP_ID in your environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProviderReactAuth
      appId={appId}
      clientId={resolvedClientId}
      config={privyConfig}
    >
      <PrivyAuthWrapper>{children}</PrivyAuthWrapper>
    </PrivyProviderReactAuth>
  );
}
