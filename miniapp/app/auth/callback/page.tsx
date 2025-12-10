"use client";

import { AlertCircle, CheckCircle2, Gift, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  clearPendingReferralCode,
  getPendingReferralCode,
} from "@/components/referral-capture";
import { applyReferralCode } from "@/lib/cloud-api";
import { getCloudUrl } from "@/lib/cloud-url";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [referralBonus, setReferralBonus] = useState<number | null>(null);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;

    async function handleCallback() {
      // Check if we already have a token (from a previous call or HMR)
      const existingToken = localStorage.getItem("miniapp_auth_token");
      if (existingToken) {
        setStatus("success");
        setTimeout(() => {
          router.push("/chats");
        }, 500);
        return;
      }

      if (!sessionId) {
        setStatus("error");
        setErrorMessage("Missing session ID");
        return;
      }

      try {
        const cloudUrl = getCloudUrl();

        // Poll the Cloud API for the auth token
        const response = await fetch(
          `${cloudUrl}/api/auth/miniapp-session/${sessionId}`,
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to get auth token");
        }

        const data = await response.json();

        console.log("[Auth Callback] Received data:", {
          status: data.status,
          hasAuthToken: !!data.authToken,
          tokenPrefix: data.authToken?.slice(0, 20),
          userId: data.userId,
          orgId: data.organizationId,
        });

        if (data.status === "authenticated" && data.authToken) {
          console.log("[Auth Callback] Storing token in localStorage...");
          // Store the auth token
          localStorage.setItem("miniapp_auth_token", data.authToken);
          localStorage.setItem("miniapp_user_id", data.userId);
          localStorage.setItem("miniapp_org_id", data.organizationId);

          // Verify it was stored
          console.log("[Auth Callback] Verification:", {
            storedToken: localStorage
              .getItem("miniapp_auth_token")
              ?.slice(0, 20),
            storedUserId: localStorage.getItem("miniapp_user_id"),
          });

          // Dispatch a custom event to notify other components
          window.dispatchEvent(new Event("miniapp_auth_changed"));

          // Apply pending referral code if any
          const pendingCode = getPendingReferralCode();
          let bonusReceived = false;
          if (pendingCode) {
            const result = await applyReferralCode(pendingCode);
            if (result.success && result.bonusAmount) {
              setReferralBonus(result.bonusAmount);
              bonusReceived = true;
            }
            clearPendingReferralCode();
          }

          setStatus("success");

          // Redirect to the chats page after a brief delay (longer if showing bonus)
          setTimeout(
            () => {
              router.push("/chats");
            },
            bonusReceived ? 2500 : 1000,
          );
        } else if (data.status === "authenticated" && !data.authToken) {
          console.log(
            "[Auth Callback] Token already retrieved, checking localStorage...",
          );
          // Token was already retrieved (possibly by a previous request)
          // Check if we have it in localStorage
          const storedToken = localStorage.getItem("miniapp_auth_token");
          if (storedToken) {
            console.log(
              "[Auth Callback] Found token in localStorage, redirecting...",
            );
            setStatus("success");
            setTimeout(() => {
              router.push("/chats");
            }, 500);
          } else {
            console.error(
              "[Auth Callback] Token already retrieved but not in localStorage!",
            );
            throw new Error(
              "Token already retrieved. Please try signing in again.",
            );
          }
        } else if (data.status === "pending" || retryCount < maxRetries) {
          console.log("[Auth Callback] Status pending, retrying...", {
            status: data.status,
            retryCount,
          });
          // Keep polling - also retry if status is unexpected
          retryCount++;
          setTimeout(handleCallback, 1000);
        } else {
          console.error("[Auth Callback] Authentication not completed", {
            status: data.status,
          });
          throw new Error("Authentication not completed");
        }
      } catch (error) {
        // Before showing error, check localStorage one more time
        const storedToken = localStorage.getItem("miniapp_auth_token");
        if (storedToken) {
          setStatus("success");
          setTimeout(() => {
            router.push("/chats");
          }, 500);
          return;
        }

        console.error("Auth callback error:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Authentication failed",
        );
      }
    }

    handleCallback();
  }, [sessionId, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050109] p-4">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="bg-brand/20 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Loader2 className="text-brand-400 h-6 w-6 animate-spin" />
          </div>
          <h1 className="text-xl font-bold text-white">
            Completing Sign In...
          </h1>
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
          {referralBonus ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
              <Gift className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">
                You received {Math.round(referralBonus * 100).toLocaleString()}{" "}
                bonus credits!
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/60">
              Redirecting you to your friends...
            </p>
          )}
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
          className="bg-brand hover:bg-brand-600 mt-6 rounded-lg px-6 py-2 text-sm font-medium text-white"
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
            <Loader2 className="text-brand-400 mx-auto h-8 w-8 animate-spin" />
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
