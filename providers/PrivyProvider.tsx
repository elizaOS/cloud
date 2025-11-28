"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  PrivyProvider as PrivyProviderReactAuth,
  usePrivy,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

// Define configuration outside component to prevent recreating on every render
const loginMethods: ("wallet" | "email" | "google" | "discord" | "github")[] = [
  "wallet",
  "email",
  "google",
  "discord",
  "github",
];

/**
 * Wrapper component to handle post-authentication logic
 * Handles migration of anonymous user data after successful authentication
 */
function PrivyAuthWrapper({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const migrationAttempted = useRef(false);

  useEffect(() => {
    // Call migration endpoint after successful authentication
    if (ready && authenticated && user && !migrationAttempted.current) {
      migrationAttempted.current = true;

      // Check if there's an anonymous session to migrate
      const hasAnonSession = document.cookie.includes("eliza-anon-session");

      if (hasAnonSession) {
        console.log("[PrivyProvider] 🔄 Detected anonymous session, initiating migration...");
        
        fetch("/api/auth/migrate-anonymous", {
          method: "POST",
          credentials: "include", // Important: include cookies
          headers: {
            "Content-Type": "application/json",
          },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.migrated) {
              console.log("[PrivyProvider] ✅ Anonymous session migrated successfully:", data);
              
              // If we're on a chat route, reload to pick up the migrated data
              const currentPath = window.location.pathname;
              if (currentPath.startsWith("/chat/")) {
                console.log("[PrivyProvider] 🔃 Reloading chat page to show migrated data...");
                // Small delay to ensure backend has processed the migration
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              }
            } else {
              console.log("[PrivyProvider] ℹ️ Migration result:", data.message);
            }
          })
          .catch((error) => {
            console.error(
              "[PrivyProvider] ❌ Failed to migrate anonymous session:",
              error,
            );
            // Don't block user - this is non-critical
          });
      }
    }
  }, [ready, authenticated, user]);

  return <>{children}</>;
}

export default function PrivyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Memoize the config to prevent unnecessary re-renders (must be before early return)
  const privyConfig = useMemo(
    () =>
      ({
        loginMethods,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets" as const,
          },
          solana: {
            createOnLogin: "users-without-wallets" as const,
          },
        },
        appearance: {
          walletChainType: "ethereum-and-solana" as const,
          theme: "dark" as const,
          accentColor: "#6366F1" as `#${string}`,
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }) as unknown as PrivyClientConfig,
    [],
  );

  // Check if Privy App ID is configured
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId || !clientId) {
    console.error(
      "NEXT_PUBLIC_PRIVY_APP_ID or NEXT_PUBLIC_PRIVY_CLIENT_ID is not set!",
    );
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            Configuration Error
          </h1>
          <p className="mt-2">Privy configuration is missing.</p>
          <p className="text-sm text-gray-500 mt-1">
            Please set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID
            in your environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProviderReactAuth
      appId={appId}
      clientId={clientId}
      config={privyConfig}
    >
      <PrivyAuthWrapper>{children}</PrivyAuthWrapper>
    </PrivyProviderReactAuth>
  );
}
