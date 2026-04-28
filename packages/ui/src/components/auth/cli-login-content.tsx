"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@elizaos/cloud-ui";
import { AlertCircle, CheckCircle2, Loader2, Terminal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionAuth } from "@/lib/hooks/use-session-auth";

type Status =
  | "initializing"
  | "loading"
  | "waiting_auth"
  | "completing"
  | "success"
  | "error";

/**
 * CLI / desktop-app login bridge.
 *
 * The local Milady runtime (or any Eliza CLI) opens this page in a browser to
 * mint an API key against the user's Eliza Cloud account. The flow:
 *
 *   1. CLI POSTs /api/auth/cli-session, gets a sessionId, opens this page with
 *      ?session=<id>.
 *   2. This page waits for the browser session to be authenticated (Steward
 *      preferred; Privy is only relevant in legacy / non-steward setups).
 *   3. Once authed, POST /api/auth/cli-session/<id>/complete to mint the key
 *      and persist it server-side. The CLI is polling /api/auth/cli-session/<id>
 *      and picks the key up from there.
 *
 * Auth source: this page must NOT call usePrivy() directly. In steward-only
 * setups (NEXT_PUBLIC_STEWARD_AUTH_ENABLED=true) Privy is a stub provider
 * whose `ready` flag never resolves, which previously left this page hanging
 * forever on "Preparing authentication". useSessionAuth() abstracts both
 * providers and reports `ready` correctly in either configuration.
 */
export function CliLoginContent() {
  const { ready, authenticated } = useSessionAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  // Compute the initial status. Order matters:
  //   - missing sessionId: terminal error, no point initializing.
  //   - !ready: wait for the session-auth hook to settle. We render a
  //     fallback spinner; we do NOT trust `authenticated` while !ready.
  //   - !authenticated: send the user to /login (Steward or Privy, whichever
  //     is configured). Don't try to reuse a stale cached session here.
  //   - authed: proceed to complete the CLI auth.
  const initialStatus = useMemo<{ status: Status; errorMessage: string }>(() => {
    if (!sessionId) {
      return {
        status: "error",
        errorMessage: "Invalid authentication link. Missing session ID.",
      };
    }
    if (!ready) {
      return { status: "initializing", errorMessage: "" };
    }
    if (!authenticated) {
      return { status: "waiting_auth", errorMessage: "" };
    }
    return { status: "loading", errorMessage: "" };
  }, [sessionId, ready, authenticated]);

  const [status, setStatus] = useState<Status>(initialStatus.status);
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
        setStatus("error");
        setErrorMessage(
          errorData.error || "Failed to complete authentication",
        );
        return;
      }

      const data = await response.json();

      setApiKeyPrefix(data.keyPrefix);
      setStatus("success");
    } catch (error) {
      console.error("CLI login error:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Network error. Please try again.",
      );
    }
  }, [sessionId]);

  // Sync status to initialStatus when prop-derived state changes, BUT preserve
  // states that represent in-flight progress or terminal user-facing outcomes:
  //   - "completing" / "success": process progress, must not be reset.
  //   - "error": a real failure surfaced to the user. Without this guard, an
  //     auth-failure setStatus("error") gets immediately clobbered back to
  //     "loading" by the next sync, the second effect re-fires the same
  //     failing /complete request, and the page is stuck on "Preparing
  //     authentication" forever with no way out.
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

  // Once auth is settled and the user is authenticated, complete the CLI
  // session by minting the API key.
  useEffect(() => {
    if (initialStatus.status === "loading" && authenticated && sessionId) {
      const timer = setTimeout(() => {
        completeCliLogin();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialStatus.status, authenticated, sessionId, completeCliLogin]);

  /** Send the user to the canonical /login page, preserving returnTo so they
   *  land back here after Steward (or Privy) sign-in completes. */
  const goToLogin = useCallback(() => {
    if (!sessionId) return;
    const returnTo = `/auth/cli-login?session=${encodeURIComponent(sessionId)}`;
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [router, sessionId]);

  if (status === "initializing") {
    return <CliLoginFallback />;
  }

  if (status === "loading" || status === "completing") {
    const isCompleting = status === "completing";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <CardTitle>
              {isCompleting ? "Generating API Key" : "Loading..."}
            </CardTitle>
            <CardDescription>
              {isCompleting
                ? "Creating your credentials for CLI access..."
                : "Preparing authentication"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Authentication Error</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessionId ? (
              <Button onClick={goToLogin} className="w-full">
                Sign In Again
              </Button>
            ) : null}
            <Button
              onClick={() => window.close()}
              variant="outline"
              className="w-full"
            >
              Close Window
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "waiting_auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>CLI Authentication</CardTitle>
            <CardDescription>
              Sign in to connect your Eliza app or CLI to Eliza Cloud
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={goToLogin} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle>Authentication Complete!</CardTitle>
            <CardDescription>
              Your API key has been generated and sent to the CLI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium mb-2">API Key Details:</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">Prefix:</span> {apiKeyPrefix}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <p className="text-sm text-center">
                ✓ You can now close this window and return to your terminal
              </p>
            </div>

            <Button
              onClick={() => window.close()}
              variant="outline"
              className="w-full"
            >
              Close Window
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

export function CliLoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <CardTitle>Loading...</CardTitle>
          <CardDescription>Initializing authentication</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
