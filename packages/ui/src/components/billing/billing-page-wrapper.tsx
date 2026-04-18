"use client";

import { useSetPageHeader } from "@elizaos/cloud-ui";
import type { UserWithOrganization } from "@/lib/types";
import { BillingTab } from "@/packages/ui/src/components/settings/tabs/billing-tab";

interface BillingPageWrapperProps {
  user: UserWithOrganization;
  canceled?: string;
}

export function BillingPageWrapper({ user, canceled }: BillingPageWrapperProps) {
  useSetPageHeader({
    title: "Billing",
  });

  return (
    <div className="max-w-7xl mx-auto">
      {canceled && (
        <div className="mb-4 border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          Payment canceled. No charges were made.
        </div>
      )}
      <BillingTab user={user} />
    </div>
  );
}
