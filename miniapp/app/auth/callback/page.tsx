"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const CLOUD_URL = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || "http://localhost:3000";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;

    async function handleCallback() {
      // Check if we already have a token (from a previous call or HMR)
      const existingToken = localStorage.getItem("miniapp_auth_token");
      if (existingToken) {
        console.log("[Auth Callback] Token already exists, redirecting...");
        setStatus("success");
        setTimeout(() => {
          router.push("/agents");
        }, 500);
        return;
      }

      if (!sessionId) {
        setStatus("error");
        setErrorMessage("Missing session ID");
        return;
      }

      try {
        // Poll the Cloud API for the auth token
        const response = await fetch(
          `${CLOUD_URL}/api/auth/miniapp-session/${sessionId}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to get auth token");
        }

        const data = await response.json();

        if (data.status === "authenticated" && data.authToken) {
          // Store the auth token
          localStorage.setItem("miniapp_auth_token", data.authToken);
          localStorage.setItem("miniapp_user_id", data.userId);
          localStorage.setItem("miniapp_org_id", data.organizationId);

          // Dispatch a custom event to notify other components
          window.dispatchEvent(new Event("miniapp_auth_changed"));

          setStatus("success");

          // Redirect to the agents page after a brief delay
          setTimeout(() => {
            router.push("/agents");
          }, 1000);
        } else if (data.status === "authenticated" && !data.authToken) {
          // Token was already retrieved (possibly by a previous request)
          // Check if we have it in localStorage
          const storedToken = localStorage.getItem("miniapp_auth_token");
          if (storedToken) {
            setStatus("success");
            setTimeout(() => {
              router.push("/agents");
            }, 500);
          } else {
            throw new Error("Token already retrieved. Please try signing in again.");
          }
        } else if (data.status === "pending" || retryCount < maxRetries) {
          // Keep polling - also retry if status is unexpected
          retryCount++;
          setTimeout(handleCallback, 1000);
        } else {
          throw new Error("Authentication not completed");
        }
      } catch (error) {
        // Before showing error, check localStorage one more time
        const storedToken = localStorage.getItem("miniapp_auth_token");
        if (storedToken) {
          setStatus("success");
          setTimeout(() => {
            router.push("/agents");
          }, 500);
          return;
        }

        console.error("Auth callback error:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Authentication failed"
        );
      }
    }

    handleCallback();
  }, [sessionId, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/20">
            <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Completing Sign In...</h1>
          <p className="mt-2 text-sm text-white/60">
            Please wait while we set up your session
          </p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-6 w-6 text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Sign In Successful!</h1>
          <p className="mt-2 text-sm text-white/60">
            Redirecting you to your agents...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
          <AlertCircle className="h-6 w-6 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Sign In Failed</h1>
        <p className="mt-2 text-sm text-white/60">{errorMessage}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-lg bg-pink-500 px-6 py-2 text-sm font-medium text-white hover:bg-pink-600"
        >
          Go Back Home
        </button>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-pink-400" />
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}

