"use client";

import { StewardLogin, StewardProvider } from "@stwd/react";
import "@stwd/react/dist/styles.css";
import { StewardClient } from "@stwd/sdk";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";

const STEWARD_AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_STEWARD_AUTH_BASE_URL || "https://api.steward.fi";
const STEWARD_TENANT_ID = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID || undefined;

function getSafeReturnTo(searchParams: { get(name: string): string | null }): string {
  const returnTo = searchParams.get("returnTo");
  return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard/milady";
}

/**
 * Steward-powered login section for the Eliza Cloud login page.
 *
 * Renders inline (no card wrapper — the parent page provides the card).
 * Enables all available auth methods: passkey, email magic link, Google, Discord, SIWE.
 * Themed to match Eliza Cloud's dark/orange design via CSS custom property overrides.
 */
export default function StewardLoginSection() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const client = useMemo(
    () => new StewardClient({ baseUrl: STEWARD_AUTH_BASE_URL }),
    [],
  );

  return (
    <div className="stwd-eliza-login">
      <StewardProvider
        client={client as any}
        agentId=""
        auth={{ baseUrl: STEWARD_AUTH_BASE_URL }}
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
      </StewardProvider>
    </div>
  );
}
