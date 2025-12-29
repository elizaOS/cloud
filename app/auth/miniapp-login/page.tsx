"use client";

import {
  useEffect,
  useState,
  useCallback,
  Suspense,
  useMemo,
  useRef,
} from "react";
import { useSearchParams } from "next/navigation";
import { usePrivy } from "@/lib/providers/PrivyProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Status =
  | "loading"
  | "waiting_auth"
  | "completing"
  | "redirecting"
  | "error";

function MiniappLoginContent() {
  const { authenticated, login, ready } = usePrivy();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  // Compute initial status from props to avoid setState in effect
  const initialStatus = useMemo(() => {
    if (!sessionId) {
      return {
        status: "error" as const,
        errorMessage: "Invalid authentication link. Missing session ID.",
      };
    }
    if (!authenticated) {
      return { status: "waiting_auth" as const, errorMessage: "" };
    }
    return { status: "loading" as const, errorMessage: "" };
  }, [sessionId, authenticated]);

  const [status, setStatus] = useState<Status>(initialStatus.status);
  const [errorMessage, setErrorMessage] = useState(initialStatus.errorMessage);

  // Track if login has been triggered to prevent infinite loop
  const loginTriggeredRef = useRef(false);

  const completeLogin = useCallback(async () => {
    if (!sessionId) {
      setStatus("error");
      setErrorMessage("Session ID is missing");
      return;
    }

    setStatus("completing");

    try {
      const response = await fetch(
        `/api/auth/miniapp-session/${sessionId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to complete authentication");
      }

      const data = await response.json();
      setStatus("redirecting");

      // Build callback URL and redirect
      const callbackUrl = new URL(data.callbackUrl);
      callbackUrl.searchParams.set("session", sessionId);
      window.location.href = callbackUrl.toString();
    } catch (error) {
      console.error("Error completing miniapp login:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to complete authentication",
      );
    }
  }, [sessionId]);

  // Update status when props change (avoiding synchronous setState)
  useEffect(() => {
    // Don't override "completing" or "redirecting" states - they represent process progress
    // that shouldn't be reset by initial status changes
    if (status === "completing" || status === "redirecting") {
      return;
    }

    const nextStatus = initialStatus.status;
    const nextErrorMessage = initialStatus.errorMessage;

    // Only update if status changed to avoid unnecessary renders
    if (status !== nextStatus || errorMessage !== nextErrorMessage) {
      // Use setTimeout to avoid synchronous setState in effect
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
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        completeLogin();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialStatus.status, authenticated, sessionId, completeLogin]);

  // Auto-trigger login when ready and waiting for auth
  // Use ref to ensure login is only called once to prevent infinite loop
  useEffect(() => {
    // Reset flag when authenticated (early return prevents race condition)
    if (authenticated) {
      loginTriggeredRef.current = false;
      return;
    }

    // Trigger login when conditions are met
    if (status === "waiting_auth" && ready && !loginTriggeredRef.current) {
      loginTriggeredRef.current = true;
      login();
    }
  }, [status, ready, authenticated, login]);

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <CardTitle>Loading...</CardTitle>
            <CardDescription>Preparing authentication</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Error state
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
          <CardContent>
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

  // Waiting for auth - auto-triggering login
  if (status === "waiting_auth") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <CardTitle>Connecting...</CardTitle>
            <CardDescription>Opening sign in</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Completing auth
  if (status === "completing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <CardTitle>Logging In...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Redirecting
  if (status === "redirecting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle>Authentication Complete!</CardTitle>
            <CardDescription>
              Redirecting you back to the app...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

export default function MiniappLoginPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <MiniappLoginContent />
    </Suspense>
  );
}
