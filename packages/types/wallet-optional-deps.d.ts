/** Optional wallet UI deps — stubs for environments without full install. */
declare module "@rainbow-me/rainbowkit" {
  import type { FC, ReactNode } from "react";

  export const RainbowKitProvider: FC<{
    children: ReactNode;
    theme?: unknown;
    modalSize?: string;
  }>;

  export function darkTheme(options: Record<string, unknown>): unknown;
  export function getDefaultConfig(options: Record<string, unknown>): unknown;
}

declare module "@solana/wallet-adapter-react" {
  import type { FC, ReactNode } from "react";

  export const ConnectionProvider: FC<{ children: ReactNode; endpoint: string }>;
  export const WalletProvider: FC<{
    children: ReactNode;
    wallets: unknown[];
    autoConnect?: boolean;
  }>;
}

declare module "@solana/wallet-adapter-react-ui" {
  import type { FC, ReactNode } from "react";
  export const WalletModalProvider: FC<{ children: ReactNode }>;
}

declare module "@solana/wallet-adapter-wallets" {
  export class PhantomWalletAdapter {
    constructor();
  }
  export class SolflareWalletAdapter {
    constructor();
  }
}

declare module "@tanstack/react-query" {
  import type { FC, ReactNode } from "react";
  export const QueryClientProvider: FC<{ children: ReactNode; client: unknown }>;
  export class QueryClient {
    constructor(config?: Record<string, unknown>);
  }
}

declare module "wagmi" {
  import type { FC, ReactNode } from "react";
  export const WagmiProvider: FC<{
    children: ReactNode;
    config: unknown;
    reconnectOnMount?: boolean;
  }>;
  export function createConfig(options: Record<string, unknown>): unknown;
}

declare module "wagmi/chains" {
  export const mainnet: { id: number; name: string };
  export const base: { id: number; name: string };
  export const sepolia: { id: number; name: string };
}
