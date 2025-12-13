"use client";

import { useEffect, useRef } from "react";
import {
  PrivyProvider as PrivyProviderReactAuth,
  usePrivy,
} from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

/**
 * Wrapper component to handle post-authentication logic
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
        console.log(
          "[PrivyProvider] Attempting to migrate anonymous session...",
        );
        fetch("/api/auth/migrate-anonymous", {
          method: "POST",
          credentials: "include", // Important: include cookies
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.migrated) {
              console.log(
                `[PrivyProvider] ✅ Successfully migrated ${data.messagesTransferred} anonymous messages`,
              );
            } else {
              console.log(
                `[PrivyProvider] No migration needed: ${data.message}`,
              );
            }
          })
          .catch((error) => {
            console.error(
              "[PrivyProvider] Failed to migrate anonymous session:",
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
  // Check if Privy App ID is configured
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    console.error("NEXT_PUBLIC_PRIVY_APP_ID is not set!");
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            Configuration Error
          </h1>
          <p className="mt-2">Privy App ID is not configured.</p>
          <p className="text-sm text-gray-500 mt-1">
            Please set NEXT_PUBLIC_PRIVY_APP_ID in your environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProviderReactAuth
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        loginMethods: ["wallet", "email", "google", "discord", "github"],
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
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
      }}
    >
      <PrivyAuthWrapper>{children}</PrivyAuthWrapper>
    </PrivyProviderReactAuth>
  );
}
