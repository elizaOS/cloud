"use client";

import { PrivyProvider as PrivyProviderReactAuth } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

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
        loginMethods: ["wallet", "email"],
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
      {children}
    </PrivyProviderReactAuth>
  );
}
