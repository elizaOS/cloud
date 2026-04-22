/**
 * Optional Steward packages — ambient declarations so typecheck passes when
 * packages are not installed or publish incomplete `.d.ts` files.
 */
declare module "@stwd/react" {
  import type { ComponentType, FC, ReactNode } from "react";

  export const StewardProvider: ComponentType<{
    children: ReactNode;
    client?: unknown;
    agentId?: string;
    auth?: Record<string, unknown>;
    tenantId?: string;
    [key: string]: unknown;
  }>;

  export function useAuth(): {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: { id?: string; email?: string; walletAddress?: string } | null;
    session?: unknown;
    signOut: () => void | Promise<void>;
    getToken?: () => string | null;
    getAccessToken?: () => Promise<string | null>;
  };
}

declare module "@stwd/react/wallet" {
  import type { CSSProperties, FC, ReactNode } from "react";

  export type WalletChains = "both" | "evm" | "solana";

  export const WalletLogin: FC<{
    chains?: WalletChains | null;
    onSuccess?: (result: { token: string }) => void;
    onError?: (walletError: { message?: string }) => void;
    evmLabel?: string;
    solanaLabel?: string;
    className?: string;
    style?: CSSProperties;
  }>;
  export const StewardWalletProvider: FC<{ children: ReactNode }>;
  export function useStewardWallet(): Record<string, unknown>;
}

declare module "@stwd/sdk" {
  export class StewardApiError extends Error {
    status?: number;
    constructor(message?: string, init?: { status?: number });
  }

  export type StewardAgentResponse = {
    id: string;
    name: string;
    walletAddress?: string | null;
    createdAt?: Date;
  };

  export class StewardAuth {
    constructor(options: Record<string, unknown>);
    getSession(): { token?: string } | null;
    refreshSession(): Promise<{ token?: string } | null>;
    signInWithPasskey(email: string): Promise<{ token: string }>;
    signInWithEmail(email: string): Promise<void>;
    getProviders(): Promise<Record<string, boolean>>;
  }

  export type StewardBalanceResponse = {
    balances?: {
      nativeFormatted?: string | null;
      chainId?: number | string | null;
    };
  };

  export class StewardClient {
    constructor(options: Record<string, unknown>);
    createWallet(
      agentName: string,
      displayName: string,
      clientAddress: string,
    ): Promise<StewardAgentResponse>;
    getAgent(idOrName: string): Promise<StewardAgentResponse>;
    getBalance(agentId: string): Promise<StewardBalanceResponse>;
    signTransaction(agentId: string, tx: Record<string, unknown>): Promise<unknown>;
    signMessage(agentId: string, message: string): Promise<unknown>;
    signTypedData(agentId: string, payload: Record<string, unknown>): Promise<unknown>;
  }
}
