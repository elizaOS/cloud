"use client";

import { StewardLogin, useAuth } from "@stwd/react";
import "@stwd/react/styles.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

function getSafeReturnTo(searchParams: { get(name: string): string | null }): string {
  const returnTo = searchParams.get("returnTo");
  return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard/milady";
}

export default function StewardLoginSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  // Redirect in useEffect (not during render)
  useEffect(() => {
    if (isAuthenticated) {
      const redirectUrl = getSafeReturnTo(searchParams);
      router.replace(redirectUrl);
    }
  }, [isAuthenticated, router, searchParams]);

  // Show login form regardless of auth state
  // (StewardLogin hides itself when auth'd, but we want to show
  // a loading/redirect state instead of an empty card)
  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF5800] border-t-transparent" />
        <p className="text-sm text-neutral-400">Redirecting to dashboard...</p>
      </div>
    );
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
