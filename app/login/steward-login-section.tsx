"use client";

import { StewardLogin, useAuth } from "@stwd/react";
import "@stwd/react/styles.css";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function getSafeReturnTo(searchParams: { get(name: string): string | null }): string {
  const returnTo = searchParams.get("returnTo");
  return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard/milady";
}

/**
 * Steward-powered login section for the Eliza Cloud login page.
 *
 * Uses the StewardProvider from the root layout (no duplicate provider).
 * Enables all available auth methods: passkey, email, Google, Discord, SIWE.
 */
export default function StewardLoginSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  // If already authenticated, redirect immediately
  if (isAuthenticated) {
    const redirectUrl = getSafeReturnTo(searchParams);
    router.replace(redirectUrl);
    return null;
  }

  return (
    <div className="stwd-eliza-login">
      <StewardLogin
        variant="inline"
        showPasskey
        showEmail
        showGoogle
        showDiscord
        showSIWE
        onSuccess={() => {
          toast.success("Signed in!");
          const redirectUrl = getSafeReturnTo(searchParams);
          router.replace(redirectUrl);
        }}
        onError={(err) => {
          toast.error(err?.message || "Login failed");
        }}
      />
    </div>
  );
}
