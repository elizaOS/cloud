"use client";

import { Alert, AlertDescription } from "@elizaos/cloud-ui";
import { StewardAuth } from "@stwd/sdk";
import { AlertCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const STEWARD_API_URL = process.env.NEXT_PUBLIC_STEWARD_API_URL || "https://eliza.steward.fi";
const STEWARD_TENANT_ID = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID || "elizacloud";

type AuthStep = "idle" | "loading" | "email-sent" | "success";
type Provider = "passkey" | "email" | "google" | "discord" | "twitter";

// Human-readable copy for callback failure reason codes returned by the
// steward email/oauth callback. Unknown codes fall through to a generic
// message (see CALLBACK_UNKNOWN_MESSAGE below).
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

export default function StewardLoginSection() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const auth = useMemo(
    () => new StewardAuth({ baseUrl: STEWARD_API_URL, tenantId: STEWARD_TENANT_ID }),
    [],
  );

  const emailInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<AuthStep>("idle");
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, boolean>>({});

  const setSessionCookie = useCallback(async (token: string, refreshToken?: string | null) => {
    await fetch("/api/auth/steward-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        refreshToken:
          refreshToken ??
          (typeof window !== "undefined" ? localStorage.getItem("steward_refresh_token") : null),
      }),
    });
  }, []);

  // Fetch available providers on mount
  useEffect(() => {
    auth
      .getProviders()
      .then((p) => {
        setProviders(p as any);
      })
      .catch(() => {});
  }, [auth]);

  // Handle OAuth callback: steward redirects back to /login with token+refreshToken
  // in query params. We store them in localStorage (same keys the SDK uses) and
  // redirect to the dashboard.
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

    setSessionCookie(token, refreshToken).then(() => {
      // Strip the tokens from the URL before redirecting
      window.location.href = getSafeReturnTo(searchParams);
    });
  }, [searchParams, setSessionCookie]);

  // Check if already authenticated (e.g. page refresh while logged in), or
  // if we can recover a session via the refresh token. This is the common
  // path for "came back from lunch, server middleware redirected me to
  // /login because the 15-min access token expired" — we still have a
  // 30-day refresh token in localStorage, try that before showing login UI.
  useEffect(() => {
    // Skip if we're processing an OAuth callback (handled above)
    if (searchParams.get("token")) return;
    // Skip if there's a callback error, let the user see it and retry
    if (searchParams.get("error")) return;

    let cancelled = false;

    const tryRecoverSession = async () => {
      // Fast path: SDK already has a valid (non-expired) session in memory.
      const session = auth.getSession();
      if (session?.token) {
        await setSessionCookie(session.token);
        if (!cancelled) window.location.href = getSafeReturnTo(searchParams);
        return;
      }

      // Slow path: access token expired/missing but refresh token may still
      // be good. Try refreshing — if it works, we can bounce the user back
      // to their original destination without making them sign in again.
      try {
        const refreshed = await auth.refreshSession();
        if (cancelled) return;
        if (refreshed?.token) {
          await setSessionCookie(refreshed.token);
          if (!cancelled) window.location.href = getSafeReturnTo(searchParams);
        }
      } catch {
        // No-op — refresh failed (no refresh token, or refresh token invalid).
        // Fall through to the regular login UI.
      }
    };

    void tryRecoverSession();

    return () => {
      cancelled = true;
    };
  }, [auth, searchParams, setSessionCookie]);

  // Handle failed callback: steward (or oauth) redirects back with
  // ?error=...&reason=... on failure. Show a friendly inline banner, then
  // strip the error params from the URL so a refresh doesn't re-show it.
  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode) return;

    const reason = searchParams.get("reason");
    const message = (reason && CALLBACK_REASON_MESSAGES[reason]) || CALLBACK_UNKNOWN_MESSAGE;
    setCallbackError(message);

    // Nice touch: if this was an email-link failure, they'll likely want to
    // type their address again and retry.
    if (errorCode === "email_auth_failed") {
      emailInputRef.current?.focus();
    }

    // Strip error + reason from the URL without triggering a full reload,
    // matching how the success path cleans token/refreshToken.
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

  async function handleOAuth(provider: string) {
    setLoading(provider as Provider);
    setError(null);
    // Use the server-side redirect flow: steward does the full OAuth exchange
    // and redirects back with token/refreshToken query params. We don't use the
    // SDK's popup flow because it expects the client to do the code exchange.
    const redirectUri = `${window.location.origin}/login`;
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      tenantId: STEWARD_TENANT_ID,
    });
    window.location.href = `${STEWARD_API_URL}/auth/oauth/${provider}/authorize?${params.toString()}`;
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
      <div className="space-y-4 text-center py-4">
        <p className="text-white">
          Magic link sent to <strong>{email}</strong>
        </p>
        <p className="text-sm text-neutral-400">Check your inbox and click the link to sign in.</p>
        <button
          type="button"
          className="text-sm text-neutral-500 hover:text-white transition-colors"
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
      {/* Callback error banner (from failed email/oauth redirect) */}
      {callbackError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{callbackError}</AlertDescription>
        </Alert>
      )}

      {/* Email input */}
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
        className="w-full rounded-lg bg-black/40 border border-white/10 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50 focus:border-[#FF5800]/50 disabled:opacity-50"
        autoComplete="email webauthn"
      />

      {/* Primary actions */}
      <div className="flex gap-2">
        {providers.passkey !== false && (
          <button
            type="button"
            onClick={handlePasskey}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#FF5800] text-white py-3 px-4 font-medium hover:bg-[#FF5800]/90 disabled:opacity-50 transition-colors"
          >
            {loading === "passkey" ? <Spinner /> : <PasskeyIcon />} Passkey
          </button>
        )}
        {providers.email !== false && (
          <button
            type="button"
            onClick={handleEmail}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 text-white py-3 px-4 font-medium hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {loading === "email" ? <Spinner /> : <EmailIcon />} Magic Link
          </button>
        )}
      </div>

      {/* OAuth divider */}
      {(providers.google || providers.discord || (providers as any).oauth?.length > 0) && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-neutral-500">or continue with</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      )}

      {/* OAuth buttons */}
      <div className="grid grid-cols-2 gap-2">
        {providers.google && (
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 text-white py-2.5 px-4 text-sm hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {loading === "google" ? <Spinner /> : <GoogleIcon />} Google
          </button>
        )}
        {providers.discord && (
          <button
            type="button"
            onClick={() => handleOAuth("discord")}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 text-white py-2.5 px-4 text-sm hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {loading === "discord" ? <Spinner /> : <DiscordIcon />} Discord
          </button>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
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
