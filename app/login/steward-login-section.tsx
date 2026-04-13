"use client";

import { StewardLogin, StewardProvider, useAuth } from "@stwd/react";
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

function setSessionCookie(token: string): Promise<void> {
  return fetch("/api/auth/steward-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).then(() => {});
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, getToken } = useAuth();
  const didSetCookie = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !didSetCookie.current) {
      didSetCookie.current = true;
      const token = getToken();
      if (token) {
        setSessionCookie(token)
          .then(() => router.replace(getSafeReturnTo(searchParams)))
          .catch(() => router.replace(getSafeReturnTo(searchParams)));
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
        setSessionCookie(token)
          .then(() => router.replace(getSafeReturnTo(searchParams)))
          .catch(() => router.replace(getSafeReturnTo(searchParams)));
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
      >
        <LoginContent />
      </StewardProvider>
    </div>
  );
}
