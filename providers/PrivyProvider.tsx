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
 */
function PrivyAuthWrapper({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const migrationAttempted = useRef(false);

  // Log Privy state on mount
  useEffect(() => {
    console.log("[PrivyProvider] PrivyAuthWrapper mounted");
  }, []);

  // Log all Privy state changes
  useEffect(() => {
    console.log("[PrivyProvider] Privy state update:", {
      ready,
      authenticated,
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email?.address,
      linkedAccountsCount: user?.linkedAccounts?.length || 0,
      linkedAccountTypes: user?.linkedAccounts?.map((a) => a.type) || [],
    });
  }, [ready, authenticated, user]);

  useEffect(() => {
    // Call migration endpoint after successful authentication
    if (ready && authenticated && user && !migrationAttempted.current) {
      console.log(
        "[PrivyProvider] Starting anonymous session migration check for user:",
        user.id
      );
      migrationAttempted.current = true;

      // Check if there's an anonymous session to migrate
      const hasAnonSession = document.cookie.includes("eliza-anon-session");

      if (hasAnonSession) {
        console.log(
          "[PrivyProvider] Found anonymous session cookie, attempting migration..."
        );
        fetch("/api/auth/migrate-anonymous", {
          method: "POST",
          credentials: "include", // Important: include cookies
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.migrated) {
              console.log(
                `[PrivyProvider] ✅ Successfully migrated ${data.messagesTransferred} anonymous messages`
              );
            } else {
              console.log(
                `[PrivyProvider] No migration needed: ${data.message}`
              );
            }
          })
          .catch((error) => {
            console.error(
              "[PrivyProvider] Failed to migrate anonymous session:",
              error
            );
            // Don't block user - this is non-critical
          });
      } else {
        console.log(
          "[PrivyProvider] No anonymous session cookie found, skipping migration"
        );
      }
    } else {
      console.log("[PrivyProvider] Migration conditions not met:", {
        ready,
        authenticated,
        hasUser: !!user,
        migrationAttempted: migrationAttempted.current,
      });
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
    []
  );

  // Check if Privy App ID is configured
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId || !clientId) {
    console.error(
      "NEXT_PUBLIC_PRIVY_APP_ID or NEXT_PUBLIC_PRIVY_CLIENT_ID is not set!"
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
