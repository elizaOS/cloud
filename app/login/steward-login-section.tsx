"use client";

import { StewardLogin, StewardProvider } from "@stwd/react";
import { StewardClient } from "@stwd/sdk";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function StewardLoginSection() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="space-y-4">
      <StewardProvider
        client={new StewardClient({ baseUrl: STEWARD_AUTH_BASE_URL }) as any} // Type mismatch: workspace vs npm resolution
        agentId=""
        auth={{ baseUrl: STEWARD_AUTH_BASE_URL }}
        tenantId={STEWARD_TENANT_ID || undefined}
      >
        <StewardLogin
          variant="inline"
          showPasskey
          showEmail
          title="Sign in with Steward"
          onSuccess={() => {
            toast.success("Signed in with Steward!");
            const redirectUrl = getSafeReturnTo(searchParams);
            router.replace(redirectUrl);
          }}
          onError={(err) => {
            toast.error(err?.message || "Steward login failed");
          }}
        />
      </StewardProvider>
    </div>
  );
}
