"use client";

import { StewardLogin, StewardProvider } from "@stwd/react";
import "@stwd/react/styles.css";
import { StewardClient } from "@stwd/sdk";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

const STEWARD_API_URL =
  process.env.NEXT_PUBLIC_STEWARD_API_URL || "https://eliza.steward.fi";
const STEWARD_TENANT_ID =
  process.env.NEXT_PUBLIC_STEWARD_TENANT_ID || undefined;

function getSafeReturnTo(searchParams: { get(name: string): string | null }): string {
  const returnTo = searchParams.get("returnTo");
  return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard/milady";
}

/**
 * Inner component that handles auth state and redirect.
 * Must be INSIDE StewardProvider to use useAuth from the correct context.
 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, getToken } = (
    require("@stwd/react") as typeof import("@stwd/react")
  ).useAuth();
  const didSetCookie = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !didSetCookie.current) {
      didSetCookie.current = true;
      const token = getToken();
      if (token) {
        // Set server-side cookie, then redirect
        fetch("/api/auth/steward-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
          .then(() => {
            const redirectUrl = getSafeReturnTo(searchParams);
            router.replace(redirectUrl);
          })
          .catch(() => {
            router.replace(getSafeReturnTo(searchParams));
          });
      }
    }
  }, [isAuthenticated, getToken, router, searchParams]);

  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF5800] border-t-transparent" />
        <p className="text-sm text-neutral-400">Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <StewardLogin
      variant="inline"
      showPasskey
      showEmail
      showGoogle
      showDiscord
      showSIWE
      onSuccess={({ token }) => {
        toast.success("Signed in!");
        // Set cookie then redirect
        fetch("/api/auth/steward-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
          .then(() => {
            const redirectUrl = getSafeReturnTo(searchParams);
            router.replace(redirectUrl);
          })
          .catch(() => {
            router.replace(getSafeReturnTo(searchParams));
          });
      }}
      onError={(err) => {
        toast.error(err?.message || "Login failed");
      }}
    />
  );
}

export default function StewardLoginSection() {
  const client = useMemo(
    () => new StewardClient({ baseUrl: STEWARD_API_URL }),
    [],
  );

  return (
    <div className="stwd-eliza-login">
      <StewardProvider
        client={client as any}
        agentId=""
        auth={{ baseUrl: STEWARD_API_URL }}
        tenantId={STEWARD_TENANT_ID || undefined}
        theme={{
          primaryColor: "#FF5800",
          accentColor: "#FF8A4C",
          backgroundColor: "#0a0a0a",
          surfaceColor: "#171717",
          textColor: "#fafafa",
          mutedColor: "#737373",
          successColor: "#22c55e",
          errorColor: "#ef4444",
          warningColor: "#f59e0b",
          borderRadius: 12,
          colorScheme: "dark" as const,
        }}
      >
        <LoginContent />
      </StewardProvider>
    </div>
  );
}
