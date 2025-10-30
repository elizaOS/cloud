"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { BillingPageClient } from "./billing-page-client";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CreditPack } from "@/lib/types";

interface BillingPageWrapperProps {
  creditPacks: CreditPack[];
  currentCredits: number;
  canceled?: string;
}

export function BillingPageWrapper({
  creditPacks,
  currentCredits,
  canceled,
}: BillingPageWrapperProps) {
  useSetPageHeader({
    title: "Billing & Balance",
    description: "Add funds to power your AI generations",
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {canceled && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Payment Canceled</AlertTitle>
          <AlertDescription>
            Your payment was canceled. No charges were made.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How Billing Works</AlertTitle>
        <AlertDescription>
          You are charged for all AI operations including text generation, image
          creation, and video rendering. Add funds in bulk to get better rates.
          Your balance never expires and is shared across your organization.
        </AlertDescription>
      </Alert>

      <BillingPageClient
        creditPacks={creditPacks}
        currentCredits={currentCredits}
      />
    </div>
  );
}
