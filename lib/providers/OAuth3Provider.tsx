"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { Address, Hex } from "viem";

/**
 * OAuth3 Provider
 *
 * Decentralized authentication provider that replaces Privy.
 * Uses the OAuth3 Agent from apps/oauth3 for identity management.
 *
 * Features:
 * - Multi-provider login (wallet, farcaster, google, github, twitter, discord, apple, email)
 * - Embedded smart account wallets
 * - Cross-platform session management
 * - Account linking
 * - Wallet export capability
 */

// OAuth3 Agent endpoint
const OAUTH3_AGENT_URL =
  process.env.NEXT_PUBLIC_OAUTH3_URL ?? "http://localhost:4200";

export type OAuth3Provider =
  | "wallet"
  | "farcaster"
  | "google"
  | "github"
  | "twitter"
  | "discord"
  | "apple"
  | "email";

export interface OAuth3User {
  id: string;
  identityId: Hex;
  smartAccount: Address;
  provider: OAuth3Provider;
  providerId: string;
  providerHandle: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  wallet?: {
    address: Address;
    chainId: number;
  };
  linkedAccounts: Array<{
    provider: OAuth3Provider;
    providerId: string;
    handle: string;
  }>;
}

export interface OAuth3Session {
  sessionId: Hex;
  identityId: Hex;
  smartAccount: Address;
  expiresAt: number;
  provider: OAuth3Provider;
  providerId: string;
  providerHandle: string;
  attestation?: {
    quote: Hex;
    measurement: Hex;
    reportData: Hex;
    timestamp: number;
    provider: string;
    verified: boolean;
  };
}

interface OAuth3ContextValue {
  ready: boolean;
  authenticated: boolean;
  user: OAuth3User | null;
  session: OAuth3Session | null;
  
  // Auth methods
  login: (provider?: OAuth3Provider) => Promise<void>;
  logout: () => Promise<void>;
  
  // Wallet methods
  connectWallet: () => Promise<void>;
  signMessage: (message: string) => Promise<Hex>;
  
  // Token methods
  getAccessToken: () => Promise<string | null>;
  
  // Link accounts
  linkAccount: (provider: OAuth3Provider) => Promise<void>;
  unlinkAccount: (provider: OAuth3Provider) => Promise<void>;
  
  // Export wallet
  exportWallet: () => Promise<void>;
}

const OAuth3Context = createContext<OAuth3ContextValue | null>(null);

export function useOAuth3() {
  const context = useContext(OAuth3Context);
  if (!context) {
    throw new Error("useOAuth3 must be used within an OAuth3Provider");
  }
  return context;
}

// Compatibility alias for easy migration from usePrivy
export const usePrivy = useOAuth3;

/**
 * Hook for email-based login
 * Provides email OTP authentication flow
 */
export function useLoginWithEmail() {
  const [state, setState] = useState<{
    status: "initial" | "sending-code" | "awaiting-code-input" | "submitting-code" | "done" | "error";
    error?: string;
  }>({ status: "initial" });

  const OAUTH3_AGENT_URL =
    process.env.NEXT_PUBLIC_OAUTH3_URL ?? "http://localhost:4200";

  const sendCode = useCallback(async ({ email }: { email: string }) => {
    setState({ status: "sending-code" });

    try {
      const response = await fetch(`${OAUTH3_AGENT_URL}/auth/email/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, appId: "eliza-cloud" }),
      });

      if (!response.ok) {
        throw new Error("Failed to send verification code");
      }

      setState({ status: "awaiting-code-input" });
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to send code",
      });
    }
  }, [OAUTH3_AGENT_URL]);

  const loginWithCode = useCallback(async ({ code }: { code: string }) => {
    setState({ status: "submitting-code" });

    try {
      const response = await fetch(`${OAUTH3_AGENT_URL}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, appId: "eliza-cloud" }),
      });

      if (!response.ok) {
        throw new Error("Invalid verification code");
      }

      const { sessionId } = await response.json();

      // Set the session cookie
      document.cookie = `oauth3-token=${sessionId}; path=/; max-age=${7 * 24 * 60 * 60}`;

      setState({ status: "done" });

      // Reload to pick up the new session
      window.location.href = "/dashboard";
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : "Verification failed",
      });
    }
  }, [OAUTH3_AGENT_URL]);

  return { sendCode, loginWithCode, state };
}

/**
 * Hook for OAuth-based login
 * Provides OAuth redirect flow for third-party providers
 */
export function useLoginWithOAuth() {
  const OAUTH3_AGENT_URL =
    process.env.NEXT_PUBLIC_OAUTH3_URL ?? "http://localhost:4200";

  const initOAuth = useCallback(
    async ({ provider }: { provider: "google" | "discord" | "github" | "twitter" | "farcaster" | "apple" }) => {
      const redirectUri = `${window.location.origin}/api/auth/oauth3/callback`;

      try {
        const response = await fetch(`${OAUTH3_AGENT_URL}/auth/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            redirectUri,
            appId: "eliza-cloud",
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to initialize OAuth");
        }

        const { authUrl } = await response.json();
        window.location.href = authUrl;
      } catch (error) {
        console.error("[OAuth3] OAuth init failed:", error);
        throw error;
      }
    },
    [OAUTH3_AGENT_URL]
  );

  return { initOAuth };
}

/**
 * Hook for logging out
 * Clears the OAuth3 session
 */
export function useLogout() {
  const { logout } = useOAuth3();
  return { logout };
}

/**
 * Hook for linking accounts
 * Allows adding additional OAuth providers to an existing account
 */
export function useLinkAccount() {
  const { linkAccount, unlinkAccount } = useOAuth3();
  
  const linkWallet = useCallback(() => linkAccount("wallet"), [linkAccount]);
  const linkEmail = useCallback(() => linkAccount("email"), [linkAccount]);
  const linkGoogle = useCallback(() => linkAccount("google"), [linkAccount]);
  const linkGithub = useCallback(() => linkAccount("github"), [linkAccount]);
  const linkDiscord = useCallback(() => linkAccount("discord"), [linkAccount]);
  const linkTwitter = useCallback(() => linkAccount("twitter"), [linkAccount]);
  const linkFarcaster = useCallback(() => linkAccount("farcaster"), [linkAccount]);
  
  return { 
    linkWallet,
    linkEmail,
    linkGoogle,
    linkGithub,
    linkDiscord,
    linkTwitter,
    linkFarcaster,
    unlinkAccount,
  };
}

/**
 * Hook for wallet operations
 * Provides access to connected wallets
 */
export function useWallets() {
  const { user, signMessage } = useOAuth3();
  
  // In OAuth3, the user has a single smart account wallet
  const wallets = user?.wallet ? [{
    address: user.wallet.address,
    chainId: user.wallet.chainId,
    signMessage,
  }] : [];

  return { wallets, ready: !!user };
}

/**
 * Hook for funding wallet (placeholder for compatibility)
 * In OAuth3, this would use the smart account's on-chain funding capabilities
 */
export function useFundWallet() {
  const { user } = useOAuth3();
  
  const fundWallet = useCallback(async () => {
    if (!user?.wallet?.address) {
      throw new Error("No wallet connected");
    }
    // Open a funding page or modal
    window.open(`https://buy.onramp.money/widget?wallet=${user.wallet.address}`, '_blank');
  }, [user]);

  return { fundWallet };
}

interface OAuth3ProviderProps {
  children: ReactNode;
}

export default function OAuth3Provider({ children }: OAuth3ProviderProps) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<OAuth3User | null>(null);
  const [session, setSession] = useState<OAuth3Session | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/oauth3/session", {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          if (data.session && data.user) {
            setSession(data.session);
            setUser(data.user);
            setAuthenticated(true);
          }
        }
      } catch (error) {
        console.error("[OAuth3] Session check failed:", error);
      } finally {
        setReady(true);
      }
    };

    checkSession();
  }, []);

  // Handle OAuth callback messages
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "oauth3-callback") {
        const { session: newSession, user: newUser } = event.data;
        setSession(newSession);
        setUser(newUser);
        setAuthenticated(true);
        setLoginModalOpen(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const login = useCallback(async (provider?: OAuth3Provider) => {
    if (provider) {
      // Direct login with specific provider
      const redirectUri = `${window.location.origin}/api/auth/oauth3/callback`;
      
      try {
        const response = await fetch(`${OAUTH3_AGENT_URL}/auth/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            redirectUri,
            appId: "eliza-cloud",
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to initialize login");
        }

        const { authUrl } = await response.json();
        window.location.href = authUrl;
      } catch (error) {
        console.error("[OAuth3] Login init failed:", error);
        throw error;
      }
    } else {
      // Open login modal for provider selection
      setLoginModalOpen(true);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/oauth3/logout", {
        method: "POST",
        credentials: "include",
      });

      setSession(null);
      setUser(null);
      setAuthenticated(false);

      // Clear local storage
      localStorage.removeItem("oauth3-session");
      
      // Redirect to home
      window.location.href = "/";
    } catch (error) {
      console.error("[OAuth3] Logout failed:", error);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    // Trigger wallet connection flow
    await login("wallet");
  }, [login]);

  const signMessage = useCallback(async (message: string): Promise<Hex> => {
    if (!session) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${OAUTH3_AGENT_URL}/wallet/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to sign message");
    }

    const { signature } = await response.json();
    return signature as Hex;
  }, [session]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!session) {
      return null;
    }

    // The session ID is the access token for OAuth3
    return session.sessionId;
  }, [session]);

  const linkAccount = useCallback(async (provider: OAuth3Provider) => {
    if (!session) {
      throw new Error("Not authenticated");
    }

    const redirectUri = `${window.location.origin}/api/auth/oauth3/link-callback`;
    
    const response = await fetch(`${OAUTH3_AGENT_URL}/auth/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        provider,
        redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to initialize account linking");
    }

    const { authUrl } = await response.json();
    window.location.href = authUrl;
  }, [session]);

  const unlinkAccount = useCallback(async (provider: OAuth3Provider) => {
    if (!session) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${OAUTH3_AGENT_URL}/auth/unlink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        provider,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to unlink account");
    }

    // Refresh user data
    const userResponse = await fetch("/api/auth/oauth3/session", {
      credentials: "include",
    });

    if (userResponse.ok) {
      const data = await userResponse.json();
      setUser(data.user);
    }
  }, [session]);

  const exportWallet = useCallback(async () => {
    if (!session) {
      throw new Error("Not authenticated");
    }

    // Open wallet export modal
    window.open(
      `${OAUTH3_AGENT_URL}/wallet/export?sessionId=${session.sessionId}`,
      "oauth3-export",
      "width=400,height=600"
    );
  }, [session]);

  const value = useMemo<OAuth3ContextValue>(() => ({
    ready,
    authenticated,
    user,
    session,
    login,
    logout,
    connectWallet,
    signMessage,
    getAccessToken,
    linkAccount,
    unlinkAccount,
    exportWallet,
  }), [
    ready,
    authenticated,
    user,
    session,
    login,
    logout,
    connectWallet,
    signMessage,
    getAccessToken,
    linkAccount,
    unlinkAccount,
    exportWallet,
  ]);

  return (
    <OAuth3Context.Provider value={value}>
      {children}
      {loginModalOpen && (
        <LoginModal
          onClose={() => setLoginModalOpen(false)}
          onLogin={login}
        />
      )}
    </OAuth3Context.Provider>
  );
}

// Login Modal Component
function LoginModal({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (provider: OAuth3Provider) => Promise<void>;
}) {
  const providers: { id: OAuth3Provider; name: string; icon: string }[] = [
    { id: "wallet", name: "Wallet", icon: "🔗" },
    { id: "google", name: "Google", icon: "🔵" },
    { id: "github", name: "GitHub", icon: "⚫" },
    { id: "discord", name: "Discord", icon: "💬" },
    { id: "twitter", name: "Twitter", icon: "🐦" },
    { id: "farcaster", name: "Farcaster", icon: "🟣" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Sign In</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => onLogin(provider.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-white"
            >
              <span className="text-2xl">{provider.icon}</span>
              <span>Continue with {provider.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Powered by OAuth3 • Decentralized Identity
        </p>
      </div>
    </div>
  );
}

// Auth wrapper for post-login logic
export function OAuth3AuthWrapper({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = useOAuth3();
  const migrationAttemptedRef = React.useRef(false);

  useEffect(() => {
    if (ready && authenticated && user && !migrationAttemptedRef.current) {
      migrationAttemptedRef.current = true;

      // Check for anonymous session to migrate
      const sessionToken = localStorage.getItem("eliza-anon-session-token");
      const hasAnonCookie = document.cookie.includes("eliza-anon-session");

      if (sessionToken || hasAnonCookie) {
        const attemptMigration = async () => {
          try {
            const accessToken = await getAccessToken();

            const response = await fetch("/api/auth/migrate-anonymous", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
              },
              body: JSON.stringify({ sessionToken }),
            });

            const data = await response.json();

            if (data.success && data.migrated) {
              localStorage.removeItem("eliza-anon-session-token");
              window.dispatchEvent(new CustomEvent("anonymous-session-migrated"));
              
              // Reload if on chat/dashboard pages
              const currentPath = window.location.pathname;
              if (
                currentPath.startsWith("/chat/") ||
                currentPath.includes("/my-agents") ||
                currentPath.includes("/dashboard")
              ) {
                setTimeout(() => window.location.reload(), 500);
              }
            }
          } catch (error) {
            console.error("[OAuth3] Migration failed:", error);
          }
        };

        setTimeout(() => attemptMigration(), 500);
      }
    }
  }, [ready, authenticated, user, getAccessToken]);

  return children;
}

