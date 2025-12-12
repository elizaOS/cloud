/**
 * Auth Callback Page
 *
 * Handles the OAuth callback from Eliza Cloud.
 * Receives the token and stores it, then redirects to dashboard.
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeToken } from "@/lib/use-auth";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMessage(error);
      return;
    }

    if (!token) {
      setStatus("error");
      setErrorMessage("No authentication token received");
      return;
    }

    // Store token and redirect
    storeToken(token);
    setStatus("success");

    // Brief delay to show success state
    setTimeout(() => {
      router.replace("/dashboard");
    }, 500);
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h1 className="text-2xl font-semibold">Authenticating...</h1>
            <p className="text-muted-foreground">
              Please wait while we complete your sign-in
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-2xl font-semibold">Success!</h1>
            <p className="text-muted-foreground">
              Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-2xl font-semibold">Authentication Failed</h1>
            <p className="text-muted-foreground">{errorMessage}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Return Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <h1 className="text-2xl font-semibold">Authenticating...</h1>
        <p className="text-muted-foreground">
          Please wait while we complete your sign-in
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
