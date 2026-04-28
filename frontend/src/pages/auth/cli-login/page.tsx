import { Button } from "@elizaos/cloud-ui/components/button";
import { AlertCircle, CheckCircle2, Key, Loader2, Terminal } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";
import { clearStaleStewardSession } from "@/lib/providers/StewardProvider";

function CliLoginContent() {
  const { authenticated, ready, user } = useSessionAuth();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  // Compute initial status from props to avoid setState in effect.
  //
  // Order matters:
  //   - missing sessionId: terminal error.
  //   - !ready: useSessionAuth hasn't settled yet. We MUST gate on `ready`
  //     here. Without it, a stale Steward (or Privy) session in
  //     localStorage briefly makes `authenticated` look true before the
  //     hook resolves, the page jumps to "loading", POSTs /complete,
  //     server rejects 401 because the cookie is missing/revoked, the
  //     sync effect below clobbers the error back to "loading", the
  //     completion effect re-fires the same failing request, and the
  //     user is stuck on "Preparing authentication" forever with no way
  //     to recover.
  //   - !authenticated: send the user to /login (Steward or Privy).
  //   - authenticated: proceed to mint the API key.
  const initialStatus = useMemo(() => {
    if (!sessionId) {
      return {
        status: "error" as const,
        errorMessage: "Invalid authentication link. Missing session ID.",
      };
    }
    if (!ready) {
      return { status: "initializing" as const, errorMessage: "" };
    }
    if (!authenticated) {
      return { status: "waiting_auth" as const, errorMessage: "" };
    }
    return { status: "loading" as const, errorMessage: "" };
  }, [sessionId, ready, authenticated]);

  const [status, setStatus] = useState<
    "initializing" | "loading" | "waiting_auth" | "completing" | "success" | "error"
  >(initialStatus.status);
  const [errorMessage, setErrorMessage] = useState<string>(initialStatus.errorMessage);
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string>("");

  const completeCliLogin = useCallback(async () => {
    if (!sessionId) {
      setStatus("error");
      setErrorMessage("Session ID is missing");
      return;
    }

    setStatus("completing");

    try {
      const response = await fetch(`/api/auth/cli-session/${sessionId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // 401 here means the browser session that hit /complete was
        // rejected — almost always because localStorage tokens decode
        // as valid but the server-side cookie/session is stale. Wipe
        // the local state so the "Sign In Again" button below routes
        // through /login from a clean slate instead of immediately
        // re-failing with the same stale token.
        if (response.status === 401) {
          clearStaleStewardSession();
        }
        setStatus("error");
        setErrorMessage(errorData.error || "Failed to complete authentication");
        return;
      }

      const data = await response.json();

      setApiKeyPrefix(data.keyPrefix);
      setStatus("success");

      // Signal the opener window that auth is complete
      try {
        window.opener?.postMessage({ type: "eliza-cloud-auth-complete", sessionId }, "*");
      } catch {
        // opener may not be accessible (cross-origin policy or popup blocker)
      }
    } catch (error) {
      console.error("CLI login error:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Network error. Please try again.");
    }
  }, [sessionId]);

  // Sync status to initialStatus when prop-derived state changes, BUT keep
  // states that represent in-flight progress or terminal user-facing
  // outcomes:
  //   - "completing" / "success": process progress, must not be reset.
  //   - "error": a real failure surfaced to the user (e.g. /complete
  //     returned 401 because the cached session cookie is missing or
  //     revoked). Without preserving this, the catch's setStatus("error")
  //     gets clobbered back to "loading" by this effect, the completion
  //     effect re-fires the same failing request, and the page is stuck
  //     on "Preparing authentication" forever.
  useEffect(() => {
    if (status === "completing" || status === "success" || status === "error") {
      return;
    }

    const nextStatus = initialStatus.status;
    const nextErrorMessage = initialStatus.errorMessage;

    if (status !== nextStatus || errorMessage !== nextErrorMessage) {
      const timer = setTimeout(() => {
        setStatus(nextStatus);
        setErrorMessage(nextErrorMessage);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialStatus.status, initialStatus.errorMessage, status, errorMessage]);

  // Separate effect for completing login when authenticated
  useEffect(() => {
    if (initialStatus.status === "loading" && authenticated && sessionId) {
      const timer = setTimeout(() => {
        completeCliLogin();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialStatus.status, authenticated, sessionId, completeCliLogin]);

  const signInHref = useMemo(() => {
    if (typeof window === "undefined") return "/login";
    const returnTo = `/auth/cli-login${window.location.search}`;
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  // Pull email off the user object defensively — privy + steward user shapes differ
  const userEmail: string | undefined = (() => {
    if (!user) return undefined;
    // steward user
    if ("email" in user && typeof (user as { email?: unknown }).email === "string") {
      return (user as { email: string }).email;
    }
    // privy user
    const privyEmail = (user as { email?: { address?: string } | null })?.email?.address;
    if (typeof privyEmail === "string") return privyEmail;
    return undefined;
  })();

  if (status === "initializing" || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
        <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#FF5800]/10">
              <Loader2 className="h-7 w-7 animate-spin text-[#FF5800]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Loading...</h2>
              <p className="text-sm text-neutral-500">
                {status === "initializing"
                  ? "Initializing authentication"
                  : "Preparing authentication"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
        <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Authentication Error</h2>
              <p className="text-sm text-neutral-500">{errorMessage}</p>
            </div>
            {sessionId ? (
              <a href={signInHref} className="w-full">
                <Button className="w-full h-11 rounded-xl bg-[#FF5800] hover:bg-[#FF5800]/80 text-white">
                  Sign In Again
                </Button>
              </a>
            ) : null}
            <Button
              onClick={() => window.close()}
              variant="outline"
              className="w-full mt-2 rounded-xl border-white/10 hover:bg-white/10"
            >
              Close Window
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "waiting_auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
        <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#FF5800]/10">
              <Terminal className="h-7 w-7 text-[#FF5800]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-white">CLI Authentication</h2>
              <p className="text-sm text-neutral-500">
                Sign in to connect your Eliza app or CLI to Eliza Cloud
              </p>
            </div>
            <a href={signInHref} className="w-full">
              <Button
                className="w-full h-11 rounded-xl bg-[#FF5800] hover:bg-[#FF5800]/80 text-white"
                disabled={!ready}
              >
                {!ready ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "completing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
        <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#FF5800]/10">
              <Key className="h-7 w-7 text-[#FF5800] animate-pulse" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Generating API Key</h2>
              <p className="text-sm text-neutral-500">
                Creating your credentials for CLI access...
              </p>
            </div>
            <div className="flex gap-1.5 mt-2">
              <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.3s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.15s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
        <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-500/10">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Authentication Complete!</h2>
              <p className="text-sm text-neutral-500">
                Your API key has been generated and sent to the CLI
              </p>
            </div>

            <div className="w-full rounded-xl bg-black/40 border border-white/10 p-4 space-y-3">
              <p className="text-xs font-medium text-neutral-400">API Key Details</p>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Prefix</span>
                  <span className="font-mono text-white">{apiKeyPrefix}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Created for</span>
                  <span className="text-white">{userEmail || "Your account"}</span>
                </div>
              </div>
            </div>

            <div className="w-full rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <p className="text-sm text-green-400 flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                You can now close this window and return to your terminal
              </p>
            </div>

            <Button
              onClick={() => window.close()}
              variant="outline"
              className="w-full rounded-xl border-white/10 hover:bg-white/10"
            >
              Close Window
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * CLI login page for authenticating command-line tool users.
 * Uses the shared session auth (Steward + Privy) to detect the active session,
 * then generates an API key for CLI access.
 */
export default function CliLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-neutral-900/50 to-[#0A0A0A]" />
          <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#FF5800]/10">
                <Loader2 className="h-7 w-7 animate-spin text-[#FF5800]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">Loading...</h2>
                <p className="text-sm text-neutral-500">Initializing authentication</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <CliLoginContent />
    </Suspense>
  );
}
