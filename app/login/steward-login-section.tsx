"use client";

import { Alert, AlertDescription } from "@elizaos/cloud-ui";
import { type WalletChains, WalletLogin } from "@stwd/react/wallet";
import { StewardAuth } from "@stwd/sdk";
import { AlertCircle, Github } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StewardWalletProviders } from "./steward-wallet-providers";

const STEWARD_API_URL = process.env.NEXT_PUBLIC_STEWARD_API_URL || "https://eliza.steward.fi";

type AuthStep = "idle" | "loading" | "email-sent" | "success";
type Provider = "passkey" | "email" | "google" | "discord" | "github" | "twitter";

const CALLBACK_REASON_MESSAGES: Record<string, string> = {
  invalid_token: "That login link is invalid. Try signing in again.",
  expired_token: "That login link has expired. Request a new one below.",
  email_mismatch: "The link doesn't match the email you entered. Try again.",
  server_error: "Something went wrong on our end. Try again in a moment.",
};
const CALLBACK_UNKNOWN_MESSAGE = "Couldn't complete sign-in. Try again.";

function getSafeReturnTo(sp: { get(n: string): string | null }): string {
  const r = sp.get("returnTo");
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard/milady";
}

function getWalletChains(providers: Record<string, boolean>): WalletChains | null {
  if (providers.siwe && providers.siws) return "both";
  if (providers.siwe) return "evm";
  if (providers.siws) return "solana";
  return null;
}

export default function StewardLoginSection() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const auth = useMemo(
    () => new StewardAuth({ baseUrl: STEWARD_API_URL, tenantId: "elizacloud" }),
    [],
  );

  const emailInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<AuthStep>("idle");
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, boolean>>({});

  const walletChains = useMemo(() => getWalletChains(providers), [providers]);
  const hasOAuthProviders = Boolean(providers.google || providers.discord || providers.github);
  const walletThemeVars: CSSProperties & Record<string, string> = {
    "--stwd-wallet-bg": "rgba(10, 10, 10, 0.92)",
    "--stwd-wallet-surface": "rgba(255, 255, 255, 0.04)",
    "--stwd-wallet-border": "rgba(255, 255, 255, 0.08)",
    "--stwd-wallet-border-hover": "rgba(255, 255, 255, 0.14)",
    "--stwd-wallet-text": "#ffffff",
    "--stwd-wallet-muted": "#a3a3a3",
    "--stwd-wallet-accent": "#FF5800",
    "--stwd-wallet-error": "#f87171",
    "--stwd-wallet-font": "var(--font-geist-mono)",
  };

  const setSessionCookie = useCallback(async (token: string) => {
    await fetch("/api/auth/steward-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  }, []);

  useEffect(() => {
    auth
      .getProviders()
      .then((p) => {
        setProviders(p as unknown as Record<string, boolean>);
      })
      .catch(() => {});
  }, [auth]);

  useEffect(() => {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    if (!token) return;

    try {
      localStorage.setItem("steward_session_token", token);
      if (refreshToken) {
        localStorage.setItem("steward_refresh_token", refreshToken);
      }
    } catch (err) {
      console.warn("[steward] Failed to persist OAuth tokens", err);
    }

    setSessionCookie(token).then(() => {
      window.location.href = getSafeReturnTo(searchParams);
    });
  }, [searchParams, setSessionCookie]);

  useEffect(() => {
    if (searchParams.get("token")) return;
    if (searchParams.get("error")) return;

    let cancelled = false;

    const tryRecoverSession = async () => {
      const session = auth.getSession();
      if (session?.token) {
        await setSessionCookie(session.token);
        if (!cancelled) window.location.href = getSafeReturnTo(searchParams);
        return;
      }

      try {
        const refreshed = await auth.refreshSession();
        if (cancelled) return;
        if (refreshed?.token) {
          await setSessionCookie(refreshed.token);
          if (!cancelled) window.location.href = getSafeReturnTo(searchParams);
        }
      } catch {
        // Keep the regular login UI visible if refresh fails.
      }
    };

    void tryRecoverSession();

    return () => {
      cancelled = true;
    };
  }, [auth, searchParams, setSessionCookie]);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode) return;

    const reason = searchParams.get("reason");
    const message = (reason && CALLBACK_REASON_MESSAGES[reason]) || CALLBACK_UNKNOWN_MESSAGE;
    setCallbackError(message);

    if (errorCode === "email_auth_failed") {
      emailInputRef.current?.focus();
    }

    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("error");
    remaining.delete("reason");
    const qs = remaining.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  async function handleSuccess(token: string) {
    setStep("success");
    toast.success("Signed in!");
    await setSessionCookie(token);
    window.location.href = getSafeReturnTo(searchParams);
  }

  async function handlePasskey() {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setLoading("passkey");
    setError(null);
    try {
      const result = await auth.signInWithPasskey(email.trim());
      await handleSuccess(result.token);
    } catch (e: any) {
      setError(e?.message || "Passkey failed");
      setLoading(null);
    }
  }

  async function handleEmail() {
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setLoading("email");
    setError(null);
    try {
      await auth.signInWithEmail(email.trim());
      setStep("email-sent");
      setLoading(null);
    } catch (e: any) {
      setError(e?.message || "Failed to send");
      setLoading(null);
    }
  }

  async function handleOAuth(provider: Extract<Provider, "google" | "discord" | "github">) {
    setLoading(provider);
    setError(null);

    try {
      const redirectUri = `${window.location.origin}/login`;
      const result = await auth.signInWithOAuth(provider, { redirectUri, tenantId: "elizacloud" });
      await handleSuccess(result.token);
    } catch (e: any) {
      setError(e?.message || `Failed to sign in with ${provider}`);
      setLoading(null);
    }
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF5800] border-t-transparent" />
        <p className="text-sm text-neutral-400">Redirecting to dashboard...</p>
      </div>
    );
  }

  if (step === "email-sent") {
    return (
      <div className="space-y-4 py-4 text-center">
        <p className="text-white">
          Magic link sent to <strong>{email}</strong>
        </p>
        <p className="text-sm text-neutral-400">Check your inbox and click the link to sign in.</p>
        <button
          type="button"
          className="text-sm text-neutral-500 transition-colors hover:text-white"
          onClick={() => {
            setStep("idle");
            setLoading(null);
          }}
        >
          ← Back to login
        </button>
      </div>
    );
  }

  const isLoading = loading !== null;

  return (
    <div className="space-y-4">
      {callbackError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{callbackError}</AlertDescription>
        </Alert>
      )}

      <input
        ref={emailInputRef}
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handlePasskey();
        }}
        disabled={isLoading}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-[#FF5800]/50 focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50 disabled:opacity-50"
        autoComplete="email webauthn"
      />

      <div className="flex gap-2">
        {providers.passkey !== false && (
          <button
            type="button"
            onClick={handlePasskey}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF5800] px-4 py-3 font-medium text-white transition-colors hover:bg-[#FF5800]/90 disabled:opacity-50"
          >
            {loading === "passkey" ? <Spinner /> : <PasskeyIcon />} Passkey
          </button>
        )}
        {providers.email !== false && (
          <button
            type="button"
            onClick={handleEmail}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {loading === "email" ? <Spinner /> : <EmailIcon />} Magic Link
          </button>
        )}
      </div>

      {hasOAuthProviders && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-neutral-500">or continue with</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      )}

      {hasOAuthProviders && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {providers.google && (
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {loading === "google" ? <Spinner /> : <GoogleIcon />} Google
            </button>
          )}
          {providers.discord && (
            <button
              type="button"
              onClick={() => handleOAuth("discord")}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {loading === "discord" ? <Spinner /> : <DiscordIcon />} Discord
            </button>
          )}
          {providers.github && (
            <button
              type="button"
              onClick={() => handleOAuth("github")}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-50 sm:col-span-2"
            >
              {loading === "github" ? <Spinner /> : <Github className="h-4 w-4" />} GitHub
            </button>
          )}
        </div>
      )}

      {walletChains && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-neutral-500">or sign in with a wallet</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <StewardWalletProviders>
            <div
              className="rounded-xl border border-white/10 bg-black/30 p-3"
              style={walletThemeVars}
            >
              <WalletLogin
                chains={walletChains}
                onSuccess={(result) => {
                  void handleSuccess(result.token);
                }}
                onError={(walletError) => {
                  setError(walletError.message || "Wallet sign-in failed");
                }}
                evmLabel="Ethereum"
                solanaLabel="Solana"
                className="w-full"
              />
            </div>
          </StewardWalletProviders>
        </>
      )}

      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
